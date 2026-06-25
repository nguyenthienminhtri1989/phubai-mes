-- CreateEnum
CREATE TYPE "PowerDataSource" AS ENUM ('MANUAL', 'AUTO');

-- CreateTable
CREATE TABLE "PowerTransformer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "capacityKva" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PowerTransformer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PowerMeterGroup" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PowerMeterGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PowerMeter" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "meterNo" TEXT,
    "transformerId" TEXT,
    "groupId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isAuto" BOOLEAN NOT NULL DEFAULT false,
    "modbusId" INTEGER,
    "gatewayIp" TEXT,
    "gatewayPort" INTEGER NOT NULL DEFAULT 502,
    "registerAddr" INTEGER NOT NULL DEFAULT 0,
    "tu" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "ti" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PowerMeter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectricityPrice" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'NORMAL',
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElectricityPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PowerTelemetry" (
    "id" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "totalEnergy" DOUBLE PRECISION NOT NULL,
    "voltage" DOUBLE PRECISION,
    "current" DOUBLE PRECISION,
    "power" DOUBLE PRECISION,
    "powerFactor" DOUBLE PRECISION,
    "frequency" DOUBLE PRECISION,
    "rawData" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PowerTelemetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PowerRecord" (
    "id" TEXT NOT NULL,
    "recordDate" TIMESTAMP(3) NOT NULL,
    "meterId" TEXT NOT NULL,
    "dataSource" "PowerDataSource" NOT NULL DEFAULT 'MANUAL',
    "prevTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isReset" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PowerRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PowerTransformer_code_key" ON "PowerTransformer"("code");

-- CreateIndex
CREATE INDEX "PowerTransformer_isActive_idx" ON "PowerTransformer"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PowerMeterGroup_code_key" ON "PowerMeterGroup"("code");

-- CreateIndex
CREATE INDEX "PowerMeterGroup_isActive_idx" ON "PowerMeterGroup"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PowerMeter_code_key" ON "PowerMeter"("code");

-- CreateIndex
CREATE INDEX "PowerMeter_groupId_idx" ON "PowerMeter"("groupId");

-- CreateIndex
CREATE INDEX "PowerMeter_transformerId_idx" ON "PowerMeter"("transformerId");

-- CreateIndex
CREATE INDEX "PowerMeter_isActive_isAuto_idx" ON "PowerMeter"("isActive", "isAuto");

-- CreateIndex
CREATE UNIQUE INDEX "ElectricityPrice_type_key" ON "ElectricityPrice"("type");

-- CreateIndex
CREATE INDEX "PowerTelemetry_meterId_timestamp_idx" ON "PowerTelemetry"("meterId", "timestamp");

-- CreateIndex
CREATE INDEX "PowerTelemetry_timestamp_idx" ON "PowerTelemetry"("timestamp");

-- CreateIndex
CREATE INDEX "PowerRecord_recordDate_idx" ON "PowerRecord"("recordDate");

-- CreateIndex
CREATE INDEX "PowerRecord_meterId_idx" ON "PowerRecord"("meterId");

-- CreateIndex
CREATE INDEX "PowerRecord_dataSource_idx" ON "PowerRecord"("dataSource");

-- CreateIndex
CREATE UNIQUE INDEX "PowerRecord_recordDate_meterId_key" ON "PowerRecord"("recordDate", "meterId");

-- AddForeignKey
ALTER TABLE "PowerMeter" ADD CONSTRAINT "PowerMeter_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PowerMeterGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PowerMeter" ADD CONSTRAINT "PowerMeter_transformerId_fkey" FOREIGN KEY ("transformerId") REFERENCES "PowerTransformer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PowerTelemetry" ADD CONSTRAINT "PowerTelemetry_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "PowerMeter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PowerRecord" ADD CONSTRAINT "PowerRecord_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "PowerMeter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
