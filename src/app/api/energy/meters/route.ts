import { NextRequest, NextResponse } from "next/server";
import { requireCatalogManager } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const meterInclude = {
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
};

function toUnitId(value: unknown) {
  const id = Number(value || 0);
  return id || null;
}

function toNullableString(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

async function meterData(body: Record<string, unknown>) {
  const transformerUnitId = toUnitId(body.transformerUnitId);
  const unit = transformerUnitId
    ? await prisma.powerTransformerUnit.findUnique({ where: { id: transformerUnitId } })
    : null;

  const isAuto = body.isAuto === true;

  return {
    code: String(body.code || "").trim(),
    name: String(body.name || "").trim(),
    meterNo: toNullableString(body.meterNo),
    transformerId: unit?.transformerId || toNullableString(body.transformerId),
    transformerUnitId,
    groupId: toNullableString(body.groupId),
    isActive: body.isActive !== false,
    type: Number(body.type || 1),
    isAuto,
    modbusId: isAuto && body.modbusId ? Number(body.modbusId) : null,
    gatewayIp: isAuto && body.gatewayIp ? String(body.gatewayIp).trim() : null,
    gatewayPort: Number(body.gatewayPort || 502),
    registerAddr: Number(body.registerAddr || 0),
    tu: Number(body.tu || 1),
    ti: Number(body.ti || 1),
    note: toNullableString(body.note),
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const factoryId = searchParams.get("factoryId");
  const transformerId = searchParams.get("transformerId") || searchParams.get("substationId");
  const transformerUnitId = toUnitId(searchParams.get("transformerUnitId"));

  const data = await prisma.powerMeter.findMany({
    where: {
      transformerUnitId: transformerUnitId || undefined,
      transformerId: transformerId || undefined,
      transformer: factoryId ? { factoryId } : undefined,
    },
    include: meterInclude,
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
  });

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const guard = await requireCatalogManager();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const data = await prisma.powerMeter.create({
    data: await meterData(body),
    include: meterInclude,
  });

  return NextResponse.json(data, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const guard = await requireCatalogManager();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const id = String(body.id || "");

  if (!id) {
    return NextResponse.json({ error: "Missing meter id" }, { status: 400 });
  }

  const data = await prisma.powerMeter.update({
    where: { id },
    data: await meterData(body),
    include: meterInclude,
  });

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const guard = await requireCatalogManager();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const id = String(body.id || "");

  if (!id) {
    return NextResponse.json({ error: "Missing meter id" }, { status: 400 });
  }

  const hasRecords = await prisma.powerRecord.count({ where: { meterId: id } });
  const hasTelemetry = await prisma.powerTelemetry.count({ where: { meterId: id } });

  if (hasRecords || hasTelemetry) {
    const data = await prisma.powerMeter.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json(data);
  }

  await prisma.powerMeter.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
