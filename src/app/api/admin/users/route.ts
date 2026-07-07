import { NextRequest, NextResponse } from "next/server";
import * as bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const userSelect = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  factoryId: true,
  factory: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const data = await prisma.user.findMany({
    select: userSelect,
    orderBy: [{ isActive: "desc" }, { username: "asc" }],
  });

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const fullName = String(body.fullName || "").trim();
  const role = String(body.role || "VIEWER");
  const factoryId = body.factoryId ? String(body.factoryId) : null;

  if (!username || !password || !fullName) {
    return NextResponse.json({ error: "Thiếu username, password hoặc họ tên" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Mật khẩu phải có ít nhất 6 ký tự" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "Username đã tồn tại" }, { status: 409 });
  }

  const data = await prisma.user.create({
    data: {
      username,
      password: await bcrypt.hash(password, 10),
      fullName,
      role: role as "ADMIN" | "MANAGER" | "EDITOR" | "VIEWER",
      factoryId,
      isActive: body.isActive ?? true,
    },
    select: userSelect,
  });

  return NextResponse.json(data, { status: 201 });
}
