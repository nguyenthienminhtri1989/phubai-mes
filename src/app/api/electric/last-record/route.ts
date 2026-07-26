import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const meterId = searchParams.get("meterId");
  const date = searchParams.get("date");

  if (!meterId || !date) {
    return NextResponse.json({ error: "Missing meterId or date" }, { status: 400 });
  }

  // Lay record GAN NHAT TRUOC ngay `date`. Dung moc dau ngay VN lam bien tren de nhat quan
  // voi cach so khop record o daily-status/reports (record AUTO luu 12:00Z, nhap tay 05:00Z).
  const dayStart = new Date(`${date}T00:00:00.000+07:00`);
  const data = await prisma.powerRecord.findFirst({
    where: {
      meterId,
      recordDate: { lt: dayStart },
    },
    orderBy: { recordDate: "desc" },
  });

  return NextResponse.json(data);
}
