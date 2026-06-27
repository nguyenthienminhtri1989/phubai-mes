CREATE TABLE "PowerTransformerUnit" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "transformerId" TEXT,
    "manufacturer" TEXT,
    "manufacturingYear" INTEGER,
    "serialNumber" TEXT,
    "ratedCapacity" DOUBLE PRECISION,
    "ratedCapacityUnit" TEXT DEFAULT 'kVA',
    "voltageLevel" TEXT,
    "ratedCurrent" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PowerTransformerUnit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PowerTransformerUnit_code_key" ON "PowerTransformerUnit"("code");
CREATE INDEX "PowerTransformerUnit_transformerId_idx" ON "PowerTransformerUnit"("transformerId");
CREATE INDEX "PowerTransformerUnit_isActive_idx" ON "PowerTransformerUnit"("isActive");

ALTER TABLE "PowerTransformerUnit" ADD CONSTRAINT "PowerTransformerUnit_transformerId_fkey" FOREIGN KEY ("transformerId") REFERENCES "PowerTransformer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PowerMeter" ADD COLUMN "transformerUnitId" INTEGER;
CREATE INDEX "PowerMeter_transformerUnitId_idx" ON "PowerMeter"("transformerUnitId");
ALTER TABLE "PowerMeter" ADD CONSTRAINT "PowerMeter_transformerUnitId_fkey" FOREIGN KEY ("transformerUnitId") REFERENCES "PowerTransformerUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
