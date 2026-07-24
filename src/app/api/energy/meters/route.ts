import { NextRequest, NextResponse } from "next/server";
import { requireCatalogManager } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const meterInclude = {
  factory: true,
  gateway: true,
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
  const meterType = Number(body.type || 1);

  // Gateway trong danh muc la nguon su that ve dia chi. Khi dong ho duoc gan vao mot Gateway,
  // `gatewayIp`/`gatewayPort` duoc DONG BO tu Gateway do (khong tin gia tri UI gui len), giu
  // hai cot nay dung de `/api/collector/meters` va collector khong phai doi contract.
  // Van chap nhan nhap tay IP/port cho du lieu cu chua gan Gateway.
  const gatewayId = isAuto ? toNullableString(body.gatewayId) : null;
  const gateway = gatewayId
    ? await prisma.gateway.findUnique({ where: { id: gatewayId }, select: { ipAddress: true, port: true } })
    : null;

  const gatewayIp = gateway
    ? gateway.ipAddress
    : isAuto && body.gatewayIp
      ? String(body.gatewayIp).trim()
      : null;
  const gatewayPort = gateway ? gateway.port : Number(body.gatewayPort || 502);

  return {
    code: String(body.code || "").trim(),
    name: String(body.name || "").trim(),
    meterNo: toNullableString(body.meterNo),
    factoryId: meterType === 2 ? toNullableString(body.factoryId) : null,
    transformerId: meterType === 2 ? null : (unit?.transformerId || toNullableString(body.transformerId)),
    transformerUnitId: meterType === 2 ? null : transformerUnitId,
    groupId: toNullableString(body.groupId),
    isActive: body.isActive !== false,
    type: Number(body.type || 1),
    isAuto,
    modbusId: isAuto && body.modbusId ? Number(body.modbusId) : null,
    gatewayId,
    gatewayIp,
    gatewayPort,
    registerAddr: Number(body.registerAddr || 0),
    tu: Number(body.tu || 1),
    ti: Number(body.ti || 1),
    sortOrder: Number(body.sortOrder || 0),
    // Chi dong ho Ha the (type=1) moi co khai niem San xuat/Ngoai san xuat.
    // Trung the (type=2) la cong to tong nen luon false.
    isNonProduction: meterType === 2 ? false : body.isNonProduction === true,
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
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { code: "asc" }],
  });

  return NextResponse.json(data);
}

// Chan trung dia chi Modbus tren cung mot bus: hai dong ho AUTO cung
// (gatewayIp, gatewayPort, modbusId) se dung do tren RS485. Tra loi ro thay vi P2002 tho.
async function findGatewayConflict(
  data: { isAuto: boolean; gatewayIp: string | null; gatewayPort: number; modbusId: number | null },
  excludeId?: string,
) {
  if (!data.isAuto || !data.gatewayIp || data.modbusId == null) return null;
  return prisma.powerMeter.findFirst({
    where: {
      gatewayIp: data.gatewayIp,
      gatewayPort: data.gatewayPort,
      modbusId: data.modbusId,
      id: excludeId ? { not: excludeId } : undefined,
    },
    select: { code: true, name: true },
  });
}

function gatewayConflictResponse(conflict: { code: string; name: string }, data: { gatewayIp: string | null; gatewayPort: number; modbusId: number | null }) {
  return NextResponse.json(
    {
      error: `Trùng địa chỉ Modbus: đồng hồ "${conflict.code} - ${conflict.name}" đã dùng Slave ID ${data.modbusId} trên Gateway ${data.gatewayIp}:${data.gatewayPort}. Mỗi Slave ID phải là duy nhất trên cùng một cổng Gateway.`,
    },
    { status: 409 },
  );
}

export async function POST(request: NextRequest) {
  const guard = await requireCatalogManager();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const payload = await meterData(body);

  const conflict = await findGatewayConflict(payload);
  if (conflict) return gatewayConflictResponse(conflict, payload);

  const data = await prisma.powerMeter.create({
    data: payload,
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

  const payload = await meterData(body);

  const conflict = await findGatewayConflict(payload, id);
  if (conflict) return gatewayConflictResponse(conflict, payload);

  const data = await prisma.powerMeter.update({
    where: { id },
    data: payload,
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
