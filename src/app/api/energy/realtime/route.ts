import { NextRequest, NextResponse } from "next/server";
import { requireEditor } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const AGENT_URL = process.env.AGENT_URL || "http://localhost:4000";
const AGENT_TOKEN = process.env.AGENT_TOKEN || "";

export async function POST(request: NextRequest) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const meter = await prisma.powerMeter.findUniqueOrThrow({
    where: { id: String(body.meterId || "") },
  });

  // Gọi agent ở máy văn phòng (qua reverse tunnel) để đọc Modbus.
  // Có timeout 8s để không treo nếu agent/tunnel gặp sự cố.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let totalEnergy: number;
  try {
    const agentRes = await fetch(`${AGENT_URL}/read`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-token": AGENT_TOKEN,
      },
      body: JSON.stringify({
        gatewayIp: meter.gatewayIp,
        gatewayPort: meter.gatewayPort,
        modbusId: meter.modbusId,
        registerAddr: meter.registerAddr,
      }),
      signal: controller.signal,
    });

    if (!agentRes.ok) {
      const errText = await agentRes.text();
      return NextResponse.json(
        { error: `Agent đọc Modbus thất bại: ${errText}` },
        { status: 502 },
      );
    }

    ({ totalEnergy } = await agentRes.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: `Không kết nối được agent đọc Modbus: ${err instanceof Error ? err.message : "lỗi không xác định"}`,
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }

  const telemetry = await prisma.powerTelemetry.create({
    data: {
      meterId: meter.id,
      totalEnergy,
    },
  });

  return NextResponse.json({ meter, telemetry });
}
