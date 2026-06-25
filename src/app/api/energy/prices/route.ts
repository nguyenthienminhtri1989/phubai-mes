import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const data = await prisma.electricityPrice.findMany({
    orderBy: [{ type: "asc" }],
  });

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const type = String(body.type || "NORMAL").trim().toUpperCase();
  const data = await prisma.electricityPrice.upsert({
    where: { type },
    update: {
      name: body.name || undefined,
      price: Number(body.price || 0),
      description: body.description || null,
      effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
      note: body.note || null,
    },
    create: {
      type,
      name: body.name || type,
      price: Number(body.price || 0),
      description: body.description || null,
      effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
      note: body.note || null,
    },
  });

  return NextResponse.json(data);
}

export async function PUT(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const id = String(body.id || "");

  if (!id) {
    return NextResponse.json({ error: "Missing price id" }, { status: 400 });
  }

  const data = await prisma.electricityPrice.update({
    where: { id },
    data: {
      name: body.name || undefined,
      price: Number(body.price || 0),
      description: body.description || null,
      effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : undefined,
      note: body.note || null,
    },
  });

  return NextResponse.json(data);
}
