import { NextRequest, NextResponse } from "next/server";
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

  // KHOANG NGAY theo gio Viet Nam de so khop record BAT KE m0c gio luu trong DB.
  // Ly do: record ghi qua Prisma (nhap tay) luu o 05:00Z, con record ghi qua pg driver tho
  // (collector AUTO trong energy-cron) luu o 12:00Z cho CUNG mot ngay. Neu so khop recordDate
  // CHINH XAC thi record AUTO bi truot (lech 7 tieng) -> todayRecord = null du DB co du lieu.
  // So khop theo khoang [dau ngay VN, dau ngay VN ke tiep) bat duoc ca hai truong hop.
  const dayStart = new Date(`${date}T00:00:00.000+07:00`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const meterType = searchParams.get("type") ? Number(searchParams.get("type")) : undefined;
  const meterOrderBy =
    meterType === 2
      ? [{ name: "asc" as const }, { code: "asc" as const }]
      : [{ sortOrder: "asc" as const }, { code: "asc" as const }];

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
        where: { recordDate: { gte: dayStart, lt: dayEnd } },
        take: 1,
      },
    },
    orderBy: meterOrderBy,
  });

  const meterIds = meters.map((meter) => meter.id);

  const lastRecords = meterIds.length
    ? await prisma.powerRecord.findMany({
        where: {
          meterId: { in: meterIds },
          recordDate: { lt: dayStart },
        },
        orderBy: [{ meterId: "asc" }, { recordDate: "desc" }],
        distinct: ["meterId"],
      })
    : [];
  const lastByMeter = new Map(lastRecords.map((record) => [record.meterId, record]));

  const sevenDaysAgo = new Date(dayStart);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  const recentRecords = meterIds.length
    ? await prisma.powerRecord.findMany({
        where: {
          meterId: { in: meterIds },
          recordDate: { gte: sevenDaysAgo, lt: dayStart },
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
