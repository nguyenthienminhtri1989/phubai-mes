import { NextRequest, NextResponse } from "next/server";
import { readSelecTotalEnergy } from "@/lib/energy-modbus";
import { requireEditor } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

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
