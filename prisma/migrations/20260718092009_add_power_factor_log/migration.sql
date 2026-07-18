-- CreateTable
CREATE TABLE "PowerFactorLog" (
    "id" TEXT NOT NULL,
    "recordDate" TIMESTAMP(3) NOT NULL,
    "meterId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "pfA" DOUBLE PRECISION,
    "pfB" DOUBLE PRECISION,
    "pfC" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PowerFactorLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PowerFactorLog_recordDate_idx" ON "PowerFactorLog"("recordDate");

-- CreateIndex
CREATE INDEX "PowerFactorLog_meterId_idx" ON "PowerFactorLog"("meterId");

-- CreateIndex
CREATE UNIQUE INDEX "PowerFactorLog_recordDate_meterId_key" ON "PowerFactorLog"("recordDate", "meterId");

-- AddForeignKey
ALTER TABLE "PowerFactorLog" ADD CONSTRAINT "PowerFactorLog_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "PowerMeter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
