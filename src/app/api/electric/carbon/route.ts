import { NextRequest, NextResponse } from "next/server";
import { toRecordDate } from "@/lib/energy-record";
import { prisma } from "@/lib/prisma";

const MV_TYPE = 2;
const NO_FACTORY = "__none__";

type Bucket = {
  billedKwh: number;
  internalKwh: number;
  emissionsKg: number;
};

function dateKey(date: Date, groupBy: string) {
  const iso = date.toISOString().slice(0, 10);
  return groupBy === "month" ? iso.slice(0, 7) : iso;
}

function add(bucket: Bucket, kwh: number, kg: number, isMv: boolean) {
  if (isMv) {
    bucket.billedKwh += kwh;
    bucket.emissionsKg += kg;
  } else {
    bucket.internalKwh += kwh;
  }
}

function ton(kg: number) {
  return kg / 1000;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate") || searchParams.get("from");
  const endDate = searchParams.get("endDate") || searchParams.get("to");
  const groupBy = searchParams.get("groupBy") === "month" ? "month" : "day";
  const factoryId = searchParams.get("factoryId");

  const meterWhere = {
    ...(factoryId
      ? {
          OR: [
            { factoryId },
            { transformer: { factoryId } },
            { transformerUnit: { transformer: { factoryId } } },
          ],
        }
      : {}),
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
          factory: true,
          transformer: { include: { factory: true } },
          transformerUnit: { include: { transformer: { include: { factory: true } } } },
        },
      },
    },
    orderBy: [{ recordDate: "asc" }, { meter: { code: "asc" } }],
  });

  const factors = await prisma.emissionFactor.findMany({
    where: { isActive: true },
    orderBy: [{ year: "asc" }],
  });
  const factorByYear = new Map(factors.map((factor) => [factor.year, factor]));
  const missingYears = new Set<number>();

  type Row = (typeof rows)[number];
  const resolveFactory = (row: Row) =>
    row.meter.factory ||
    row.meter.transformer?.factory ||
    row.meter.transformerUnit?.transformer?.factory ||
    null;

  const byDate = new Map<string, Bucket & { date: string }>();
  const byFactory = new Map<
    string,
    Bucket & { factoryId: string | null; factoryCode: string; factoryName: string }
  >();
  const byGroup = new Map<
    string,
    { groupId: string | null; groupCode: string; groupName: string; internalKwh: number; emissionsKg: number }
  >();
  const byMeter = new Map<
    string,
    { meterId: string; meterCode: string; meterName: string; groupName: string; factoryName: string; internalKwh: number; emissionsKg: number }
  >();

  let billedKwh = 0;
  let internalKwh = 0;
  let emissionsKg = 0;

  for (const row of rows) {
    const year = row.recordDate.getUTCFullYear();
    const factor = factorByYear.get(year)?.factorKgCo2ePerKwh ?? 0;
    if (!factorByYear.has(year)) missingYears.add(year);

    const kwh = row.consTotal || 0;
    const kg = kwh * factor;
    const isMv = row.meter.type === MV_TYPE;
    const factory = resolveFactory(row);
    const fKey = factory?.id || NO_FACTORY;

    const dKey = dateKey(row.recordDate, groupBy);
    const dateBucket = byDate.get(dKey) || { date: dKey, billedKwh: 0, internalKwh: 0, emissionsKg: 0 };
    add(dateBucket, kwh, kg, isMv);
    byDate.set(dKey, dateBucket);

    const factoryBucket =
      byFactory.get(fKey) ||
      {
        factoryId: factory?.id || null,
        factoryCode: factory?.code || "NONE",
        factoryName: factory?.name || "Chưa gắn nhà máy",
        billedKwh: 0,
        internalKwh: 0,
        emissionsKg: 0,
      };
    add(factoryBucket, kwh, kg, isMv);
    byFactory.set(fKey, factoryBucket);

    if (isMv) {
      billedKwh += kwh;
      emissionsKg += kg;
    } else {
      internalKwh += kwh;
      const groupKey = row.meter.groupId || "none";
      const groupBucket =
        byGroup.get(groupKey) ||
        {
          groupId: row.meter.groupId,
          groupCode: row.meter.group?.code || "NONE",
          groupName: row.meter.group?.name || "Chưa phân nhóm",
          internalKwh: 0,
          emissionsKg: 0,
        };
      groupBucket.internalKwh += kwh;
      groupBucket.emissionsKg += kg;
      byGroup.set(groupKey, groupBucket);

      const meterBucket =
        byMeter.get(row.meterId) ||
        {
          meterId: row.meterId,
          meterCode: row.meter.code,
          meterName: row.meter.name,
          groupName: row.meter.group?.name || "Chưa phân nhóm",
          factoryName: factory?.name || "Chưa gắn nhà máy",
          internalKwh: 0,
          emissionsKg: 0,
        };
      meterBucket.internalKwh += kwh;
      meterBucket.emissionsKg += kg;
      byMeter.set(row.meterId, meterBucket);
    }
  }

  const warnings = Array.from(missingYears)
    .sort((a, b) => a - b)
    .map((year) => "Chưa khai báo hệ số phát thải cho năm " + year + ". Phần phát thải của năm này đang tạm tính bằng 0.");

  return NextResponse.json({
    summary: {
      billedKwh,
      internalKwh,
      emissionsKg,
      emissionsTon: ton(emissionsKg),
      avgFactorKgCo2ePerKwh: billedKwh > 0 ? emissionsKg / billedKwh : 0,
      activeYears: factors.map((factor) => factor.year),
      factorCount: factors.length,
      warnings,
    },
    byDate: Array.from(byDate.values()).map((item) => ({ ...item, emissionsTon: ton(item.emissionsKg) })),
    byFactory: Array.from(byFactory.values())
      .map((item) => ({
        ...item,
        emissionsTon: ton(item.emissionsKg),
        avgFactorKgCo2ePerKwh: item.billedKwh > 0 ? item.emissionsKg / item.billedKwh : 0,
      }))
      .sort((a, b) => b.emissionsKg - a.emissionsKg),
    byGroup: Array.from(byGroup.values())
      .map((item) => ({ ...item, emissionsTon: ton(item.emissionsKg) }))
      .sort((a, b) => b.internalKwh - a.internalKwh),
    byMeter: Array.from(byMeter.values())
      .map((item) => ({ ...item, emissionsTon: ton(item.emissionsKg) }))
      .sort((a, b) => b.internalKwh - a.internalKwh),
  });
}
