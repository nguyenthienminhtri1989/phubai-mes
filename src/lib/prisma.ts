import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to initialize Prisma Client.");
}

// Ep session timezone = UTC cho moi ket noi Prisma. Neu khong, session TZ mac dinh
// theo server (vd Postgres local Windows la Asia/Bangkok +7) khien Prisma ghi cac cot
// Timestamptz (PowerTelemetry.timestamp, PowerLiveReading.readAt) bi lech -7h. Ep UTC
// giup ghi/doc dung moc thoi gian, dong bo giua may dev (+7) va VPS.
const adapter = new PrismaPg({ connectionString, options: "-c timezone=UTC" });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}