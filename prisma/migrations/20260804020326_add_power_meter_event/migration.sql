-- CreateTable
CREATE TABLE "PowerMeterEvent" (
    "id" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "prevTotal" DOUBLE PRECISION,
    "currTotal" DOUBLE PRECISION,
    "impliedKw" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "note" TEXT,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PowerMeterEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PowerMeterEvent_meterId_occurredAt_idx" ON "PowerMeterEvent"("meterId", "occurredAt");

-- CreateIndex
CREATE INDEX "PowerMeterEvent_occurredAt_idx" ON "PowerMeterEvent"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "PowerMeterEvent_meterId_occurredAt_kind_key" ON "PowerMeterEvent"("meterId", "occurredAt", "kind");

-- AddForeignKey
ALTER TABLE "PowerMeterEvent" ADD CONSTRAINT "PowerMeterEvent_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "PowerMeter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
