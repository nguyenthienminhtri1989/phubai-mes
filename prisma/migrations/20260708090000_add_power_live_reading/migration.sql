-- CreateTable: ban doc moi nhat cho realtime (co che PUSH tu collector)
CREATE TABLE "PowerLiveReading" (
    "meterId" TEXT NOT NULL,
    "totalEnergy" DOUBLE PRECISION NOT NULL,
    "readAt" TIMESTAMPTZ NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PowerLiveReading_pkey" PRIMARY KEY ("meterId")
);

-- CreateIndex
CREATE INDEX "PowerLiveReading_readAt_idx" ON "PowerLiveReading"("readAt");

-- AddForeignKey
ALTER TABLE "PowerLiveReading" ADD CONSTRAINT "PowerLiveReading_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "PowerMeter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
