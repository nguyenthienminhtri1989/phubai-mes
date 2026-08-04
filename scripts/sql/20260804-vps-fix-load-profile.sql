-- ============================================================
-- VA CHUA DRIFT VPS: migration 20260804004613_add_power_load_profile_and_peak_monthly
--
-- LY DO: cot "PowerLiveReading"."power" da duoc them THANG vao DB VPS bang DBeaver
-- tu truoc ma khong co file migration nao ghi lai. Prisma khong biet dieu do nen khi
-- sinh migration moi da gop luon cau ALTER TABLE do vao -> chay tren VPS bao loi 42701
-- "column power already exists" -> ca migration bi danh dau FAILED.
--
-- File nay chay DUNG phan con thieu (2 bang moi + index + FK), BO cau ALTER TABLE
-- gay xung dot. KHONG sua file migration goc vi no da duoc ap dung thanh cong tren
-- may dev (sua se lam hong checksum -> Prisma bao "migration modified after applied").
--
-- CHAY THEO THU TU (tren VPS):
--   1) npx prisma migrate resolve --rolled-back 20260804004613_add_power_load_profile_and_peak_monthly
--   2) psql "$DATABASE_URL" -f scripts/sql/20260804-vps-fix-load-profile.sql
--   3) npx prisma migrate resolve --applied 20260804004613_add_power_load_profile_and_peak_monthly
--   4) npx prisma generate && npm run build && pm2 reload phubai-mes
--
-- An toan chay lai nhieu lan: tat ca deu dung IF NOT EXISTS / kiem tra ton tai.
-- ============================================================

BEGIN;

-- Phong ho: neu vi ly do nao do cot "power" CHUA co (vd DB dung moi), them vao.
-- Day chinh la cau lenh da gay loi trong migration goc, nay viet lai cho idempotent.
ALTER TABLE "PowerLiveReading" ADD COLUMN IF NOT EXISTS "power" DOUBLE PRECISION;

-- ---------- Bang duong cong phu tai (giu 3 nam) ----------
CREATE TABLE IF NOT EXISTS "PowerLoadProfile" (
    "id" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "factoryId" TEXT,
    "intervalStart" TIMESTAMPTZ NOT NULL,
    "minutes" DOUBLE PRECISION NOT NULL,
    "kwh" DOUBLE PRECISION NOT NULL,
    "avgKw" DOUBLE PRECISION NOT NULL,
    "srcGapMin" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PowerLoadProfile_pkey" PRIMARY KEY ("id")
);

-- ---------- Bang chot dinh thang (giu vinh vien) ----------
CREATE TABLE IF NOT EXISTS "PowerPeakMonthly" (
    "id" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "peakKw" DOUBLE PRECISION NOT NULL,
    "peakAt" TIMESTAMPTZ NOT NULL,
    "peakSrcGapMin" DOUBLE PRECISION NOT NULL,
    "totalKwh" DOUBLE PRECISION NOT NULL,
    "loadFactor" DOUBLE PRECISION NOT NULL,
    "contributions" JSONB,
    "meterCount" INTEGER NOT NULL,
    "intervalCount" INTEGER NOT NULL,
    "isMonthClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PowerPeakMonthly_pkey" PRIMARY KEY ("id")
);

-- ---------- Index ----------
-- Query chinh: duong cong 1 nha may trong 1 khoang thoi gian.
CREATE INDEX IF NOT EXISTS "PowerLoadProfile_factoryId_intervalStart_idx"
    ON "PowerLoadProfile"("factoryId", "intervalStart");

-- Phuc vu don du lieu qua 3 nam (index composite tren khong loc thuan intervalStart duoc).
CREATE INDEX IF NOT EXISTS "PowerLoadProfile_intervalStart_idx"
    ON "PowerLoadProfile"("intervalStart");

-- Idempotent upsert cua rollup + query theo nhom / theo tung dong ho.
CREATE UNIQUE INDEX IF NOT EXISTS "PowerLoadProfile_meterId_intervalStart_key"
    ON "PowerLoadProfile"("meterId", "intervalStart");

CREATE INDEX IF NOT EXISTS "PowerPeakMonthly_year_month_idx"
    ON "PowerPeakMonthly"("year", "month");

CREATE UNIQUE INDEX IF NOT EXISTS "PowerPeakMonthly_factoryId_year_month_key"
    ON "PowerPeakMonthly"("factoryId", "year", "month");

-- ---------- Foreign key ----------
-- Postgres khong co "ADD CONSTRAINT IF NOT EXISTS" -> kiem tra thu cong.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PowerLoadProfile_meterId_fkey'
    ) THEN
        ALTER TABLE "PowerLoadProfile"
            ADD CONSTRAINT "PowerLoadProfile_meterId_fkey"
            FOREIGN KEY ("meterId") REFERENCES "PowerMeter"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PowerPeakMonthly_factoryId_fkey'
    ) THEN
        ALTER TABLE "PowerPeakMonthly"
            ADD CONSTRAINT "PowerPeakMonthly_factoryId_fkey"
            FOREIGN KEY ("factoryId") REFERENCES "Factory"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

COMMIT;

-- ---------- Kiem tra sau khi chay ----------
-- \d "PowerLoadProfile"
-- \d "PowerPeakMonthly"
-- select column_name from information_schema.columns
--   where table_name = 'PowerLiveReading' and column_name = 'power';
