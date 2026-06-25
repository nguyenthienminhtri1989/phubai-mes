import { NextRequest, NextResponse } from "next/server";
import { readSelecTotalEnergy } from "@/lib/energy-modbus";
import { requireEditor } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const meterId = searchParams.get("meterId");

  if (!meterId) {
    return NextResponse.json({ error: "Missing meterId" }, { status: 400 });
  }

  const meter = await prisma.powerMeter.findUniqueOrThrow({
    where: { id: meterId },
  });
  const totalEnergy = await readSelecTotalEnergy(meter);
  const telemetry = await prisma.powerTelemetry.create({
    data: {
      meterId: meter.id,
      totalEnergy,
    },
  });

  return NextResponse.json({
    timestamp: telemetry.timestamp,
    totalEnergy,
    voltage: telemetry.voltage ?? 0,
    current: telemetry.current ?? 0,
    power: telemetry.power ?? 0,
    pf: telemetry.powerFactor ?? 0,
    meter,
    telemetry,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const url = new URL(request.url);
  url.searchParams.set("meterId", String(body.meterId || ""));

  return GET(new NextRequest(url));
}
