import "dotenv/config";
import crypto from "node:crypto";
import cron from "node-cron";
import ModbusRTU from "modbus-serial";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to run energy cron.");
}

const pool = new Pool({ connectionString });
let keepProcessAlive = false;

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

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

function parseSelecFloat(buffer, offset = 0) {
  const fixedBuffer = Buffer.alloc(4);
  fixedBuffer[0] = buffer[offset + 2];
  fixedBuffer[1] = buffer[offset + 3];
  fixedBuffer[2] = buffer[offset + 0];
  fixedBuffer[3] = buffer[offset + 1];
  return fixedBuffer.readFloatBE(0);
}

async function getAutoMeters(requireConnection = false) {
  const connectionFilter = requireConnection
    ? 'and "modbusId" is not null and "gatewayIp" is not null'
    : "";
  const result = await pool.query(
    `select "id", "code", "name", "isActive", "isAuto", "modbusId", "gatewayIp", "gatewayPort", "registerAddr", "tu", "ti"
     from "PowerMeter"
     where "isActive" = true and "isAuto" = true ${connectionFilter}
     order by "gatewayIp" asc nulls last, "modbusId" asc nulls last, "code" asc`,
  );
  return result.rows;
}

async function collectTelemetry() {
  console.log(`
[${nowVN()}] Bat dau thu thap telemetry dien nang theo tung Gateway...`);

  const autoMeters = await getAutoMeters(true);
  if (autoMeters.length === 0) {
    console.log("Chua co dong ho AUTO nao duoc cau hinh du Gateway IP va Modbus ID.");
    return { inserted: 0, success: 0, failed: 0 };
  }

  const gateways = new Map();
  for (const meter of autoMeters) {
    const key = `${meter.gatewayIp}:${meter.gatewayPort || 502}`;
    gateways.set(key, [...(gateways.get(key) || []), meter]);
  }

  let inserted = 0;
  let success = 0;
  let failed = 0;

  for (const [gatewayKey, metersOnGateway] of gateways.entries()) {
    const [ip, portStr] = gatewayKey.split(":");
    const port = Number.parseInt(portStr || "502", 10);

    console.log(`
--- Dang ket noi Gateway [${ip}:${port}] ---`);
    const client = new ModbusRTU();

    try {
      await client.connectTCP(ip.trim(), { port });
      client.setTimeout(2500);

      for (const meter of metersOnGateway) {
        try {
          client.setID(meter.modbusId);
          const data = await client.readInputRegisters(meter.registerAddr || 0, 2);
          const totalEnergy = Number(parseSelecFloat(data.buffer, 0).toFixed(2));

          await pool.query(
            `insert into "PowerTelemetry" ("id", "meterId", "totalEnergy", "timestamp")
             values ($1, $2, $3, now())`,
            [newId("telemetry"), meter.id, totalEnergy],
          );
          inserted += 1;
          success += 1;
          console.log(`  + Dong ho ${meter.code} (ID ${meter.modbusId}): ${totalEnergy} kWh`);

          await new Promise((resolve) => setTimeout(resolve, 50));
        } catch (meterError) {
          failed += 1;
          console.error(
            `  - Loi dong ho ${meter.code} (ID ${meter.modbusId}): Doc that bai (${meterError.message})`,
          );
        }
      }
    } catch (gatewayError) {
      failed += metersOnGateway.length;
      console.error(
        `Loi mang: Khong the ket noi Gateway ${ip}:${port}. Bo qua ${metersOnGateway.length} dong ho. Loi: ${gatewayError.message}`,
      );
    } finally {
      client.close();
    }
  }

  console.log("Hoan tat chu ky quet tat ca Gateway.");
  return { inserted, success, failed };
}

async function closeDailyRecords() {
  console.log(`
[${nowVN()}] Bat dau chot so dien nang luc 08:00...`);

  const recordDate = yesterdayAtVietnamMidnight();
  const autoMeters = await getAutoMeters(false);
  const priceResult = await pool.query('select "price" from "ElectricityPrice" where "type" = $1 limit 1', ["NORMAL"]);
  const unitPrice = Number(priceResult.rows[0]?.price ?? 0);
  let closed = 0;

  for (const meter of autoMeters) {
    const latestTelemetry = await pool.query(
      `select "totalEnergy" from "PowerTelemetry"
       where "meterId" = $1
       order by "timestamp" desc
       limit 1`,
      [meter.id],
    );

    if (latestTelemetry.rowCount === 0) {
      console.log(`[Bo qua] ${meter.code}: chua co telemetry.`);
      continue;
    }

    const lastRecord = await pool.query(
      `select "currTotal" from "PowerRecord"
       where "meterId" = $1 and "recordDate" < $2
       order by "recordDate" desc
       limit 1`,
      [meter.id, recordDate],
    );

    const prevTotal = Number(lastRecord.rows[0]?.currTotal ?? 0);
    const currTotal = Number(latestTelemetry.rows[0].totalEnergy ?? 0);
    const isReset = currTotal < prevTotal;
    const delta = isReset ? currTotal : Math.max(0, currTotal - prevTotal);
    const consTotal = delta * Number(meter.tu ?? 1) * Number(meter.ti ?? 1);
    const costTotal = consTotal * unitPrice;

    await pool.query(
      `insert into "PowerRecord" (
         "id", "recordDate", "meterId", "dataSource", "prevTotal", "currTotal", "unitPrice", "isReset", "consTotal", "costTotal", "createdAt", "updatedAt"
       ) values ($1, $2, $3, 'AUTO', $4, $5, $6, $7, $8, $9, now(), now())
       on conflict ("recordDate", "meterId") do update set
         "dataSource" = 'AUTO',
         "prevTotal" = excluded."prevTotal",
         "currTotal" = excluded."currTotal",
         "unitPrice" = excluded."unitPrice",
         "isReset" = excluded."isReset",
         "consTotal" = excluded."consTotal",
         "costTotal" = excluded."costTotal",
         "updatedAt" = now()`,
      [newId("record"), recordDate, meter.id, prevTotal, currTotal, unitPrice, isReset, consTotal, costTotal],
    );

    closed += 1;
    console.log(`[Chot so] ${meter.code}: ${consTotal.toFixed(2)} kWh, ${costTotal.toLocaleString("vi-VN")} VND`);
  }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const deletedData = await pool.query('delete from "PowerTelemetry" where "timestamp" < $1', [sixMonthsAgo]);
  console.log(`[Don dep] Da xoa ${deletedData.rowCount} telemetry cu hon 6 thang.`);

  return { closed, deletedTelemetry: deletedData.rowCount };
}

async function printStatus() {
  const autoMeters = await pool.query(
    `select m."id", m."code", m."name", m."modbusId", m."gatewayIp", m."gatewayPort", m."registerAddr",
            (select count(*)::int from "PowerTelemetry" t where t."meterId" = m."id") as telemetry_count,
            (select count(*)::int from "PowerRecord" r where r."meterId" = m."id") as record_count
     from "PowerMeter" m
     where m."isActive" = true and m."isAuto" = true
     order by m."code" asc`,
  );
  const telemetryCount = await pool.query('select count(*)::int as count from "PowerTelemetry"');
  const recordCount = await pool.query('select count(*)::int as count from "PowerRecord"');
  const latestTelemetry = await pool.query(
    `select t."totalEnergy", t."timestamp", m."code", m."name"
     from "PowerTelemetry" t
     join "PowerMeter" m on m."id" = t."meterId"
     order by t."timestamp" desc
     limit 1`,
  );

  console.log("Energy cron status");
  console.log(`AUTO meters: ${autoMeters.rowCount}`);
  for (const meter of autoMeters.rows) {
    const configStatus = meter.modbusId && meter.gatewayIp ? "OK" : "THIEU_CAU_HINH";
    console.log(
      `- ${meter.code} | ${meter.name} | ${configStatus} | gateway=${meter.gatewayIp || "N/A"}:${meter.gatewayPort || 502} | modbusId=${meter.modbusId || "N/A"} | telemetry=${meter.telemetry_count} | records=${meter.record_count}`,
    );
  }
  console.log(`PowerTelemetry total: ${telemetryCount.rows[0].count}`);
  console.log(`PowerRecord total: ${recordCount.rows[0].count}`);
  if (latestTelemetry.rowCount > 0) {
    const latest = latestTelemetry.rows[0];
    console.log(`Latest telemetry: ${latest.code} | ${latest.totalEnergy} kWh | ${new Date(latest.timestamp).toISOString()}`);
  } else {
    console.log("Latest telemetry: none");
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));

  if (args.has("--status")) {
    await printStatus();
    return;
  }

  if (args.has("--collect-once") || args.has("--once")) {
    const before = await pool.query('select count(*)::int as count from "PowerTelemetry"');
    const result = await collectTelemetry();
    const after = await pool.query('select count(*)::int as count from "PowerTelemetry"');
    console.log(`Telemetry rows before: ${before.rows[0].count}, after: ${after.rows[0].count}, inserted: ${after.rows[0].count - before.rows[0].count}`);
    if (result.failed > 0) process.exitCode = 2;
    return;
  }

  if (args.has("--close-once")) {
    await closeDailyRecords();
    return;
  }

  keepProcessAlive = true;

  cron.schedule("0 * * * *", collectTelemetry, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh",
  });

  cron.schedule("0 8 * * *", closeDailyRecords, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh",
  });

  console.log("Energy cron da khoi dong. Thu thap moi gio, chot so luc 08:00 gio Viet Nam.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!keepProcessAlive) {
      await pool.end().catch(() => {});
    }
  });
