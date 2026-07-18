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

// Mốc chốt nghiệp vụ vẫn là 06:00 giờ Việt Nam, dùng để xác định cửa sổ điện 24h.
// Cron thực thi trễ 15 phút để collector có thời gian ghi đủ telemetry 06:00 của mọi đồng hồ.
const CLOSING_HOUR = 6;
const CLOSING_RUN_MINUTE = 15;

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

// Cùng 1 "ngày" với recordDate (mốc giữa trưa +07:00) nhưng trả về thời điểm CLOSING_HOUR VN của ngày đó,
// dùng để xác định đúng cửa sổ chốt số 24h (ví dụ 06:00 hôm trước -> 06:00 hôm nay).
function vnDateAtHour(noonAnchor, hour) {
  const dateStr = noonAnchor.toISOString().slice(0, 10);
  return new Date(`${dateStr}T${String(hour).padStart(2, "0")}:00:00.000+07:00`);
}

const vnFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Ho_Chi_Minh",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
});

function vnDayPosition(date) {
  const parts = vnFormatter.formatToParts(date);
  const map = {};
  for (const part of parts) map[part.type] = part.value;
  return {
    minuteOfDay: Number(map.hour) * 60 + Number(map.minute),
    dayType: map.weekday === "Sun" ? "SUNDAY" : "WEEKDAY",
  };
}

function overlapMinutesByBand(ranges, dayType, startMinute, endMinute) {
  const result = { NORMAL: 0, PEAK: 0, OFF_PEAK: 0 };
  for (const range of ranges) {
    if (range.dayType !== dayType) continue;
    const overlapStart = Math.max(startMinute, range.startMinute);
    const overlapEnd = Math.min(endMinute, range.endMinute);
    if (overlapEnd > overlapStart) result[range.priceType] += overlapEnd - overlapStart;
  }
  return result;
}

async function getActiveTariffRanges() {
  const version = await pool.query('select "id" from "TariffScheduleVersion" where "isActive" = true limit 1');
  if (version.rowCount === 0) return [];
  const ranges = await pool.query(
    'select "dayType", "priceType", "startMinute", "endMinute" from "TariffTimeRange" where "versionId" = $1',
    [version.rows[0].id],
  );
  return ranges.rows;
}

/**
 * Tách tổng sản lượng tiêu thụ giữa các lần đọc telemetry liên tiếp (cách nhau ~1 giờ) thành
 * 3 khung giá, theo tỷ lệ phút giao nhau với biểu khung giờ đang active. Trả về null nếu không
 * đủ dữ liệu (chưa có biểu khung giờ active, hoặc ít hơn 2 lần đọc trong cửa sổ chốt số).
 */
function splitTelemetryByTariff(ranges, readings) {
  if (ranges.length === 0 || readings.length < 2) return null;

  const result = { NORMAL: 0, PEAK: 0, OFF_PEAK: 0 };
  for (let i = 1; i < readings.length; i++) {
    const prev = readings[i - 1];
    const curr = readings[i];
    const delta = Number(curr.totalEnergy) - Number(prev.totalEnergy);
    if (delta <= 0) continue; // Bỏ qua khoảng có reset/giảm

    const prevTs = new Date(prev.timestamp);
    const currTs = new Date(curr.timestamp);
    const { minuteOfDay: startMinute, dayType } = vnDayPosition(prevTs);
    const durationMinutes = Math.round((currTs.getTime() - prevTs.getTime()) / 60000);
    if (durationMinutes <= 0) continue;
    const endMinute = startMinute + durationMinutes;

    const overlap = overlapMinutesByBand(ranges, dayType, startMinute, endMinute);
    const totalMinutes = overlap.NORMAL + overlap.PEAK + overlap.OFF_PEAK;
    if (totalMinutes <= 0) continue;

    result.NORMAL += (delta * overlap.NORMAL) / totalMinutes;
    result.PEAK += (delta * overlap.PEAK) / totalMinutes;
    result.OFF_PEAK += (delta * overlap.OFF_PEAK) / totalMinutes;
  }
  return result;
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
    `select "id", "code", "name", "isActive", "isAuto", "type", "modbusId", "gatewayIp", "gatewayPort", "registerAddr", "tu", "ti"
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
[${nowVN()}] Bat dau chot so dien nang luc ${String(CLOSING_HOUR).padStart(2, "0")}:00...`);

  const recordDate = yesterdayAtVietnamMidnight();
  const windowStart = vnDateAtHour(recordDate, CLOSING_HOUR);
  const windowEnd = vnDateAtHour(recordDate, CLOSING_HOUR);
  windowEnd.setDate(windowEnd.getDate() + 1); // CLOSING_HOUR giờ hôm nay (kết thúc cửa sổ chốt số 24h)

  const autoMeters = await getAutoMeters(false);
  const priceRows = await pool.query('select "type", "price" from "ElectricityPrice"');
  const priceByType = {};
  for (const row of priceRows.rows) priceByType[row.type] = Number(row.price ?? 0);
  const unitPrice = priceByType.NORMAL ?? 0;
  const tariffRanges = await getActiveTariffRanges();
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
    const tu = Number(meter.tu ?? 1);
    const ti = Number(meter.ti ?? 1);

    // Lần chốt ĐẦU TIÊN của đồng hồ (chưa có bản ghi kỳ trước để trừ): lưu chỉ số hiện tại
    // làm MỐC GỐC (prev = curr, tiêu thụ = 0). Từ ngày sau mới lấy hiệu để ra sản lượng.
    // Nếu không, ngày đầu sẽ tính nhầm cả chỉ số lũy kế của đồng hồ thành tiêu thụ 1 ngày.
    if (lastRecord.rowCount === 0) {
      await pool.query(
        `insert into "PowerRecord" (
           "id", "recordDate", "meterId", "dataSource", "prevTotal", "currTotal", "unitPrice", "isReset",
           "consTotal", "consNormal", "consPeak", "consOffPeak", "costTotal", "note", "createdAt", "updatedAt"
         ) values ($1, $2, $3, 'AUTO', $4, $5, $6, false, 0, null, null, null, 0, $7, now(), now())
         on conflict ("recordDate", "meterId") do update set
           "dataSource" = 'AUTO',
           "prevTotal" = excluded."prevTotal",
           "currTotal" = excluded."currTotal",
           "unitPrice" = excluded."unitPrice",
           "isReset" = false,
           "consTotal" = 0,
           "consNormal" = null,
           "consPeak" = null,
           "consOffPeak" = null,
           "costTotal" = 0,
           "note" = excluded."note",
           "updatedAt" = now()`,
        [newId("record"), recordDate, meter.id, currTotal, currTotal, unitPrice, "Chỉ số đầu kỳ (baseline) - chưa tính tiêu thụ"],
      );
      closed += 1;
      console.log(`[Moc goc] ${meter.code}: luu chi so dau ky ${currTotal} kWh, chua tinh tieu thu.`);
      continue;
    }

    const isReset = currTotal < prevTotal;

    // Đồng hồ tụt số (nghi reset/thay/tràn): không tự tính tiêu thụ, ghi cờ + cảnh báo
    // để người vận hành kiểm tra và nhập tay chỉ số cắt nếu cần (tránh tạo dữ liệu sai).
    if (isReset) {
      await pool.query(
        `insert into "PowerRecord" (
           "id", "recordDate", "meterId", "dataSource", "prevTotal", "currTotal", "unitPrice", "isReset",
           "consTotal", "consNormal", "consPeak", "consOffPeak", "costTotal", "note", "createdAt", "updatedAt"
         ) values ($1, $2, $3, 'AUTO', $4, $5, $6, true, 0, null, null, null, 0, $7, now(), now())
         on conflict ("recordDate", "meterId") do update set
           "dataSource" = 'AUTO',
           "prevTotal" = excluded."prevTotal",
           "currTotal" = excluded."currTotal",
           "unitPrice" = excluded."unitPrice",
           "isReset" = true,
           "consTotal" = 0,
           "consNormal" = null,
           "consPeak" = null,
           "consOffPeak" = null,
           "costTotal" = 0,
           "note" = excluded."note",
           "updatedAt" = now()`,
        [newId("record"), recordDate, meter.id, prevTotal, currTotal, unitPrice, "Nghi reset/thay đồng hồ (chỉ số mới < kỳ trước) - chưa tính tiêu thụ, cần kiểm tra & nhập tay"],
      );
      closed += 1;
      console.log(`[Nghi reset] ${meter.code}: chi so moi ${currTotal} < ky truoc ${prevTotal}, chua tinh tieu thu, cho kiem tra.`);
      continue;
    }

    const delta = Math.max(0, currTotal - prevTotal);
    const consTotal = delta * tu * ti;

    // Đồng hồ Hạ thế (type=1) đọc AUTO theo giờ: tách tiêu thụ theo 3 khung giá từ hourly telemetry
    // trong cửa sổ chốt số CLOSING_HOUR hôm trước -> CLOSING_HOUR hôm nay, dựa trên biểu khung giờ đang active.
    let consNormal = null;
    let consPeak = null;
    let consOffPeak = null;
    let costTotal = consTotal * unitPrice;

    if (meter.type !== 2 && !isReset) {
      const windowReadings = await pool.query(
        `select "totalEnergy", "timestamp" from "PowerTelemetry"
         where "meterId" = $1 and "timestamp" >= $2 and "timestamp" <= $3
         order by "timestamp" asc`,
        [meter.id, windowStart, windowEnd],
      );
      const split = splitTelemetryByTariff(
        tariffRanges,
        windowReadings.rows.map((r) => ({ totalEnergy: Number(r.totalEnergy), timestamp: new Date(r.timestamp) })),
      );
      if (split) {
        consNormal = split.NORMAL * tu * ti;
        consPeak = split.PEAK * tu * ti;
        consOffPeak = split.OFF_PEAK * tu * ti;
        costTotal =
          consNormal * (priceByType.NORMAL ?? 0) +
          consPeak * (priceByType.PEAK ?? 0) +
          consOffPeak * (priceByType.OFF_PEAK ?? 0);
      }
    }

    await pool.query(
      `insert into "PowerRecord" (
         "id", "recordDate", "meterId", "dataSource", "prevTotal", "currTotal", "unitPrice", "isReset",
         "consTotal", "consNormal", "consPeak", "consOffPeak", "costTotal", "createdAt", "updatedAt"
       ) values ($1, $2, $3, 'AUTO', $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now())
       on conflict ("recordDate", "meterId") do update set
         "dataSource" = 'AUTO',
         "prevTotal" = excluded."prevTotal",
         "currTotal" = excluded."currTotal",
         "unitPrice" = excluded."unitPrice",
         "isReset" = excluded."isReset",
         "consTotal" = excluded."consTotal",
         "consNormal" = excluded."consNormal",
         "consPeak" = excluded."consPeak",
         "consOffPeak" = excluded."consOffPeak",
         "costTotal" = excluded."costTotal",
         "updatedAt" = now()`,
      [newId("record"), recordDate, meter.id, prevTotal, currTotal, unitPrice, isReset, consTotal, consNormal, consPeak, consOffPeak, costTotal],
    );

    closed += 1;
    const splitInfo = consNormal != null ? ` (BT ${consNormal.toFixed(1)} / CD ${consPeak.toFixed(1)} / TD ${consOffPeak.toFixed(1)})` : " (chua tach duoc khung gio)";
    console.log(`[Chot so] ${meter.code}: ${consTotal.toFixed(2)} kWh${splitInfo}, ${costTotal.toLocaleString("vi-VN")} VND`);
  }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const deletedData = await pool.query('delete from "PowerTelemetry" where "timestamp" < $1', [sixMonthsAgo]);
  console.log(`[Don dep] Da xoa ${deletedData.rowCount} telemetry cu hon 6 thang.`);

  // Cos phi chi phuc vu theo doi xu huong ngan han (thay tu bu kip thoi), khong dung tinh tien
  // -> giu 35 ngay la du xem 1 thang gan nhat, khong can luu lau.
  const pfCutoff = new Date();
  pfCutoff.setDate(pfCutoff.getDate() - 35);
  const deletedPf = await pool.query('delete from "PowerFactorLog" where "recordDate" < $1', [pfCutoff]);
  console.log(`[Don dep] Da xoa ${deletedPf.rowCount} ban ghi cos phi cu hon 35 ngay.`);

  return { closed, deletedTelemetry: deletedData.rowCount, deletedPowerFactor: deletedPf.rowCount };
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

  // Co che PUSH: telemetry theo gio do collector (energy-push-collector.js) day len qua
  // /api/collector/ingest. Cron server KHONG con thu Modbus theo gio nua, chi con chot so
  // hang ngay + don telemetry cu. Van giu `collectTelemetry` + `--collect-once` de test tay.
  cron.schedule(`${CLOSING_RUN_MINUTE} ${CLOSING_HOUR} * * *`, closeDailyRecords, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh",
  });

  console.log(`Energy cron da khoi dong (che do PUSH). Moc du lieu ${String(CLOSING_HOUR).padStart(2, "0")}:00, thuc thi chot luc ${String(CLOSING_HOUR).padStart(2, "0")}:${String(CLOSING_RUN_MINUTE).padStart(2, "0")} gio Viet Nam; telemetry do collector day len.`);
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
