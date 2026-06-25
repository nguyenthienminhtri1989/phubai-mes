import { NextRequest, NextResponse } from "next/server";
import { toRecordDate } from "@/lib/energy-record";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const meterId = searchParams.get("meterId");
  const date = searchParams.get("date");

  if (!meterId || !date) {
    return NextResponse.json({ error: "Missing meterId or date" }, { status: 400 });
  }

  const recordDate = toRecordDate(date);
  const data = await prisma.powerRecord.findFirst({
    where: {
      meterId,
      recordDate: { lt: recordDate },
    },
    orderBy: { recordDate: "desc" },
  });

  return NextResponse.json(data);
}
