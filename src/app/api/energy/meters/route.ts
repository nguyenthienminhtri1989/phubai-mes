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
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const factoryId = searchParams.get("factoryId");
  const transformerId = searchParams.get("transformerId") || searchParams.get("substationId");

  const data = await prisma.powerMeter.findMany({
    where: {
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
    data: {
      code: String(body.code || "").trim(),
      name: String(body.name || "").trim(),
      meterNo: body.meterNo || null,
      transformerId: body.transformerId || null,
      groupId: body.groupId || null,
      isActive: body.isActive ?? true,
      type: Number(body.type || 1),
      isAuto: body.isAuto ?? false,
      modbusId: body.isAuto && body.modbusId ? Number(body.modbusId) : null,
      gatewayIp: body.isAuto && body.gatewayIp ? String(body.gatewayIp).trim() : null,
      gatewayPort: Number(body.gatewayPort || 502),
      registerAddr: Number(body.registerAddr || 0),
      tu: Number(body.tu || 1),
      ti: Number(body.ti || 1),
      note: body.note || null,
    },
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
    data: {
      code: String(body.code || "").trim(),
      name: String(body.name || "").trim(),
      meterNo: body.meterNo || null,
      transformerId: body.transformerId || null,
      groupId: body.groupId || null,
      isActive: body.isActive ?? true,
      type: Number(body.type || 1),
      isAuto: body.isAuto ?? false,
      modbusId: body.isAuto && body.modbusId ? Number(body.modbusId) : null,
      gatewayIp: body.isAuto && body.gatewayIp ? String(body.gatewayIp).trim() : null,
      gatewayPort: Number(body.gatewayPort || 502),
      registerAddr: Number(body.registerAddr || 0),
      tu: Number(body.tu || 1),
      ti: Number(body.ti || 1),
      note: body.note || null,
    },
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