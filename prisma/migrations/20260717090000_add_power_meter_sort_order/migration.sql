ALTER TABLE "PowerMeter" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "PowerMeter_sortOrder_idx" ON "PowerMeter"("sortOrder");
