import { NextResponse } from "next/server";
import { auth } from "@/auth";

export type AppRole = "ADMIN" | "EDITOR" | "VIEWER";

/**
 * ADMIN: xem/sửa/xóa mọi thứ, quản lý user.
 * EDITOR: xem mọi thứ + nhập/sửa chỉ số hàng ngày (PowerRecord MANUAL), không sửa danh mục/giá điện, không xóa.
 * VIEWER: chỉ xem.
 */
export function canEditDailyInput(role?: string | null) {
  return role === "ADMIN" || role === "EDITOR";
}

export function canManageCatalog(role?: string | null) {
  return role === "ADMIN";
}

export function canDelete(role?: string | null) {
  return role === "ADMIN";
}

export function canManageUsers(role?: string | null) {
  return role === "ADMIN";
}

/** Dùng ở đầu các route POST/PUT/DELETE cần quyền ADMIN (danh mục, giá điện, xóa, user). */
export async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session?.user) {
    return { ok: false as const, response: NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }) };
  }

  if (!canManageCatalog(role)) {
    return { ok: false as const, response: NextResponse.json({ error: "Bạn không có quyền thực hiện hành động này" }, { status: 403 }) };
  }

  return { ok: true as const, session };
}

/** Dùng ở đầu các route POST chốt chỉ số hàng ngày — ADMIN hoặc EDITOR. */
export async function requireEditor() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session?.user) {
    return { ok: false as const, response: NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }) };
  }

  if (!canEditDailyInput(role)) {
    return { ok: false as const, response: NextResponse.json({ error: "Bạn không có quyền thực hiện hành động này" }, { status: 403 }) };
  }

  return { ok: true as const, session };
}
