import { NextRequest, NextResponse } from "next/server";
import { readSelecTotalEnergy } from "@/lib/energy-modbus";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const meter = await prisma.powerMeter.findUniqueOrThrow({
    where: { id: String(body.meterId || "") },
  });

  const totalEnergy = await readSelecTotalEnergy(meter);
  const telemetry = await prisma.powerTelemetry.create({
    data: {
      meterId: meter.id,
      totalEnergy,
    },
  });

  return NextResponse.json({
    meter,
    telemetry,
  });
}
