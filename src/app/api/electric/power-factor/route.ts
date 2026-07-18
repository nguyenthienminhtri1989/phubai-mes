import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/electric/power-factor?days=30
 *
 * Tra ve nhat ky cos phi (he so cong suat) cua cac cong to TRUNG THE, lay tu portal EVN
 * luc 06:00 moi sang. Chi de phong dien theo doi xu huong -> phat hien tut cos phi va
 * thay tu bu kip thoi. KHONG dung de tinh tien.
 *
 * LUU Y: moi ban ghi la ban do TUC THOI tai thoi diem 06:00, khong phai trung binh ca ngay.
 * Xem chu thich model PowerFactorLog trong schema.prisma.
 */

// EVN phat khi cos phi < 0.9; dat nguong canh bao 0.91 de bao SOM, con kip xu ly.
const PF_WARNING = 0.91;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(Number(searchParams.get("days") || 30), 1), 35);

  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (days - 1));

  const logs = await prisma.powerFactorLog.findMany({
    where: { recordDate: { gte: from } },
    include: {
      meter: {
        include: {
          factory: true,
          transformer: { include: { factory: true } },
        },
      },
    },
    orderBy: [
      { recordDate: "desc" },
      { meter: { name: "asc" } },
      { meter: { code: "asc" } },
    ],
  });

  const minOf = (values: Array<number | null>) => {
    const nums = values.filter((v): v is number => typeof v === "number");
    return nums.length ? Math.min(...nums) : null;
  };

  const rows = logs.map((log) => {
    const factory = log.meter.factory || log.meter.transformer?.factory || null;
    const pfMin = minOf([log.pfA, log.pfB, log.pfC]);
    return {
      id: log.id,
      date: log.recordDate.toISOString().slice(0, 10),
      readAt: log.readAt ? log.readAt.toISOString() : null,
      meterId: log.meterId,
      meterCode: log.meter.code,
      meterName: log.meter.name,
      factoryName: factory?.name || "Chua gan nha may",
      pfA: log.pfA,
      pfB: log.pfB,
      pfC: log.pfC,
      pfMin,
      isLow: pfMin != null && pfMin <= PF_WARNING,
    };
  });

  // Ban ghi MOI NHAT cua tung cong to -> dung cho the canh bao dau trang.
  // rows da sap xep ngay giam dan nen ban gap dau tien cua moi meter chinh la moi nhat.
  const latestByMeter = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latestByMeter.has(row.meterId)) latestByMeter.set(row.meterId, row);
  }
  const latest = Array.from(latestByMeter.values()).sort((a, b) =>
    a.meterName.localeCompare(b.meterName, "vi") ||
    a.meterCode.localeCompare(b.meterCode, "vi"),
  );

  return NextResponse.json({
    threshold: PF_WARNING,
    days,
    latest,
    rows,
    alertCount: latest.filter((r) => r.isLow).length,
  });
}
