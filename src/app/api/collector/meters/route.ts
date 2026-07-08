import { NextRequest, NextResponse } from "next/server";
import { requireCollectorKey } from "@/lib/collector-auth";
import { prisma } from "@/lib/prisma";

// GET /api/collector/meters
// Tra danh sach dong ho AUTO dang bat, du cau hinh Modbus, de collector biet can doc gi.
// Tuong duong query `getAutoMeters` cu: isActive=true, isAuto=true, modbusId!=null, gatewayIp!=null.
// Bao ve bang header x-api-key (may-toi-may, khong dung session).
export async function GET(request: NextRequest) {
  const guard = requireCollectorKey(request);
  if (!guard.ok) return guard.response;

  const meters = await prisma.powerMeter.findMany({
    where: {
      isActive: true,
      isAuto: true,
      modbusId: { not: null },
      gatewayIp: { not: null },
    },
    select: {
      id: true,
      code: true,
      gatewayIp: true,
      gatewayPort: true,
      modbusId: true,
      registerAddr: true,
    },
    orderBy: [{ gatewayIp: "asc" }, { modbusId: "asc" }, { code: "asc" }],
  });

  return NextResponse.json({ meters });
}
