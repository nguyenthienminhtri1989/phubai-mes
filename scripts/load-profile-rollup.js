import "dotenv/config";
import crypto from "node:crypto";
import pg from "pg";

// ============================================================
// Load Profile Rollup — dựng đường cong phụ tải + chốt công suất đỉnh tháng
//
// CHẠY Ở ĐÂU: VPS, crontab 06:30 giờ VN (SAU khi energy-cron chốt số lúc 06:15).
// Tiến trình RIÊNG, không đụng vào energy-cron.js — hỏng cái này không kéo sập chốt số.
//
// LÀM GÌ:
//   1. Đọc PowerTelemetry (chỉ số lũy kế thô) của đồng hồ HẠ THẾ AUTO
//   2. Lấy hiệu 2 lần đọc liên tiếp -> kWh tiêu thụ, rải vào các khoảng 30 phút
//   3. Ghi vào PowerLoadProfile (idempotent, giữ 3 năm)
//   4. Tính lại PowerPeakMonthly cho các tháng bị ảnh hưởng (giữ vĩnh viễn)
//   5. Dọn PowerLoadProfile quá 3 năm
//
// CÁCH DÙNG:
//   node load-profile-rollup.js                      # mặc định: 2 ngày gần nhất
//   node load-profile-rollup.js --days 30            # 30 ngày gần nhất
//   node load-profile-rollup.js --from 2025-01-01 --to 2025-06-30
//   node load-profile-rollup.js --backfill-all       # toàn bộ telemetry đang có
//   node load-profile-rollup.js --status             # xem tình trạng, không ghi gì
//   node load-profile-rollup.js --no-cleanup         # bỏ qua bước dọn dữ liệu cũ
//
// LUÔN UPSERT: chạy lại bao nhiêu lần cũng ra cùng kết quả. Bắt buộc phải vậy vì
// chắc chắn sẽ có lúc phát hiện sai công thức và cần tính lại nhiều tháng.
// ============================================================

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run load profile rollup.");
}
const pool = new Pool({ connectionString });

const TZ = "Asia/Ho_Chi_Minh";

// Độ dài một khoảng phụ tải. PHẢI khớp BUCKET_MS trong api/collector/ingest/route.ts.
const BUCKET_MIN = 30;
const BUCKET_MS = BUCKET_MIN * 60_000;

// Khoảng cách tối đa giữa 2 lần đọc telemetry mà ta còn chấp nhận nội suy.
// Vượt ngưỡng này (collector chết lâu) thì BỎ HẲN, để lại lỗ hổng nhìn thấy được,
// thay vì rải sản lượng của nhiều giờ ra và tạo ra đường cong bịa.
const MAX_SPAN_MIN = 180;

// Số phút tối thiểu một khoảng phải có dữ liệu thì mới được xét làm ĐỈNH.
// Không dùng để loại khỏi bảng (vẫn lưu, vẫn tính vào tổng kWh) — chỉ loại khỏi việc chọn đỉnh,
// vì khoảng thiếu dữ liệu cho ước lượng nhiễu.
const MIN_MINUTES_FOR_PEAK = 25;

// Đường cong giữ 3 năm. PowerPeakMonthly (rất nhỏ) giữ vĩnh viễn nên câu hỏi
// "cả năm qua tháng nào đỉnh cao nhất" vẫn trả lời được sau khi đường cong bị dọn.
const PROFILE_RETENTION_DAYS = 365 * 3;

const UPSERT_CHUNK = 500;

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function nowVN() {
  return new Date().toLocaleString("vi-VN", { timeZone: TZ });
}

// ---------- Tiện ích ngày giờ theo múi giờ VN ----------
// KHÔNG dùng new Date() thô để tính ngày nghiệp vụ: nó phụ thuộc timezone của hệ điều hành.
// VPS đổi timezone hoặc chạy UTC là ra sai ngày ngay. Luôn neo vào "+07:00" tường minh.

function vnDateStr(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
}

/** Thời điểm 00:00 giờ VN của một ngày, trả về Date (instant tuyệt đối). */
function vnDayStart(dateStr) {
  return new Date(`${dateStr}T00:00:00.000+07:00`);
}

function addDaysStr(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00.000+07:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return vnDateStr(d);
}

/** Liệt kê các ngày VN từ from đến to (bao gồm cả hai đầu). */
function enumerateDates(fromStr, toStr) {
  const out = [];
  let cur = fromStr;
  let guard = 0;
  while (cur <= toStr && guard < 4000) {
    out.push(cur);
    cur = addDaysStr(cur, 1);
    guard += 1;
  }
  return out;
}

function vnMonthStart(year, month) {
  return new Date(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01T00:00:00.000+07:00`);
}

function vnNextMonthStart(year, month) {
  return month === 12 ? vnMonthStart(year + 1, 1) : vnMonthStart(year, month + 1);
}

// ---------- Bước 1: dựng đường cong phụ tải ----------

async function getLvAutoMeters() {
  // factoryId lấy trực tiếp từ đồng hồ, thiếu thì suy từ trạm biến áp
  // (giống resolveFactory ở phía giao diện).
  const res = await pool.query(
    `select m."id", m."code", m."name", m."tu", m."ti",
            coalesce(m."factoryId", t."factoryId") as factory_id
     from "PowerMeter" m
     left join "PowerTransformer" t on t."id" = m."transformerId"
     where m."isActive" = true and m."isAuto" = true and m."type" = 1
     order by m."code" asc`,
  );
  return res.rows;
}

/**
 * Rải sản lượng giữa 2 lần đọc telemetry liên tiếp vào các khoảng 30 phút mà nó phủ.
 *
 * TẠI SAO PHẢI RẢI THEO Δt THỰC TẾ: nếu collector chết 2 giờ, hai bản đọc cách nhau 2h.
 * Lấy ΔkWh chia cho 0.5h (giả định khoảng chuẩn) sẽ ra công suất cao GẤP 4 -> đỉnh giả,
 * và đỉnh giả đó sẽ chiếm luôn ngôi đỉnh tháng. Chia cho Δt THỰC TẾ thì đỉnh chỉ bị
 * LÀM PHẲNG (ước lượng thấp) — sai số an toàn, không bao giờ bịa ra đỉnh không có thật.
 *
 * Trả về Map: bucketMs -> { kwh, minutes, srcGapMin }
 */
function distributeIntoBuckets(readings, tu, ti) {
  const buckets = new Map();

  for (let i = 1; i < readings.length; i++) {
    const prev = readings[i - 1];
    const curr = readings[i];

    const prevMs = prev.ts;
    const currMs = curr.ts;
    const spanMin = (currMs - prevMs) / 60_000;

    if (spanMin <= 0) continue;
    if (spanMin > MAX_SPAN_MIN) continue; // gap quá dài -> để lỗ hổng, không bịa

    const delta = curr.energy - prev.energy;
    if (delta < 0) continue; // đồng hồ reset/thay -> bỏ, giống logic chốt số
    if (!Number.isFinite(delta)) continue;

    const kwhTotal = delta * tu * ti;

    // Cắt khoảng [prevMs, currMs) theo từng biên 30 phút, chia sản lượng theo tỷ lệ phút.
    let cursor = prevMs;
    while (cursor < currMs) {
      const bucketStart = Math.floor(cursor / BUCKET_MS) * BUCKET_MS;
      const bucketEnd = bucketStart + BUCKET_MS;
      const segEnd = Math.min(currMs, bucketEnd);
      const segMin = (segEnd - cursor) / 60_000;

      if (segMin > 0) {
        const entry = buckets.get(bucketStart) || { kwh: 0, minutes: 0, srcGapMin: 0 };
        entry.kwh += (kwhTotal * segMin) / spanMin;
        entry.minutes += segMin;
        entry.srcGapMin = Math.max(entry.srcGapMin, spanMin);
        buckets.set(bucketStart, entry);
      }

      cursor = segEnd;
    }
  }

  return buckets;
}

async function upsertProfiles(rows) {
  if (rows.length === 0) return 0;
  let written = 0;

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const values = [];
    const params = [];
    let p = 1;

    for (const r of chunk) {
      values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, now())`);
      params.push(newId("lp"), r.meterId, r.factoryId, r.intervalStart, r.minutes, r.kwh, r.avgKw, r.srcGapMin);
    }

    await pool.query(
      `insert into "PowerLoadProfile"
         ("id", "meterId", "factoryId", "intervalStart", "minutes", "kwh", "avgKw", "srcGapMin", "createdAt")
       values ${values.join(", ")}
       on conflict ("meterId", "intervalStart") do update set
         "factoryId" = excluded."factoryId",
         "minutes"   = excluded."minutes",
         "kwh"       = excluded."kwh",
         "avgKw"     = excluded."avgKw",
         "srcGapMin" = excluded."srcGapMin"`,
      params,
    );
    written += chunk.length;
  }

  return written;
}

async function buildLoadProfile(fromStr, toStr) {
  const meters = await getLvAutoMeters();
  if (meters.length === 0) {
    console.log("Chua co dong ho HA THE AUTO nao. Bo qua buoc dung duong cong.");
    return { meters: 0, intervals: 0 };
  }

  const rangeStart = vnDayStart(fromStr);
  const rangeEnd = vnDayStart(addDaysStr(toStr, 1));

  // Lùi thêm MAX_SPAN_MIN để có bản đọc TRƯỚC mốc đầu: nếu không, khoảng đầu tiên của
  // ngày sẽ mất vì không có gì để trừ.
  const fetchStart = new Date(rangeStart.getTime() - MAX_SPAN_MIN * 60_000);

  console.log(
    `Dung duong cong phu tai: ${fromStr} -> ${toStr} (${meters.length} dong ho ha the AUTO)`,
  );

  let totalIntervals = 0;
  let metersWithData = 0;

  for (const meter of meters) {
    const tel = await pool.query(
      `select "totalEnergy", "timestamp" from "PowerTelemetry"
       where "meterId" = $1 and "timestamp" >= $2 and "timestamp" < $3
       order by "timestamp" asc`,
      [meter.id, fetchStart, rangeEnd],
    );

    if (tel.rowCount < 2) continue;

    const readings = tel.rows.map((r) => ({
      energy: Number(r.totalEnergy),
      ts: new Date(r.timestamp).getTime(),
    }));

    const tu = Number(meter.tu ?? 1) || 1;
    const ti = Number(meter.ti ?? 1) || 1;
    const buckets = distributeIntoBuckets(readings, tu, ti);

    const rows = [];
    for (const [bucketMs, v] of buckets) {
      // Chỉ ghi các khoảng NẰM TRONG phạm vi yêu cầu. Khoảng thuộc phần lùi thêm được
      // tính ra nhưng bỏ đi, vì nó thiếu dữ liệu đầu -> lần chạy của chính ngày đó lo.
      if (bucketMs < rangeStart.getTime() || bucketMs >= rangeEnd.getTime()) continue;
      if (v.minutes <= 0) continue;

      rows.push({
        meterId: meter.id,
        factoryId: meter.factory_id,
        intervalStart: new Date(bucketMs),
        minutes: Number(v.minutes.toFixed(2)),
        kwh: Number(v.kwh.toFixed(4)),
        avgKw: Number((v.kwh / (v.minutes / 60)).toFixed(3)),
        srcGapMin: Number(v.srcGapMin.toFixed(1)),
      });
    }

    if (rows.length > 0) {
      await upsertProfiles(rows);
      totalIntervals += rows.length;
      metersWithData += 1;
    }
  }

  console.log(`  -> ${totalIntervals} khoang cua ${metersWithData}/${meters.length} dong ho.`);
  return { meters: metersWithData, intervals: totalIntervals };
}

// ---------- Bước 2: chốt đỉnh tháng ----------

/**
 * ĐỈNH CỦA TỔNG ≠ TỔNG CÁC ĐỈNH.
 * Phải CỘNG tất cả đồng hồ theo từng khoảng 30 phút TRƯỚC (group by intervalStart),
 * rồi mới lấy max của chuỗi tổng đó. Cộng các giá trị đỉnh riêng lẻ của từng nhánh
 * sẽ ra con số không bao giờ tồn tại trong thực tế.
 *
 * Join sang PowerMeter để lọc excludeFromTotal LÚC QUERY (không đóng băng vào bảng):
 * đồng hồ tổng trùm là cấu hình có thể đổi, đóng băng sẽ làm báo cáo cũ/mới mâu thuẫn.
 */
async function computeMonthlyPeak(factoryId, year, month) {
  const start = vnMonthStart(year, month);
  const end = vnNextMonthStart(year, month);

  const agg = await pool.query(
    `select p."intervalStart",
            sum(p."avgKw")   as kw,
            sum(p."kwh")     as kwh,
            count(*)::int    as meter_count,
            min(p."minutes") as min_minutes,
            max(p."srcGapMin") as max_gap
     from "PowerLoadProfile" p
     join "PowerMeter" m on m."id" = p."meterId"
     where p."factoryId" = $1 and p."intervalStart" >= $2 and p."intervalStart" < $3
       and m."excludeFromTotal" = false
     group by p."intervalStart"
     order by p."intervalStart" asc`,
    [factoryId, start, end],
  );

  if (agg.rowCount === 0) return null;

  const rows = agg.rows.map((r) => ({
    intervalStart: new Date(r.intervalStart),
    kw: Number(r.kw),
    kwh: Number(r.kwh),
    meterCount: Number(r.meter_count),
    minMinutes: Number(r.min_minutes),
    maxGap: Number(r.max_gap),
  }));

  // Tổng tiêu thụ tính trên TẤT CẢ khoảng (kWh là đại lượng bảo toàn, cộng luôn đúng).
  const totalKwh = rows.reduce((s, r) => s + r.kwh, 0);

  // Số đồng hồ báo cáo đông nhất trong tháng = "đầy đủ". Tự hiệu chỉnh theo thực tế,
  // không cần khai báo cứng đồng hồ nào phải có.
  const fullMeterCount = rows.reduce((mx, r) => Math.max(mx, r.meterCount), 0);

  // Chỉ khoảng ĐỦ đồng hồ và ĐỦ phút mới được xét làm đỉnh: khoảng thiếu đồng hồ cộng
  // thiếu (tưởng tải thấp), khoảng thiếu phút cho ước lượng nhiễu.
  const eligible = rows.filter(
    (r) => r.meterCount === fullMeterCount && r.minMinutes >= MIN_MINUTES_FOR_PEAK,
  );

  if (eligible.length === 0) return null;

  // Hòa nhau -> lấy khoảng SỚM HƠN. Phải có quy tắc rõ ràng, nếu không mỗi lần chạy lại
  // ra kết quả khác nhau và không ai còn tin vào con số.
  let peak = eligible[0];
  for (const r of eligible) {
    if (r.kw > peak.kw) peak = r;
  }

  const meanKw = eligible.reduce((s, r) => s + r.kw, 0) / eligible.length;
  const loadFactor = peak.kw > 0 ? meanKw / peak.kw : 0;

  // Đồng hồ nào góp bao nhiêu kW tại ĐÚNG khoảnh khắc đỉnh — biết khi nào đỉnh mà không
  // biết cắt cái gì thì báo cáo vô dụng.
  const contrib = await pool.query(
    `select p."meterId", m."code", m."name", p."avgKw", p."kwh"
     from "PowerLoadProfile" p
     join "PowerMeter" m on m."id" = p."meterId"
     where p."factoryId" = $1 and p."intervalStart" = $2 and m."excludeFromTotal" = false
     order by p."avgKw" desc`,
    [factoryId, peak.intervalStart],
  );

  const contributions = contrib.rows.map((r) => ({
    meterId: r.meterId,
    code: r.code,
    name: r.name,
    kw: Number(Number(r.avgKw).toFixed(2)),
    kwh: Number(Number(r.kwh).toFixed(2)),
  }));

  return {
    peakKw: Number(peak.kw.toFixed(2)),
    peakAt: peak.intervalStart,
    peakSrcGapMin: Number(peak.maxGap.toFixed(1)),
    totalKwh: Number(totalKwh.toFixed(2)),
    loadFactor: Number(loadFactor.toFixed(4)),
    contributions,
    meterCount: peak.meterCount,
    intervalCount: eligible.length,
    isMonthClosed: end.getTime() <= Date.now(),
  };
}

async function rollupMonths(monthKeys) {
  const factories = await pool.query('select "id", "code", "name" from "Factory" where "isActive" = true');
  let written = 0;

  for (const factory of factories.rows) {
    for (const key of monthKeys) {
      const [year, month] = key.split("-").map(Number);
      const result = await computeMonthlyPeak(factory.id, year, month);
      if (!result) continue;

      await pool.query(
        `insert into "PowerPeakMonthly"
           ("id", "factoryId", "year", "month", "peakKw", "peakAt", "peakSrcGapMin", "totalKwh",
            "loadFactor", "contributions", "meterCount", "intervalCount", "isMonthClosed",
            "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), now())
         on conflict ("factoryId", "year", "month") do update set
           "peakKw"        = excluded."peakKw",
           "peakAt"        = excluded."peakAt",
           "peakSrcGapMin" = excluded."peakSrcGapMin",
           "totalKwh"      = excluded."totalKwh",
           "loadFactor"    = excluded."loadFactor",
           "contributions" = excluded."contributions",
           "meterCount"    = excluded."meterCount",
           "intervalCount" = excluded."intervalCount",
           "isMonthClosed" = excluded."isMonthClosed",
           "updatedAt"     = now()`,
        [
          newId("peak"),
          factory.id,
          year,
          month,
          result.peakKw,
          result.peakAt,
          result.peakSrcGapMin,
          result.totalKwh,
          result.loadFactor,
          JSON.stringify(result.contributions),
          result.meterCount,
          result.intervalCount,
          result.isMonthClosed,
        ],
      );

      written += 1;
      const closedTag = result.isMonthClosed ? "da chot" : "dang chay";
      console.log(
        `  [${factory.code}] ${year}-${String(month).padStart(2, "0")}: dinh ${result.peakKw} kW ` +
          `luc ${result.peakAt.toLocaleString("vi-VN", { timeZone: TZ })}, ` +
          `he so phu tai ${result.loadFactor.toFixed(2)}, ${result.intervalCount} khoang (${closedTag})`,
      );
    }
  }

  return written;
}

// ---------- Bước 3: dọn dữ liệu quá hạn ----------

async function cleanupOldProfiles() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PROFILE_RETENTION_DAYS);
  const res = await pool.query('delete from "PowerLoadProfile" where "intervalStart" < $1', [cutoff]);
  console.log(`[Don dep] Da xoa ${res.rowCount} khoang phu tai cu hon 3 nam.`);
  return res.rowCount;
}

/**
 * Cảnh báo sớm nếu rollup đã không chạy nhiều ngày. Telemetry chỉ giữ 90 ngày —
 * nếu rollup hỏng âm thầm quá lâu, dữ liệu thô sẽ bị dọn TRƯỚC KHI kịp tính đường cong
 * và mất vĩnh viễn. Phát hiện sớm quan trọng hơn là phát hiện đúng.
 */
async function warnIfStale() {
  const res = await pool.query('select max("intervalStart") as last from "PowerLoadProfile"');
  const last = res.rows[0]?.last ? new Date(res.rows[0].last) : null;
  if (!last) return;

  const lagDays = Math.floor((Date.now() - last.getTime()) / 86_400_000);
  if (lagDays >= 7) {
    console.error(
      `[CANH BAO] Duong cong phu tai moi nhat da ${lagDays} ngay truoc. Telemetry chi giu 90 ngay ` +
        `-> neu de qua lau, du lieu tho se bi xoa truoc khi kip tinh. Kiem tra cron 06:30 ngay.`,
    );
    process.exitCode = 3;
  }
}

// ---------- Trạng thái ----------

async function printStatus() {
  const [profile, peaks, telemetry] = await Promise.all([
    pool.query(
      `select count(*)::int as rows, min("intervalStart") as first, max("intervalStart") as last,
              count(distinct "meterId")::int as meters
       from "PowerLoadProfile"`,
    ),
    pool.query('select count(*)::int as rows from "PowerPeakMonthly"'),
    pool.query(
      `select count(*)::int as rows, min("timestamp") as first, max("timestamp") as last
       from "PowerTelemetry"`,
    ),
  ]);

  const p = profile.rows[0];
  const t = telemetry.rows[0];

  console.log("=== Trang thai Load Profile Rollup ===");
  console.log(`PowerTelemetry    : ${t.rows} dong | ${t.first || "-"} -> ${t.last || "-"}`);
  console.log(`PowerLoadProfile  : ${p.rows} dong | ${p.meters} dong ho | ${p.first || "-"} -> ${p.last || "-"}`);
  console.log(`PowerPeakMonthly  : ${peaks.rows[0].rows} dong`);

  const recent = await pool.query(
    `select f."code", pm."year", pm."month", pm."peakKw", pm."peakAt", pm."loadFactor", pm."isMonthClosed"
     from "PowerPeakMonthly" pm
     join "Factory" f on f."id" = pm."factoryId"
     order by pm."year" desc, pm."month" desc, f."code" asc
     limit 12`,
  );
  if (recent.rowCount > 0) {
    console.log("\nDinh cac thang gan nhat:");
    for (const r of recent.rows) {
      console.log(
        `  ${r.code} ${r.year}-${String(r.month).padStart(2, "0")}: ${Number(r.peakKw).toFixed(1)} kW ` +
          `luc ${new Date(r.peakAt).toLocaleString("vi-VN", { timeZone: TZ })} ` +
          `| LF ${Number(r.loadFactor).toFixed(2)}${r.isMonthClosed ? "" : " (dang chay)"}`,
      );
    }
  }
}

// ---------- Điều phối ----------

function parseArgs(argv) {
  const args = { days: null, from: null, to: null, backfillAll: false, status: false, cleanup: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--status") args.status = true;
    else if (a === "--backfill-all") args.backfillAll = true;
    else if (a === "--no-cleanup") args.cleanup = false;
    else if (a === "--days") args.days = Number(argv[++i]);
    else if (a === "--from") args.from = argv[++i];
    else if (a === "--to") args.to = argv[++i];
  }
  return args;
}

async function resolveRange(args) {
  if (args.from) {
    return { from: args.from, to: args.to || vnDateStr() };
  }

  if (args.backfillAll) {
    const res = await pool.query('select min("timestamp") as first from "PowerTelemetry"');
    if (!res.rows[0]?.first) return null;
    return { from: vnDateStr(new Date(res.rows[0].first)), to: vnDateStr() };
  }

  // Mặc định: 2 ngày gần nhất. Vì sao 2 chứ không phải 1 — khoảng vắt qua nửa đêm
  // chỉ được tính đầy đủ khi đã có bản đọc của ngày hôm sau, nên chạy lại ngày hôm trước
  // để khoảng biên được sửa cho đúng. Tự chữa lành, không cần can thiệp tay.
  const days = Number.isFinite(args.days) && args.days > 0 ? args.days : 2;
  const today = vnDateStr();
  return { from: addDaysStr(today, -(days - 1)), to: today };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.status) {
    await printStatus();
    return;
  }

  const range = await resolveRange(args);
  if (!range) {
    console.log("Chua co telemetry nao de backfill.");
    return;
  }

  console.log(`\n[${nowVN()}] Bat dau rollup duong cong phu tai...`);

  const built = await buildLoadProfile(range.from, range.to);

  // Tính lại đỉnh cho MỌI tháng mà khoảng thời gian vừa xử lý chạm tới.
  const monthKeys = new Set();
  for (const d of enumerateDates(range.from, range.to)) {
    monthKeys.add(`${d.slice(0, 4)}-${Number(d.slice(5, 7))}`);
  }

  console.log(`Chot dinh cho ${monthKeys.size} thang...`);
  const peaksWritten = await rollupMonths([...monthKeys]);

  if (args.cleanup) await cleanupOldProfiles();
  await warnIfStale();

  console.log(
    `[${nowVN()}] Hoan tat: ${built.intervals} khoang phu tai, ${peaksWritten} ban ghi dinh thang.`,
  );
}

main()
  .catch((error) => {
    console.error("Loi rollup:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
