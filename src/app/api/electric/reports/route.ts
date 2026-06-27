import { NextRequest, NextResponse } from "next/server";
import { toRecordDate } from "@/lib/energy-record";
import { prisma } from "@/lib/prisma";

function dateKey(date: Date, groupBy: string) {
  const iso = date.toISOString().slice(0, 10);
  return groupBy === "month" ? iso.slice(0, 7) : iso;
}

function toUnitId(value: string | null) {
  const id = Number(value || 0);
  return id || null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate") || searchParams.get("from");
  const endDate = searchParams.get("endDate") || searchParams.get("to");
  const groupBy = searchParams.get("groupBy") === "month" ? "month" : "day";
  const factoryId = searchParams.get("factoryId");
  const transformerId = searchParams.get("substationId") || searchParams.get("transformerId");
  const transformerUnitId = toUnitId(searchParams.get("transformerUnitId"));
  const meterGroupId = searchParams.get("meterGroupId") || searchParams.get("groupId");

  const meterWhere = {
    transformerUnitId: transformerUnitId || undefined,
    transformerId: transformerId || undefined,
    groupId: meterGroupId || undefined,
    transformer: factoryId ? { factoryId } : undefined,
  };

  const rows = await prisma.powerRecord.findMany({
    where: {
      recordDate:
        startDate || endDate
          ? {
              gte: startDate ? toRecordDate(startDate) : undefined,
              lte: endDate ? toRecordDate(endDate) : undefined,
            }
          : undefined,
      meter: meterWhere,
    },
    include: {
      meter: {
        include: {
          group: true,
          transformer: {
            include: {
              factory: true,
            },
          },
          transformerUnit: true,
        },
      },
    },
    orderBy: [{ recordDate: "asc" }, { meter: { code: "asc" } }],
  });

  const byDateMap = new Map<string, { date: string; consTotal: number; costTotal: number }>();
  const byMeterMap = new Map<string, {
    meterId: string;
    meterCode: string;
    meterName: string;
    factoryId: string | null;
    factoryName: string;
    groupName: string;
    substationName: string;
    transformerUnitName: string;
    consTotal: number;
    costTotal: number;
  }>();
  const byGroupMap = new Map<string, { groupId: string | null; groupCode: string; groupName: string; consTotal: number; costTotal: number }>();
  const byFactoryMap = new Map<string, { factoryId: string | null; factoryCode: string; factoryName: string; consTotal: number; costTotal: number }>();

  for (const row of rows) {
    const key = dateKey(row.recordDate, groupBy);
    const dateBucket = byDateMap.get(key) || { date: key, consTotal: 0, costTotal: 0 };
    dateBucket.consTotal += row.consTotal;
    dateBucket.costTotal += row.costTotal;
    byDateMap.set(key, dateBucket);

    const factory = row.meter.transformer?.factory;
    const meterBucket = byMeterMap.get(row.meterId) || {
      meterId: row.meterId,
      meterCode: row.meter.code,
      meterName: row.meter.name,
      factoryId: factory?.id || null,
      factoryName: factory?.name || "Chua gan nha may",
      groupName: row.meter.group?.name || "Chua phan nhom",
      substationName: row.meter.transformer?.name || "Chua gan tram",
      transformerUnitName: row.meter.transformerUnit?.name || "Chua gan may bien ap",
      consTotal: 0,
      costTotal: 0,
    };
    meterBucket.consTotal += row.consTotal;
    meterBucket.costTotal += row.costTotal;
    byMeterMap.set(row.meterId, meterBucket);

    const groupKey = row.meter.groupId || "none";
    const groupBucket = byGroupMap.get(groupKey) || {
      groupId: row.meter.groupId,
      groupCode: row.meter.group?.code || "NONE",
      groupName: row.meter.group?.name || "Chua phan nhom",
      consTotal: 0,
      costTotal: 0,
    };
    groupBucket.consTotal += row.consTotal;
    groupBucket.costTotal += row.costTotal;
    byGroupMap.set(groupKey, groupBucket);

    const factoryKey = factory?.id || "none";
    const factoryBucket = byFactoryMap.get(factoryKey) || {
      factoryId: factory?.id || null,
      factoryCode: factory?.code || "NONE",
      factoryName: factory?.name || "Chua gan nha may",
      consTotal: 0,
      costTotal: 0,
    };
    factoryBucket.consTotal += row.consTotal;
    factoryBucket.costTotal += row.costTotal;
    byFactoryMap.set(factoryKey, factoryBucket);
  }

  const totalConsumption = rows.reduce((sum, row) => sum + row.consTotal, 0);
  const totalCost = rows.reduce((sum, row) => sum + row.costTotal, 0);
  const totalNormal = rows.reduce((sum, row) => sum + (row.consNormal ?? row.consTotal), 0);
  const totalPeak = rows.reduce((sum, row) => sum + (row.consPeak ?? 0), 0);
  const totalOffPeak = rows.reduce((sum, row) => sum + (row.consOffPeak ?? 0), 0);
  const daysWithData = byDateMap.size;

  let prevPeriodConsumption = 0;
  let trendPercent: number | null = null;
  if (startDate && endDate) {
    const start = toRecordDate(startDate);
    const end = toRecordDate(endDate);
    const spanMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const prevStart = new Date(prevEnd.getTime() - spanMs);

    const prevRows = await prisma.powerRecord.findMany({
      where: {
        recordDate: { gte: prevStart, lte: prevEnd },
        meter: meterWhere,
      },
      select: { consTotal: true },
    });

    prevPeriodConsumption = prevRows.reduce((sum, row) => sum + row.consTotal, 0);
    trendPercent = prevPeriodConsumption > 0 ? ((totalConsumption - prevPeriodConsumption) / prevPeriodConsumption) * 100 : null;
  }

  return NextResponse.json({
    summary: {
      totalConsumption,
      totalCost,
      totalPeak,
      totalNormal,
      totalOffPeak,
      avgPerDay: daysWithData ? totalConsumption / daysWithData : 0,
      daysWithData,
      prevPeriodConsumption,
      trendPercent,
    },
    byDate: Array.from(byDateMap.values()),
    byMeter: Array.from(byMeterMap.values()).sort((a, b) => b.consTotal - a.consTotal),
    byGroup: Array.from(byGroupMap.values()).sort((a, b) => b.consTotal - a.consTotal),
    byFactory: Array.from(byFactoryMap.values()).sort((a, b) => b.consTotal - a.consTotal),
  });
}
