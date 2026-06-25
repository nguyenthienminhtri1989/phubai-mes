import { NextRequest, NextResponse } from "next/server";
import { toRecordDate } from "@/lib/energy-record";
import { prisma } from "@/lib/prisma";

function dateKey(date: Date, groupBy: string) {
  const iso = date.toISOString().slice(0, 10);
  return groupBy === "month" ? iso.slice(0, 7) : iso;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate") || searchParams.get("from");
  const endDate = searchParams.get("endDate") || searchParams.get("to");
  const groupBy = searchParams.get("groupBy") === "month" ? "month" : "day";
  const factoryId = searchParams.get("factoryId");
  const transformerId = searchParams.get("substationId") || searchParams.get("transformerId");
  const meterGroupId = searchParams.get("meterGroupId") || searchParams.get("groupId");

  const rows = await prisma.powerRecord.findMany({
    where: {
      recordDate:
        startDate || endDate
          ? {
              gte: startDate ? toRecordDate(startDate) : undefined,
              lte: endDate ? toRecordDate(endDate) : undefined,
            }
          : undefined,
      meter: {
        transformerId: transformerId || undefined,
        groupId: meterGroupId || undefined,
        transformer: factoryId ? { factoryId } : undefined,
      },
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
      factoryName: factory?.name || "Chưa gán nhà máy",
      groupName: row.meter.group?.name || "Chưa phân nhóm",
      substationName: row.meter.transformer?.name || "Chưa gán trạm",
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
      groupName: row.meter.group?.name || "Chưa phân nhóm",
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
      factoryName: factory?.name || "Chưa gán nhà máy",
      consTotal: 0,
      costTotal: 0,
    };
    factoryBucket.consTotal += row.consTotal;
    factoryBucket.costTotal += row.costTotal;
    byFactoryMap.set(factoryKey, factoryBucket);
  }

  const totalConsumption = rows.reduce((sum, row) => sum + row.consTotal, 0);
  const totalCost = rows.reduce((sum, row) => sum + row.costTotal, 0);
  const daysWithData = byDateMap.size;

  return NextResponse.json({
    summary: {
      totalConsumption,
      totalCost,
      totalPeak: 0,
      totalNormal: totalConsumption,
      totalOffPeak: 0,
      avgPerDay: daysWithData ? totalConsumption / daysWithData : 0,
      daysWithData,
      prevPeriodConsumption: 0,
      trendPercent: null,
    },
    byDate: Array.from(byDateMap.values()),
    byMeter: Array.from(byMeterMap.values()).sort((a, b) => b.consTotal - a.consTotal),
    byGroup: Array.from(byGroupMap.values()).sort((a, b) => b.consTotal - a.consTotal),
    byFactory: Array.from(byFactoryMap.values()).sort((a, b) => b.consTotal - a.consTotal),
  });
}