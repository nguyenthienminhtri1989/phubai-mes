import { NextRequest, NextResponse } from "next/server";
import { requireCatalogManager } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const includeUnit = {
  transformer: {
    include: {
      factory: true,
    },
  },
  _count: {
    select: {
      meters: true,
    },
  },
};

function toNullableString(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function unitData(body: Record<string, unknown>) {
  return {
    code: String(body.code || "").trim(),
    name: String(body.name || "").trim(),
    transformerId: toNullableString(body.transformerId),
    manufacturer: toNullableString(body.manufacturer),
    manufacturingYear: body.manufacturingYear ? Number(body.manufacturingYear) : null,
    serialNumber: toNullableString(body.serialNumber),
    ratedCapacity: body.ratedCapacity ? Number(body.ratedCapacity) : null,
    ratedCapacityUnit: toNullableString(body.ratedCapacityUnit) || "kVA",
    voltageLevel: toNullableString(body.voltageLevel),
    ratedCurrent: toNullableString(body.ratedCurrent),
    isActive: body.isActive !== false,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const factoryId = searchParams.get("factoryId");
  const transformerId = searchParams.get("transformerId") || searchParams.get("substationId");

  const data = await prisma.powerTransformerUnit.findMany({
    where: {
      transformerId: transformerId || undefined,
      transformer: factoryId ? { factoryId } : undefined,
    },
    include: includeUnit,
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
  });

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const guard = await requireCatalogManager();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const data = await prisma.powerTransformerUnit.create({
    data: unitData(body),
    include: includeUnit,
  });

  return NextResponse.json(data, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const guard = await requireCatalogManager();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const id = Number(body.id || 0);

  if (!id) {
    return NextResponse.json({ error: "Missing transformer unit id" }, { status: 400 });
  }

  const data = await prisma.powerTransformerUnit.update({
    where: { id },
    data: unitData(body),
    include: includeUnit,
  });

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const guard = await requireCatalogManager();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const id = Number(body.id || 0);

  if (!id) {
    return NextResponse.json({ error: "Missing transformer unit id" }, { status: 400 });
  }

  const used = await prisma.powerMeter.count({ where: { transformerUnitId: id } });
  if (used) {
    const data = await prisma.powerTransformerUnit.update({
      where: { id },
      data: { isActive: false },
      include: includeUnit,
    });

    return NextResponse.json(data);
  }

  await prisma.powerTransformerUnit.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
