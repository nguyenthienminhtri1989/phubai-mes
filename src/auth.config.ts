import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    // authorized() chạy trong Middleware (Edge runtime) — chỉ kiểm tra đã login hay chưa.
    // Không đặt jwt/session ở đây vì auth.config.ts không có Prisma (Edge-safe).
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith("/login");

      if (isOnLogin) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
        return true;
      }

      return isLoggedIn;
    },
  },
  providers: [], // Để trống, sẽ nạp Credentials provider ở auth.ts
} satisfies NextAuthConfig;
