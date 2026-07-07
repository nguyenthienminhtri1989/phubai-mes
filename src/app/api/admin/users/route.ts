import { NextRequest, NextResponse } from "next/server";
import * as bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const userSelect = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  factoryScopes: {
    include: { factory: true },
    orderBy: { factory: { code: "asc" as const } },
  },
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

function normalizeFactoryIds(value: unknown) {
  if (Array.isArray(value)) return Array.from(new Set(value.map(String).filter(Boolean)));
  if (value) return [String(value)];
  return [];
}

function presentUser(user: { factoryScopes?: { factoryId: string; factory: unknown }[]; [key: string]: unknown }) {
  const scopes = user.factoryScopes || [];
  return {
    ...user,
    factoryIds: scopes.map((scope) => scope.factoryId),
    factories: scopes.map((scope) => scope.factory),
    factoryId: scopes[0]?.factoryId ?? null,
    factory: scopes[0]?.factory ?? null,
  };
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const data = await prisma.user.findMany({
    select: userSelect,
    orderBy: [{ isActive: "desc" }, { username: "asc" }],
  });

  return NextResponse.json(data.map(presentUser));
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const fullName = String(body.fullName || "").trim();
  const role = String(body.role || "VIEWER");
  const factoryIds = normalizeFactoryIds(body.factoryIds ?? body.factoryId);

  if (!username || !password || !fullName) {
    return NextResponse.json({ error: "Thieu username, password hoac ho ten" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Mat khau phai co it nhat 6 ky tu" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "Username da ton tai" }, { status: 409 });
  }

  const data = await prisma.user.create({
    data: {
      username,
      password: await bcrypt.hash(password, 10),
      fullName,
      role: role as "ADMIN" | "MANAGER" | "EDITOR" | "VIEWER",
      isActive: body.isActive ?? true,
      factoryScopes: factoryIds.length
        ? { create: factoryIds.map((factoryId) => ({ factoryId })) }
        : undefined,
    },
    select: userSelect,
  });

  return NextResponse.json(presentUser(data), { status: 201 });
}
