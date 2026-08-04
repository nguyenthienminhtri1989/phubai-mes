-- AlterTable
ALTER TABLE "PowerLiveReading" ADD COLUMN     "power" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "PowerLoadProfile" (
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

-- CreateTable
CREATE TABLE "PowerPeakMonthly" (
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

-- CreateIndex
CREATE INDEX "PowerLoadProfile_factoryId_intervalStart_idx" ON "PowerLoadProfile"("factoryId", "intervalStart");

-- CreateIndex
CREATE INDEX "PowerLoadProfile_intervalStart_idx" ON "PowerLoadProfile"("intervalStart");

-- CreateIndex
CREATE UNIQUE INDEX "PowerLoadProfile_meterId_intervalStart_key" ON "PowerLoadProfile"("meterId", "intervalStart");

-- CreateIndex
CREATE INDEX "PowerPeakMonthly_year_month_idx" ON "PowerPeakMonthly"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PowerPeakMonthly_factoryId_year_month_key" ON "PowerPeakMonthly"("factoryId", "year", "month");

-- AddForeignKey
ALTER TABLE "PowerLoadProfile" ADD CONSTRAINT "PowerLoadProfile_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "PowerMeter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PowerPeakMonthly" ADD CONSTRAINT "PowerPeakMonthly_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
