-- AlterTable
ALTER TABLE "ElectricityPrice" ADD COLUMN     "description" TEXT,
ADD COLUMN     "name" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "PowerMeter" ADD COLUMN     "type" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "PowerRecord" ADD COLUMN     "consNormal" DOUBLE PRECISION,
ADD COLUMN     "consOffPeak" DOUBLE PRECISION,
ADD COLUMN     "consPeak" DOUBLE PRECISION,
ADD COLUMN     "currNormal" DOUBLE PRECISION,
ADD COLUMN     "currOffPeak" DOUBLE PRECISION,
ADD COLUMN     "currPeak" DOUBLE PRECISION,
ADD COLUMN     "prevNormal" DOUBLE PRECISION,
ADD COLUMN     "prevOffPeak" DOUBLE PRECISION,
ADD COLUMN     "prevPeak" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "EnergyTypeCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnergyTypeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EnergyTypeCategory_code_key" ON "EnergyTypeCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EnergyTypeCategory_name_key" ON "EnergyTypeCategory"("name");

-- Backfill display name cho các dòng giá điện đã có
UPDATE "ElectricityPrice" SET "name" = 'Bình thường' WHERE "type" = 'NORMAL' AND "name" = '';
UPDATE "ElectricityPrice" SET "name" = 'Cao điểm' WHERE "type" = 'PEAK' AND "name" = '';
UPDATE "ElectricityPrice" SET "name" = 'Thấp điểm' WHERE "type" = 'OFF_PEAK' AND "name" = '';
