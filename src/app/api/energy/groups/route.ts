import { NextRequest, NextResponse } from "next/server";
import { requireCatalogManager } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const data = await prisma.powerMeterGroup.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { code: "asc" }],
  });

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const guard = await requireCatalogManager();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const data = await prisma.powerMeterGroup.create({
    data: {
      code: String(body.code || "").trim(),
      name: String(body.name || "").trim(),
      description: body.description || null,
      sortOrder: Number(body.sortOrder || 0),
      isActive: body.isActive ?? true,
    },
  });

  return NextResponse.json(data, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const guard = await requireCatalogManager();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const id = String(body.id || "");

  if (!id) {
    return NextResponse.json({ error: "Missing meter group id" }, { status: 400 });
  }

  const data = await prisma.powerMeterGroup.update({
    where: { id },
    data: {
      code: String(body.code || "").trim(),
      name: String(body.name || "").trim(),
      description: body.description || null,
      sortOrder: Number(body.sortOrder || 0),
      isActive: body.isActive ?? true,
    },
  });

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const guard = await requireCatalogManager();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const id = String(body.id || "");

  if (!id) {
    return NextResponse.json({ error: "Missing meter group id" }, { status: 400 });
  }

  const used = await prisma.powerMeter.count({ where: { groupId: id } });
  if (used) {
    const data = await prisma.powerMeterGroup.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json(data);
  }

  await prisma.powerMeterGroup.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
