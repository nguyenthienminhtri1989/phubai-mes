import { NextRequest, NextResponse } from "next/server";
import * as bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const userSelect = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await request.json();
  const target = await prisma.user.findUnique({ where: { id } });

  if (!target) {
    return NextResponse.json({ error: "Không tìm thấy user" }, { status: 404 });
  }

  const nextRole = String(body.role || target.role);
  const nextIsActive = body.isActive ?? target.isActive;

  // Chặn tự hạ quyền/khóa chính mình nếu mình là ADMIN cuối cùng đang hoạt động
  if (target.role === "ADMIN" && (nextRole !== "ADMIN" || !nextIsActive)) {
    const otherActiveAdmins = await prisma.user.count({
      where: { role: "ADMIN", isActive: true, id: { not: id } },
    });
    if (otherActiveAdmins === 0) {
      return NextResponse.json(
        { error: "Không thể hạ quyền/khóa ADMIN cuối cùng còn hoạt động" },
        { status: 400 },
      );
    }
  }

  const password = body.password ? String(body.password) : undefined;
  if (password && password.length < 6) {
    return NextResponse.json({ error: "Mật khẩu phải có ít nhất 6 ký tự" }, { status: 400 });
  }

  const data = await prisma.user.update({
    where: { id },
    data: {
      fullName: body.fullName ? String(body.fullName).trim() : undefined,
      role: nextRole as "ADMIN" | "MANAGER" | "EDITOR" | "VIEWER",
      isActive: nextIsActive,
      password: password ? await bcrypt.hash(password, 10) : undefined,
    },
    select: userSelect,
  });

  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });

  if (!target) {
    return NextResponse.json({ error: "Không tìm thấy user" }, { status: 404 });
  }

  if (target.role === "ADMIN") {
    const otherActiveAdmins = await prisma.user.count({
      where: { role: "ADMIN", isActive: true, id: { not: id } },
    });
    if (otherActiveAdmins === 0) {
      return NextResponse.json(
        { error: "Không thể khóa ADMIN cuối cùng còn hoạt động" },
        { status: 400 },
      );
    }
  }

  // Khóa tài khoản thay vì xóa cứng, để giữ lịch sử
  const data = await prisma.user.update({
    where: { id },
    data: { isActive: false },
    select: userSelect,
  });

  return NextResponse.json(data);
}
