import { NextRequest, NextResponse } from "next/server";
import { requireCatalogManager } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const data = await prisma.tariffScheduleVersion.findMany({
    include: { ranges: { orderBy: [{ dayType: "asc" }, { startMinute: "asc" }] } },
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
  });

  return NextResponse.json(data);
}

type RangeInput = { dayType: string; priceType: string; startMinute: number; endMinute: number };

function validateRanges(ranges: RangeInput[]) {
  for (const range of ranges) {
    if (!["WEEKDAY", "SUNDAY"].includes(range.dayType)) return "dayType không hợp lệ";
    if (!["NORMAL", "PEAK", "OFF_PEAK"].includes(range.priceType)) return "priceType không hợp lệ";
    if (range.startMinute < 0 || range.endMinute > 1440 || range.endMinute <= range.startMinute) {
      return `Khoảng giờ không hợp lệ: ${range.startMinute}-${range.endMinute}`;
    }
  }
  return null;
}

/** Tao moi 1 phien ban bieu khung gio (kem danh sach khoang gio), o trang thai inactive. */
export async function POST(request: NextRequest) {
  const guard = await requireCatalogManager();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const code = String(body.code || "").trim().toUpperCase();
  const name = String(body.name || "").trim();
  const ranges: RangeInput[] = Array.isArray(body.ranges) ? body.ranges : [];

  if (!code || !name) {
    return NextResponse.json({ error: "Thiếu code hoặc name" }, { status: 400 });
  }
  const rangeError = validateRanges(ranges);
  if (rangeError) return NextResponse.json({ error: rangeError }, { status: 400 });

  const data = await prisma.tariffScheduleVersion.create({
    data: {
      code,
      name,
      note: body.note || null,
      isActive: false,
      ranges: { create: ranges },
    },
    include: { ranges: true },
  });

  return NextResponse.json(data);
}

/** Cap nhat danh sach khoang gio cua 1 phien ban (xoa het rang cu, tao lai theo danh sach moi). */
export async function PUT(request: NextRequest) {
  const guard = await requireCatalogManager();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const id = String(body.id || "");
  const ranges: RangeInput[] = Array.isArray(body.ranges) ? body.ranges : [];

  if (!id) return NextResponse.json({ error: "Thiếu id phiên bản" }, { status: 400 });
  const rangeError = validateRanges(ranges);
  if (rangeError) return NextResponse.json({ error: rangeError }, { status: 400 });

  const data = await prisma.$transaction(async (tx) => {
    await tx.tariffTimeRange.deleteMany({ where: { versionId: id } });
    return tx.tariffScheduleVersion.update({
      where: { id },
      data: {
        name: body.name || undefined,
        note: body.note ?? undefined,
        ranges: { create: ranges },
      },
      include: { ranges: true },
    });
  });

  return NextResponse.json(data);
}
