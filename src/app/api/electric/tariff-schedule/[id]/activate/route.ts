import { NextResponse } from "next/server";
import { requireCatalogManager } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/** Kich hoat 1 phien ban bieu khung gio, tu dong tat active cua cac phien ban khac (chi 1 active tai 1 thoi diem). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCatalogManager();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const data = await prisma.$transaction(async (tx) => {
    await tx.tariffScheduleVersion.updateMany({ where: { isActive: true }, data: { isActive: false } });
    return tx.tariffScheduleVersion.update({
      where: { id },
      data: { isActive: true, effectiveFrom: new Date() },
      include: { ranges: true },
    });
  });

  return NextResponse.json(data);
}
