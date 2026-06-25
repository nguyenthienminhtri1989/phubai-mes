import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const data = await prisma.energyTypeCategory.findMany({
    orderBy: [{ code: "asc" }],
  });

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const data = await prisma.energyTypeCategory.create({
    data: {
      code: String(body.code || "").trim(),
      name: String(body.name || "").trim(),
      note: body.note || null,
      isActive: body.isActive ?? true,
    },
  });

  return NextResponse.json(data, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const id = String(body.id || "");

  if (!id) {
    return NextResponse.json({ error: "Missing energy type id" }, { status: 400 });
  }

  const data = await prisma.energyTypeCategory.update({
    where: { id },
    data: {
      code: String(body.code || "").trim(),
      name: String(body.name || "").trim(),
      note: body.note || null,
      isActive: body.isActive ?? true,
    },
  });

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const id = String(body.id || "");

  if (!id) {
    return NextResponse.json({ error: "Missing energy type id" }, { status: 400 });
  }

  await prisma.energyTypeCategory.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
