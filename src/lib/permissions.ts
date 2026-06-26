import { NextResponse } from "next/server";
import { auth } from "@/auth";

export type AppRole = "ADMIN" | "MANAGER" | "EDITOR" | "VIEWER";

/**
 * ADMIN: xem/sửa/xóa mọi thứ, quản lý user.
 * MANAGER: quản lý danh mục (nhà máy/trạm biến áp/đồng hồ/nhóm đồng hồ/loại điện) + giá điện,
 *          không quản lý user.
 * EDITOR: xem mọi thứ + nhập/sửa chỉ số hàng ngày (PowerRecord MANUAL), không sửa danh mục/giá điện, không xóa.
 * VIEWER: chỉ xem.
 */
export function canEditDailyInput(role?: string | null) {
  return role === "ADMIN" || role === "MANAGER" || role === "EDITOR";
}

export function canManageCatalog(role?: string | null) {
  return role === "ADMIN" || role === "MANAGER";
}

export function canDelete(role?: string | null) {
  return role === "ADMIN" || role === "MANAGER";
}

export function canManageUsers(role?: string | null) {
  return role === "ADMIN";
}

/** Dùng ở đầu các route POST/PUT/DELETE quản lý danh mục/giá điện — ADMIN hoặc MANAGER. */
export async function requireCatalogManager() {
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

/** Dùng ở đầu các route quản lý user — chỉ ADMIN. */
export async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session?.user) {
    return { ok: false as const, response: NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }) };
  }

  if (!canManageUsers(role)) {
    return { ok: false as const, response: NextResponse.json({ error: "Bạn không có quyền thực hiện hành động này" }, { status: 403 }) };
  }

  return { ok: true as const, session };
}

/** Dùng ở đầu các route POST chốt chỉ số hàng ngày / đọc realtime — ADMIN, MANAGER hoặc EDITOR. */
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
