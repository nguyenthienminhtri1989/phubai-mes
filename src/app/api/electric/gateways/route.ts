import { NextRequest, NextResponse } from "next/server";
import { requireCatalogManager } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// Danh muc Gateway Modbus. MOI DONG = MOT BUS RS485 = MOT CONG COM cua thiet bi.
// N520 hai cong -> khai 2 dong cung IP, khac port (COM1=502, COM2=503).
const gatewayInclude = {
  factory: true,
  health: true,
  _count: { select: { meters: true } },
};

function toNullableString(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function gatewayData(body: Record<string, unknown>) {
  const port = Number(body.port || 502);
  return {
    code: String(body.code || "").trim(),
    name: String(body.name || "").trim(),
    ipAddress: String(body.ipAddress || "").trim(),
    port: Number.isFinite(port) && port > 0 ? Math.trunc(port) : 502,
    factoryId: toNullableString(body.factoryId),
    location: toNullableString(body.location),
    description: toNullableString(body.description),
    isActive: body.isActive !== false,
  };
}

/**
 * Gateway la nguon su that ve IP/port. Dong ho van giu cot `gatewayIp`/`gatewayPort` de
 * `/api/collector/meters` va collector khong phai doi contract, nen moi lan Gateway doi dia chi
 * phai DONG BO xuong tat ca dong ho thuoc gateway do, neu khong collector se doc dia chi cu.
 */
async function syncMeterAddresses(gatewayId: string, ipAddress: string, port: number) {
  await prisma.powerMeter.updateMany({
    where: { gatewayId },
    data: { gatewayIp: ipAddress, gatewayPort: port },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const factoryId = searchParams.get("factoryId");
  const includeInactive = searchParams.get("includeInactive") === "1";

  const data = await prisma.gateway.findMany({
    where: {
      factoryId: factoryId || undefined,
      isActive: includeInactive ? undefined : true,
    },
    include: gatewayInclude,
    orderBy: [{ isActive: "desc" }, { ipAddress: "asc" }, { port: "asc" }],
  });

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const guard = await requireCatalogManager();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const payload = gatewayData(body);

  if (!payload.code || !payload.name || !payload.ipAddress) {
    return NextResponse.json({ error: "Thiếu mã, tên hoặc địa chỉ IP của Gateway" }, { status: 400 });
  }

  const duplicate = await prisma.gateway.findUnique({
    where: { ipAddress_port: { ipAddress: payload.ipAddress, port: payload.port } },
    select: { code: true, name: true },
  });
  if (duplicate) {
    return NextResponse.json(
      { error: `Gateway "${duplicate.code} - ${duplicate.name}" đã dùng ${payload.ipAddress}:${payload.port}. Mỗi cổng COM chỉ khai báo một lần.` },
      { status: 409 },
    );
  }

  const data = await prisma.gateway.create({ data: payload, include: gatewayInclude });
  return NextResponse.json(data, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const guard = await requireCatalogManager();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "Missing gateway id" }, { status: 400 });

  const payload = gatewayData(body);
  if (!payload.code || !payload.name || !payload.ipAddress) {
    return NextResponse.json({ error: "Thiếu mã, tên hoặc địa chỉ IP của Gateway" }, { status: 400 });
  }

  const duplicate = await prisma.gateway.findFirst({
    where: { ipAddress: payload.ipAddress, port: payload.port, id: { not: id } },
    select: { code: true, name: true },
  });
  if (duplicate) {
    return NextResponse.json(
      { error: `Gateway "${duplicate.code} - ${duplicate.name}" đã dùng ${payload.ipAddress}:${payload.port}.` },
      { status: 409 },
    );
  }

  const data = await prisma.gateway.update({ where: { id }, data: payload, include: gatewayInclude });
  await syncMeterAddresses(id, payload.ipAddress, payload.port);

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const guard = await requireCatalogManager();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "Missing gateway id" }, { status: 400 });

  // Con dong ho dang tro toi thi chi ngung dung, khong xoa cung (giu lich su giam sat).
  const used = await prisma.powerMeter.count({ where: { gatewayId: id } });
  if (used) {
    const data = await prisma.gateway.update({
      where: { id },
      data: { isActive: false },
      include: gatewayInclude,
    });
    return NextResponse.json(data);
  }

  await prisma.gateway.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
