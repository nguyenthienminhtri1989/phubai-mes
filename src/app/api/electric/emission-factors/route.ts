import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCatalogManager } from "@/lib/permissions";

type Payload = {
  id?: string;
  year?: number | string;
  factorKgCo2ePerKwh?: number | string;
  source?: string | null;
  effectiveFrom?: string | null;
  note?: string | null;
  isActive?: boolean;
};

function cleanText(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

function parsePayload(body: Payload) {
  const year = Number(body.year);
  const factor = Number(body.factorKgCo2ePerKwh);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Năm áp dụng phải nằm trong khoảng 2000-2100");
  }
  if (!Number.isFinite(factor) || factor < 0) {
    throw new Error("Hệ số phát thải phải là số không âm");
  }

  return {
    year,
    factorKgCo2ePerKwh: factor,
    source: cleanText(body.source),
    effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
    note: cleanText(body.note),
    isActive: body.isActive !== false,
  };
}

export async function GET() {
  const rows = await prisma.emissionFactor.findMany({
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const guard = await requireCatalogManager();
  if (!guard.ok) return guard.response;

  try {
    const data = parsePayload((await request.json()) as Payload);
    const row = await prisma.emissionFactor.create({ data });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không lưu được hệ số phát thải" },
      { status: 400 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const guard = await requireCatalogManager();
  if (!guard.ok) return guard.response;

  try {
    const body = (await request.json()) as Payload;
    if (!body.id) throw new Error("Thiếu ID hệ số phát thải");
    const data = parsePayload(body);
    const row = await prisma.emissionFactor.update({ where: { id: body.id }, data });
    return NextResponse.json(row);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không cập nhật được hệ số phát thải" },
      { status: 400 },
    );
  }
}
