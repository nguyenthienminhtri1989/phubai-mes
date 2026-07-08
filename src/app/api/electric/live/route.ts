import { NextRequest, NextResponse } from "next/server";
import { requireEditor } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// GET /api/electric/live?meterId=...
// Co che PUSH: collector doc Modbus va day ban doc moi nhat len PowerLiveReading.
// Nut realtime chi doc ban moi nhat tu DB (khong cham Modbus qua mang) -> nhanh, on dinh.
export async function GET(request: NextRequest) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const meterId = request.nextUrl.searchParams.get("meterId") || "";
  if (!meterId) {
    return NextResponse.json({ error: "Missing meterId" }, { status: 400 });
  }

  const meter = await prisma.powerMeter.findUnique({
    where: { id: meterId },
    include: {
      factory: true,
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
    },
  });

  if (!meter) {
    return NextResponse.json({ error: "Meter not found" }, { status: 404 });
  }

  if (!meter.isActive || !meter.isAuto || !meter.gatewayIp || !meter.modbusId) {
    return NextResponse.json(
      { error: "Meter is not configured for realtime AUTO reading" },
      { status: 400 },
    );
  }

  const live = await prisma.powerLiveReading.findUnique({
    where: { meterId: meter.id },
  });

  if (!live) {
    return NextResponse.json(
      { error: "Chua co du lieu realtime cho dong ho nay. Cho collector day ban doc dau tien." },
      { status: 404 },
    );
  }

  // Giu dung cau truc LiveData ma ElectricClients.tsx mong doi.
  // Collector hien chi day totalEnergy nen voltage/current/power tam thoi null.
  return NextResponse.json({
    timestamp: live.readAt,
    totalEnergy: live.totalEnergy,
    voltage: null,
    current: null,
    power: null,
    pf: null,
    meter,
  });
}
