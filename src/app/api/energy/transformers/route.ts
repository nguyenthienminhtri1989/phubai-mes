import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const factoryId = searchParams.get("factoryId");

  const data = await prisma.powerTransformer.findMany({
    where: {
      factoryId: factoryId || undefined,
    },
    include: {
      factory: true,
    },
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
  });

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const data = await prisma.powerTransformer.create({
    data: {
      code: String(body.code || "").trim(),
      name: String(body.name || "").trim(),
      factoryId: body.factoryId || null,
      location: body.location || null,
      capacityKva: body.capacityKva ? Number(body.capacityKva) : null,
      isActive: body.isActive ?? true,
    },
    include: {
      factory: true,
    },
  });

  return NextResponse.json(data, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const id = String(body.id || "");

  if (!id) {
    return NextResponse.json({ error: "Missing transformer id" }, { status: 400 });
  }

  const data = await prisma.powerTransformer.update({
    where: { id },
    data: {
      code: String(body.code || "").trim(),
      name: String(body.name || "").trim(),
      factoryId: body.factoryId || null,
      location: body.location || null,
      capacityKva: body.capacityKva ? Number(body.capacityKva) : null,
      isActive: body.isActive ?? true,
    },
    include: {
      factory: true,
    },
  });

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const id = String(body.id || "");

  if (!id) {
    return NextResponse.json({ error: "Missing transformer id" }, { status: 400 });
  }

  const used = await prisma.powerMeter.count({ where: { transformerId: id } });
  if (used) {
    const data = await prisma.powerTransformer.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json(data);
  }

  await prisma.powerTransformer.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}