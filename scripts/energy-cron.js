import "dotenv/config";
import cron from "node-cron";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { readSelecTotalEnergy } from "../src/lib/energy-modbus.ts";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to run energy cron.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function nowVN() {
  return new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

function yesterdayAtVietnamMidnight() {
  const todayStr = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const yesterday = new Date(`${todayStr}T12:00:00.000+07:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  return new Date(`${yesterday.toISOString().slice(0, 10)}T12:00:00.000+07:00`);
}

async function collectTelemetry() {
  console.log(`\n[${nowVN()}] Bat dau thu thap telemetry dien nang...`);

  const autoMeters = await prisma.powerMeter.findMany({
    where: {
      isActive: true,
      isAuto: true,
      modbusId: { not: null },
      gatewayIp: { not: null },
    },
    orderBy: [{ gatewayIp: "asc" }, { modbusId: "asc" }],
  });

  if (autoMeters.length === 0) {
    console.log("Chua co dong ho AUTO nao duoc cau hinh du Gateway IP va Modbus ID.");
    return;
  }

  const gateways = new Map();
  for (const meter of autoMeters) {
    const key = `${meter.gatewayIp}:${meter.gatewayPort || 502}`;
    gateways.set(key, [...(gateways.get(key) || []), meter]);
  }

  for (const [gatewayKey, metersOnGateway] of gateways.entries()) {
    console.log(`\n--- Gateway ${gatewayKey} ---`);

    for (const meter of metersOnGateway) {
      try {
        const totalEnergy = await readSelecTotalEnergy(meter);
        await prisma.powerTelemetry.create({
          data: {
            meterId: meter.id,
            totalEnergy,
          },
        });
        console.log(`  + ${meter.code} (ID ${meter.modbusId}): ${totalEnergy} kWh`);
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error) {
        console.error(`  - Loi doc ${meter.code} (ID ${meter.modbusId}): ${error.message}`);
      }
    }
  }

  console.log("Hoan tat chu ky thu thap telemetry.");
}

async function closeDailyRecords() {
  console.log(`\n[${nowVN()}] Bat dau chot so dien nang luc 08:00...`);

  const recordDate = yesterdayAtVietnamMidnight();
  const autoMeters = await prisma.powerMeter.findMany({
    where: { isActive: true, isAuto: true },
    orderBy: { code: "asc" },
  });
  const priceRecord = await prisma.electricityPrice.findUnique({
    where: { type: "NORMAL" },
  });
  const unitPrice = priceRecord?.price ?? 0;

  for (const meter of autoMeters) {
    const latestTelemetry = await prisma.powerTelemetry.findFirst({
      where: { meterId: meter.id },
      orderBy: { timestamp: "desc" },
    });

    if (!latestTelemetry) {
      console.log(`[Bo qua] ${meter.code}: chua co telemetry.`);
      continue;
    }

    const lastRecord = await prisma.powerRecord.findFirst({
      where: {
        meterId: meter.id,
        recordDate: { lt: recordDate },
      },
      orderBy: { recordDate: "desc" },
    });

    const prevTotal = lastRecord?.currTotal ?? 0;
    const currTotal = latestTelemetry.totalEnergy;
    const isReset = currTotal < prevTotal;
    const delta = isReset ? currTotal : Math.max(0, currTotal - prevTotal);
    const consTotal = delta * meter.tu * meter.ti;
    const costTotal = consTotal * unitPrice;

    await prisma.powerRecord.upsert({
      where: {
        recordDate_meterId: {
          recordDate,
          meterId: meter.id,
        },
      },
      update: {
        dataSource: "AUTO",
        prevTotal,
        currTotal,
        unitPrice,
        isReset,
        consTotal,
        costTotal,
      },
      create: {
        recordDate,
        meterId: meter.id,
        dataSource: "AUTO",
        prevTotal,
        currTotal,
        unitPrice,
        isReset,
        consTotal,
        costTotal,
      },
    });

    console.log(`[Chot so] ${meter.code}: ${consTotal.toFixed(2)} kWh, ${costTotal.toLocaleString("vi-VN")} VND`);
  }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const deletedData = await prisma.powerTelemetry.deleteMany({
    where: { timestamp: { lt: sixMonthsAgo } },
  });

  console.log(`[Don dep] Da xoa ${deletedData.count} telemetry cu hon 6 thang.`);
}

cron.schedule("0 * * * *", collectTelemetry, {
  scheduled: true,
  timezone: "Asia/Ho_Chi_Minh",
});

cron.schedule("0 8 * * *", closeDailyRecords, {
  scheduled: true,
  timezone: "Asia/Ho_Chi_Minh",
});

console.log("Energy cron da khoi dong. Thu thap moi gio, chot so luc 08:00 gio Viet Nam.");
