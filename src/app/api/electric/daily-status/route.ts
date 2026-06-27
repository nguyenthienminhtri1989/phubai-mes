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
  const meters = await prisma.powerMeter.findMany({
    where: {
      isActive: true,
      transformerUnitId: transformerUnitId || undefined,
      transformerId: transformerId || undefined,
      transformer: factoryId ? { factoryId } : undefined,
    },
    include: {
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

  return NextResponse.json(
    meters.map((meter) => {
      const { records, ...rest } = meter;
      return {
        ...rest,
        todayRecord: records[0] || null,
      };
    }),
  );
}
