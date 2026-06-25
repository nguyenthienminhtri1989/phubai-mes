import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const meterId = searchParams.get("meterId");
  const take = Number(searchParams.get("take") || 100);

  const data = await prisma.powerTelemetry.findMany({
    where: {
      meterId: meterId || undefined,
    },
    include: {
      meter: true,
    },
    orderBy: { timestamp: "desc" },
    take: Math.min(take, 500),
  });

  return NextResponse.json(data);
}
