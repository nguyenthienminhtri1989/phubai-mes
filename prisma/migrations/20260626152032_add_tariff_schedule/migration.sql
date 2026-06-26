-- CreateTable
CREATE TABLE "TariffScheduleVersion" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TariffScheduleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TariffTimeRange" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "dayType" TEXT NOT NULL,
    "priceType" TEXT NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "TariffTimeRange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TariffScheduleVersion_code_key" ON "TariffScheduleVersion"("code");

-- CreateIndex
CREATE INDEX "TariffScheduleVersion_isActive_idx" ON "TariffScheduleVersion"("isActive");

-- CreateIndex
CREATE INDEX "TariffTimeRange_versionId_idx" ON "TariffTimeRange"("versionId");

-- CreateIndex
CREATE INDEX "TariffTimeRange_versionId_dayType_idx" ON "TariffTimeRange"("versionId", "dayType");

-- AddForeignKey
ALTER TABLE "TariffTimeRange" ADD CONSTRAINT "TariffTimeRange_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "TariffScheduleVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: bieu khung gio EVN dang ap dung tinh hoa don (CURRENT_2014, active),
-- va bieu khung gio moi theo QD 963/QD-BCT da ban hanh nhung chua duoc dua vao tinh hoa don (NEW_2026, inactive).
INSERT INTO "TariffScheduleVersion" ("id", "code", "name", "isActive", "note", "updatedAt") VALUES
  ('tsv_current_2014', 'CURRENT_2014', 'Khung gio EVN hien hanh (truoc QD 963)', true, 'Dang dung de tinh hoa don thuc te', CURRENT_TIMESTAMP),
  ('tsv_new_2026', 'NEW_2026', 'Khung gio moi theo QD 963/QD-BCT (22/4/2026)', false, 'Da ban hanh nhung chua duoc EVN/BCT dua vao tinh hoa don - kich hoat khi co ngay ap dung chinh thuc', CURRENT_TIMESTAMP);

-- CURRENT_2014 - Thu Hai den Thu Bay (WEEKDAY)
INSERT INTO "TariffTimeRange" ("id", "versionId", "dayType", "priceType", "startMinute", "endMinute") VALUES
  ('ttr_c14_wd_1', 'tsv_current_2014', 'WEEKDAY', 'OFF_PEAK', 0, 240),
  ('ttr_c14_wd_2', 'tsv_current_2014', 'WEEKDAY', 'NORMAL', 240, 570),
  ('ttr_c14_wd_3', 'tsv_current_2014', 'WEEKDAY', 'PEAK', 570, 690),
  ('ttr_c14_wd_4', 'tsv_current_2014', 'WEEKDAY', 'NORMAL', 690, 1020),
  ('ttr_c14_wd_5', 'tsv_current_2014', 'WEEKDAY', 'PEAK', 1020, 1200),
  ('ttr_c14_wd_6', 'tsv_current_2014', 'WEEKDAY', 'NORMAL', 1200, 1320),
  ('ttr_c14_wd_7', 'tsv_current_2014', 'WEEKDAY', 'OFF_PEAK', 1320, 1440);

-- CURRENT_2014 - Chu Nhat (SUNDAY, khong co Cao diem)
INSERT INTO "TariffTimeRange" ("id", "versionId", "dayType", "priceType", "startMinute", "endMinute") VALUES
  ('ttr_c14_su_1', 'tsv_current_2014', 'SUNDAY', 'OFF_PEAK', 0, 240),
  ('ttr_c14_su_2', 'tsv_current_2014', 'SUNDAY', 'NORMAL', 240, 1320),
  ('ttr_c14_su_3', 'tsv_current_2014', 'SUNDAY', 'OFF_PEAK', 1320, 1440);

-- NEW_2026 - Thu Hai den Thu Bay (WEEKDAY)
INSERT INTO "TariffTimeRange" ("id", "versionId", "dayType", "priceType", "startMinute", "endMinute") VALUES
  ('ttr_n26_wd_1', 'tsv_new_2026', 'WEEKDAY', 'OFF_PEAK', 0, 360),
  ('ttr_n26_wd_2', 'tsv_new_2026', 'WEEKDAY', 'NORMAL', 360, 1050),
  ('ttr_n26_wd_3', 'tsv_new_2026', 'WEEKDAY', 'PEAK', 1050, 1350),
  ('ttr_n26_wd_4', 'tsv_new_2026', 'WEEKDAY', 'NORMAL', 1350, 1440);

-- NEW_2026 - Chu Nhat (SUNDAY, khong co Cao diem)
INSERT INTO "TariffTimeRange" ("id", "versionId", "dayType", "priceType", "startMinute", "endMinute") VALUES
  ('ttr_n26_su_1', 'tsv_new_2026', 'SUNDAY', 'OFF_PEAK', 0, 360),
  ('ttr_n26_su_2', 'tsv_new_2026', 'SUNDAY', 'NORMAL', 360, 1440);
