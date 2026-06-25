import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const data = await prisma.factory.findMany({
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
    include: {
      _count: {
        select: { transformers: true },
      },
    },
  });

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const data = await prisma.factory.create({
    data: {
      code: String(body.code || "").trim(),
      name: String(body.name || "").trim(),
      description: body.description || null,
      location: body.location || null,
      isActive: body.isActive ?? true,
    },
  });

  return NextResponse.json(data, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const id = String(body.id || "");

  if (!id) {
    return NextResponse.json({ error: "Missing factory id" }, { status: 400 });
  }

  const data = await prisma.factory.update({
    where: { id },
    data: {
      code: String(body.code || "").trim(),
      name: String(body.name || "").trim(),
      description: body.description || null,
      location: body.location || null,
      isActive: body.isActive ?? true,
    },
  });

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const id = String(body.id || "");

  if (!id) {
    return NextResponse.json({ error: "Missing factory id" }, { status: 400 });
  }

  const used = await prisma.powerTransformer.count({ where: { factoryId: id } });
  if (used) {
    const data = await prisma.factory.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json(data);
  }

  await prisma.factory.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}