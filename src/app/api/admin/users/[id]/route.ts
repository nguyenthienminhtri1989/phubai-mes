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

function hasFactoryUpdate(body: Record<string, unknown>) {
  return Object.prototype.hasOwnProperty.call(body, "factoryIds") || Object.prototype.hasOwnProperty.call(body, "factoryId");
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

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await request.json();
  const target = await prisma.user.findUnique({ where: { id } });

  if (!target) {
    return NextResponse.json({ error: "Khong tim thay user" }, { status: 404 });
  }

  const nextRole = String(body.role || target.role);
  const nextIsActive = body.isActive ?? target.isActive;

  if (target.role === "ADMIN" && (nextRole !== "ADMIN" || !nextIsActive)) {
    const otherActiveAdmins = await prisma.user.count({
      where: { role: "ADMIN", isActive: true, id: { not: id } },
    });
    if (otherActiveAdmins === 0) {
      return NextResponse.json(
        { error: "Khong the ha quyen/khoa ADMIN cuoi cung con hoat dong" },
        { status: 400 },
      );
    }
  }

  const password = body.password ? String(body.password) : undefined;
  if (password && password.length < 6) {
    return NextResponse.json({ error: "Mat khau phai co it nhat 6 ky tu" }, { status: 400 });
  }

  const factoryIds = normalizeFactoryIds(body.factoryIds ?? body.factoryId);
  const shouldUpdateFactories = hasFactoryUpdate(body as Record<string, unknown>);

  const data = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        fullName: body.fullName ? String(body.fullName).trim() : undefined,
        role: nextRole as "ADMIN" | "MANAGER" | "EDITOR" | "VIEWER",
        isActive: nextIsActive,
        password: password ? await bcrypt.hash(password, 10) : undefined,
      },
    });

    if (shouldUpdateFactories) {
      await tx.userFactoryScope.deleteMany({ where: { userId: id } });
      if (factoryIds.length) {
        await tx.userFactoryScope.createMany({
          data: factoryIds.map((factoryId) => ({ userId: id, factoryId })),
          skipDuplicates: true,
        });
      }
    }

    return tx.user.findUniqueOrThrow({ where: { id }, select: userSelect });
  });

  return NextResponse.json(presentUser(data));
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });

  if (!target) {
    return NextResponse.json({ error: "Khong tim thay user" }, { status: 404 });
  }

  if (target.role === "ADMIN") {
    const otherActiveAdmins = await prisma.user.count({
      where: { role: "ADMIN", isActive: true, id: { not: id } },
    });
    if (otherActiveAdmins === 0) {
      return NextResponse.json(
        { error: "Khong the khoa ADMIN cuoi cung con hoat dong" },
        { status: 400 },
      );
    }
  }

  const data = await prisma.user.update({
    where: { id },
    data: { isActive: false },
    select: userSelect,
  });

  return NextResponse.json(presentUser(data));
}
