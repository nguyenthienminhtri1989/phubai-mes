import { NextRequest, NextResponse } from "next/server";
import { PowerDataSource } from "@/generated/prisma/enums";
import { buildPowerRecordValues, toRecordDate } from "@/lib/energy-record";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const meterId = searchParams.get("meterId");

  const data = await prisma.powerRecord.findMany({
    where: {
      meterId: meterId || undefined,
      recordDate:
        from || to
          ? {
              gte: from ? toRecordDate(from) : undefined,
              lte: to ? toRecordDate(to) : undefined,
            }
          : undefined,
    },
    include: {
      meter: {
        include: {
          group: true,
          transformer: true,
        },
      },
    },
    orderBy: [{ recordDate: "desc" }, { meter: { code: "asc" } }],
  });

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const recordDate = toRecordDate(body.recordDate);
  const meterId = String(body.meterId || "");
  const values = await buildPowerRecordValues({
    meterId,
    recordDate,
    currTotal: Number(body.currTotal || 0),
    prevTotal:
      body.prevTotal === undefined || body.prevTotal === null || body.prevTotal === ""
        ? undefined
        : Number(body.prevTotal),
    unitPrice:
      body.unitPrice === undefined || body.unitPrice === null || body.unitPrice === ""
        ? undefined
        : Number(body.unitPrice),
  });

  const data = await prisma.powerRecord.upsert({
    where: {
      recordDate_meterId: {
        recordDate,
        meterId,
      },
    },
    update: {
      ...values,
      dataSource: PowerDataSource.MANUAL,
      note: body.note || null,
    },
    create: {
      recordDate,
      meterId,
      ...values,
      dataSource: PowerDataSource.MANUAL,
      note: body.note || null,
    },
    include: {
      meter: true,
    },
  });

  return NextResponse.json(data);
}
