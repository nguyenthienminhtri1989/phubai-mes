import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import * as bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        const username = String(credentials.username).trim();
        const password = String(credentials.password);

        const user = await prisma.user.findUnique({
          where: { username },
          include: { factoryScopes: { select: { factoryId: true } } },
        });
        if (!user) return null;
        if (!user.isActive) throw new Error("Tài khoản đã bị khóa");

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return null;

        return {
          id: user.id,
          name: user.fullName,
          username: user.username,
          role: user.role,
          factoryIds: user.factoryScopes.map((scope) => scope.factoryId),
        } as never;
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = (user as { username: string }).username;
        token.role = (user as { role: string }).role;
        token.factoryIds = (user as { factoryIds?: string[] }).factoryIds ?? [];
        return token;
      }

      // Các lần sau — refresh role/isActive từ DB để admin đổi quyền có hiệu lực ngay
      if (token.id) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            include: { factoryScopes: { select: { factoryId: true } } },
          });
          if (!dbUser || !dbUser.isActive) return null;
          token.role = dbUser.role;
          token.username = dbUser.username;
          token.factoryIds = dbUser.factoryScopes.map((scope) => scope.factoryId);
        } catch {
          // Nếu DB lỗi, giữ nguyên token cũ
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        (session.user as { username?: string }).username = token.username as string;
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { factoryIds?: string[] }).factoryIds = Array.isArray(token.factoryIds) ? token.factoryIds as string[] : [];
      }
      return session;
    },
  },
});
