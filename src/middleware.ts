import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // Chặn tất cả, trừ trang login, API auth, API collector (tự bảo vệ bằng x-api-key), file tĩnh
  matcher: [
    "/((?!login|api/auth|api/collector|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.svg|.*\\.jpg|.*\\.jpeg|.*\\.webp|.*\\.ico).*)",
  ],
};
