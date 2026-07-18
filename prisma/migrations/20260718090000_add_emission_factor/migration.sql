CREATE TABLE "EmissionFactor" (
  "id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "factorKgCo2ePerKwh" DOUBLE PRECISION NOT NULL,
  "source" TEXT,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmissionFactor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmissionFactor_year_key" ON "EmissionFactor"("year");
CREATE INDEX "EmissionFactor_isActive_idx" ON "EmissionFactor"("isActive");
CREATE INDEX "EmissionFactor_year_idx" ON "EmissionFactor"("year");
