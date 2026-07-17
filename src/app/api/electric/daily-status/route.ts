import { NextRequest, NextResponse } from "next/server";
import { toRecordDate } from "@/lib/energy-record";
import { prisma } from "@/lib/prisma";

function toUnitId(value: string | null) {
  const id = Number(value || 0);
  return id || null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const factoryId = searchParams.get("factoryId");
  const transformerId = searchParams.get("substationId") || searchParams.get("transformerId");
  const transformerUnitId = toUnitId(searchParams.get("transformerUnitId"));
  const date = searchParams.get("date");

  if (!date) {
    return NextResponse.json({ error: "Missing date" }, { status: 400 });
  }

  const recordDate = toRecordDate(date);
  const meterType = searchParams.get("type") ? Number(searchParams.get("type")) : undefined;

  const meters = await prisma.powerMeter.findMany({
    where: {
      isActive: true,
      type: meterType || undefined,
      transformerUnitId: transformerUnitId || undefined,
      transformerId: transformerId || undefined,
      ...(factoryId
        ? {
            OR: [
              { transformer: { factoryId } },
              { factoryId },
            ],
          }
        : {}),
    },
    include: {
      factory: true,
      group: true,
      transformer: {
        include: {
          factory: true,
        },
      },
      transformerUnit: {
        include: {
          transformer: {
            include: {
              factory: true,
            },
          },
        },
      },
      records: {
        where: { recordDate },
        take: 1,
      },
    },
    orderBy: { code: "asc" },
  });

  const meterIds = meters.map((meter) => meter.id);

  const lastRecords = meterIds.length
    ? await prisma.powerRecord.findMany({
        where: {
          meterId: { in: meterIds },
          recordDate: { lt: recordDate },
        },
        orderBy: [{ meterId: "asc" }, { recordDate: "desc" }],
        distinct: ["meterId"],
      })
    : [];
  const lastByMeter = new Map(lastRecords.map((record) => [record.meterId, record]));

  const sevenDaysAgo = new Date(recordDate);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  const recentRecords = meterIds.length
    ? await prisma.powerRecord.findMany({
        where: {
          meterId: { in: meterIds },
          recordDate: { gte: sevenDaysAgo, lt: recordDate },
        },
        select: { meterId: true, consTotal: true },
      })
    : [];
  const avgByMeter = new Map<string, number>();
  for (const meterId of meterIds) {
    const values = recentRecords.filter((record) => record.meterId === meterId);
    if (!values.length) continue;
    const sum = values.reduce((acc, record) => acc + Number(record.consTotal || 0), 0);
    avgByMeter.set(meterId, sum / values.length);
  }

  return NextResponse.json(
    meters.map((meter) => {
      const { records, ...rest } = meter;
      const lastRecord = lastByMeter.get(meter.id) || null;
      return {
        ...rest,
        todayRecord: records[0] || null,
        lastRecord,
        previousConsTotal: lastRecord?.consTotal ?? null,
        avgConsumption7d: avgByMeter.get(meter.id) ?? null,
      };
    }),
  );
}
