-- Danh muc Gateway Modbus + giam sat suc khoe gateway/collector.
-- MOI DONG Gateway = MOT BUS RS485 = MOT CONG COM. N520 hai cong -> 2 dong cung ipAddress,
-- khac port (COM1=502, COM2=503), vi hai bus co the hong doc lap nhau.

-- CreateTable: danh muc Gateway
CREATE TABLE "Gateway" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 502,
    "factoryId" TEXT,
    "location" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gateway_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Gateway_code_key" ON "Gateway"("code");
CREATE UNIQUE INDEX "Gateway_ipAddress_port_key" ON "Gateway"("ipAddress", "port");
CREATE INDEX "Gateway_factoryId_idx" ON "Gateway"("factoryId");
CREATE INDEX "Gateway_isActive_idx" ON "Gateway"("isActive");

ALTER TABLE "Gateway" ADD CONSTRAINT "Gateway_factoryId_fkey"
  FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: bao cao suc khoe tho cua tung bus gateway (collector day len moi chu ky)
CREATE TABLE "GatewayHealth" (
    "gatewayId" TEXT NOT NULL,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "lastOkAt" TIMESTAMPTZ,
    "lastErrorAt" TIMESTAMPTZ,
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "meterTotal" INTEGER NOT NULL DEFAULT 0,
    "meterOk" INTEGER NOT NULL DEFAULT 0,
    "meterFailed" INTEGER NOT NULL DEFAULT 0,
    "reportedAt" TIMESTAMPTZ NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GatewayHealth_pkey" PRIMARY KEY ("gatewayId")
);

CREATE INDEX "GatewayHealth_reportedAt_idx" ON "GatewayHealth"("reportedAt");

ALTER TABLE "GatewayHealth" ADD CONSTRAINT "GatewayHealth_gatewayId_fkey"
  FOREIGN KEY ("gatewayId") REFERENCES "Gateway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: nhip tim collector (mot dong duy nhat, id = 'default')
CREATE TABLE "CollectorHeartbeat" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "lastSeenAt" TIMESTAMPTZ NOT NULL,
    "gatewayTotal" INTEGER NOT NULL DEFAULT 0,
    "gatewayOnline" INTEGER NOT NULL DEFAULT 0,
    "meterTotal" INTEGER NOT NULL DEFAULT 0,
    "meterOk" INTEGER NOT NULL DEFAULT 0,
    "meterFailed" INTEGER NOT NULL DEFAULT 0,
    "bufferedCount" INTEGER NOT NULL DEFAULT 0,
    "intervalSec" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectorHeartbeat_pkey" PRIMARY KEY ("id")
);

-- AlterTable: dong ho tro toi danh muc Gateway
ALTER TABLE "PowerMeter" ADD COLUMN "gatewayId" TEXT;
CREATE INDEX "PowerMeter_gatewayId_idx" ON "PowerMeter"("gatewayId");
ALTER TABLE "PowerMeter" ADD CONSTRAINT "PowerMeter_gatewayId_fkey"
  FOREIGN KEY ("gatewayId") REFERENCES "Gateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: tao Gateway tu cac cap (gatewayIp, gatewayPort) da khai tren dong ho hien co,
-- de he thong dang chay khong mat cau hinh khi nang cap.
INSERT INTO "Gateway" ("id", "code", "name", "ipAddress", "port", "isActive", "createdAt", "updatedAt")
SELECT
    'gw_' || gen_random_uuid(),
    'GW-' || replace(pairs."gatewayIp", '.', '-') || '-' || pairs."gatewayPort",
    'Gateway ' || pairs."gatewayIp" || ':' || pairs."gatewayPort",
    pairs."gatewayIp",
    pairs."gatewayPort",
    true,
    now(),
    now()
FROM (
    SELECT DISTINCT "gatewayIp", "gatewayPort"
    FROM "PowerMeter"
    WHERE "gatewayIp" IS NOT NULL
) AS pairs
ON CONFLICT ("ipAddress", "port") DO NOTHING;

-- Link dong ho vao Gateway tuong ung
UPDATE "PowerMeter" pm
SET "gatewayId" = g."id"
FROM "Gateway" g
WHERE pm."gatewayIp" = g."ipAddress" AND pm."gatewayPort" = g."port";
