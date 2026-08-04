import "dotenv/config";
import pg from "pg";

// ============================================================
// CHAN DOAN chat luong du lieu duong cong phu tai. CHI DOC, khong ghi gi.
//   node scripts/diag-load-profile.js
// ============================================================

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const TZ = "Asia/Ho_Chi_Minh";
const fmt = (d) => new Date(d).toLocaleString("vi-VN", { timeZone: TZ });

async function main() {
  // ---------- 1. Dong ho thuoc nha may nao ----------
  console.log("\n=== 1. PHAN BO DONG HO THEO NHA MAY ===");
  const meters = await pool.query(
    `select m."code", m."name", m."tu", m."ti", m."excludeFromTotal",
            m."factoryId" as direct_factory,
            t."factoryId" as via_transformer,
            coalesce(f1."code", f2."code") as factory_code
     from "PowerMeter" m
     left join "PowerTransformer" t on t."id" = m."transformerId"
     left join "Factory" f1 on f1."id" = m."factoryId"
     left join "Factory" f2 on f2."id" = t."factoryId"
     where m."isActive" = true and m."isAuto" = true and m."type" = 1
     order by coalesce(f1."code", f2."code") nulls first, m."code"`,
  );

  const byFactory = new Map();
  for (const r of meters.rows) {
    const k = r.factory_code || "!! KHONG CO NHA MAY !!";
    byFactory.set(k, (byFactory.get(k) || 0) + 1);
  }
  for (const [k, v] of byFactory) console.log(`  ${k}: ${v} dong ho`);

  const orphan = meters.rows.filter((r) => !r.factory_code);
  if (orphan.length > 0) {
    console.log("\n  !! Dong ho KHONG xac dinh duoc nha may (bi loai khoi bao cao):");
    for (const r of orphan) console.log(`     ${r.code} - ${r.name}`);
  }

  console.log("\n  He so tu/ti bat thuong (tu*ti > 1000 hoac = 0):");
  const oddRatio = meters.rows.filter((r) => {
    const p = Number(r.tu ?? 1) * Number(r.ti ?? 1);
    return p > 1000 || p === 0;
  });
  if (oddRatio.length === 0) console.log("     (khong co)");
  for (const r of oddRatio) console.log(`     ${r.code}: tu=${r.tu} ti=${r.ti} -> x${Number(r.tu) * Number(r.ti)}`);

  // ---------- 2. Mat do telemetry ----------
  console.log("\n=== 2. MAT DO TELEMETRY (30 ngay gan nhat) ===");
  console.log("   Ky vong voi moc 30 phut: 48 ban/ngay. Voi moc gio cu: 24 ban/ngay.");
  const density = await pool.query(
    `select m."code",
            count(*)::int as readings,
            round(count(*)::numeric / greatest(1, extract(day from (max(t."timestamp") - min(t."timestamp")))), 1) as per_day,
            min(t."timestamp") as first_ts,
            max(t."timestamp") as last_ts
     from "PowerTelemetry" t
     join "PowerMeter" m on m."id" = t."meterId"
     where t."timestamp" > now() - interval '30 days'
     group by m."code"
     order by per_day asc`,
  );
  for (const r of density.rows) {
    const flag = Number(r.per_day) < 20 ? "  <-- THUA" : "";
    console.log(`  ${String(r.code).padEnd(14)} ${String(r.readings).padStart(5)} ban | ${String(r.per_day).padStart(5)}/ngay | den ${fmt(r.last_ts)}${flag}`);
  }

  // ---------- 3. Phan bo khoang cach giua 2 lan doc ----------
  console.log("\n=== 3. KHOANG CACH GIUA 2 LAN DOC (14 ngay gan nhat) ===");
  const gaps = await pool.query(
    `with d as (
       select "meterId", "timestamp",
              extract(epoch from ("timestamp" - lag("timestamp") over (partition by "meterId" order by "timestamp")))/60 as gap_min
       from "PowerTelemetry"
       where "timestamp" > now() - interval '14 days'
     )
     select case
              when gap_min <= 35 then 'a) <= 35 phut (tot)'
              when gap_min <= 65 then 'b) 35-65 phut (moc gio cu)'
              when gap_min <= 180 then 'c) 65-180 phut (co gap)'
              else 'd) > 180 phut (BI LOAI)'
            end as bucket,
            count(*)::int as n
     from d where gap_min is not null
     group by 1 order by 1`,
  );
  const totalGaps = gaps.rows.reduce((s, r) => s + r.n, 0);
  for (const r of gaps.rows) {
    const pct = ((r.n / totalGaps) * 100).toFixed(1);
    console.log(`  ${r.bucket.padEnd(30)} ${String(r.n).padStart(6)}  (${pct}%)`);
  }

  // ---------- 4. Cac khoang phu tai bat thuong ----------
  console.log("\n=== 4. TOP 15 KHOANG CO kW CAO NHAT (soi so rac) ===");
  const outliers = await pool.query(
    `select m."code", p."intervalStart", p."avgKw", p."kwh", p."minutes", p."srcGapMin"
     from "PowerLoadProfile" p
     join "PowerMeter" m on m."id" = p."meterId"
     order by p."avgKw" desc limit 15`,
  );
  for (const r of outliers.rows) {
    console.log(
      `  ${String(r.code).padEnd(14)} ${fmt(r.intervalStart).padEnd(22)} ` +
        `kW=${String(Number(r.avgKw).toFixed(1)).padStart(11)} kWh=${String(Number(r.kwh).toFixed(1)).padStart(11)} ` +
        `min=${r.minutes} gap=${r.srcGapMin}`,
    );
  }

  // ---------- 5. Telemetry tho quanh khoang dinh ----------
  console.log("\n=== 5. TELEMETRY THO QUANH KHOANG kW CAO NHAT ===");
  if (outliers.rowCount > 0) {
    const worst = outliers.rows[0];
    const mid = new Date(worst.intervalStart);
    const raw = await pool.query(
      `select t."totalEnergy", t."power", t."timestamp"
       from "PowerTelemetry" t
       join "PowerMeter" m on m."id" = t."meterId"
       where m."code" = $1
         and t."timestamp" >= $2 and t."timestamp" <= $3
       order by t."timestamp" asc`,
      [worst.code, new Date(mid.getTime() - 3 * 3600_000), new Date(mid.getTime() + 3 * 3600_000)],
    );
    console.log(`  Dong ho ${worst.code}, quanh ${fmt(mid)}:`);
    let prev = null;
    for (const r of raw.rows) {
      const e = Number(r.totalEnergy);
      const delta = prev === null ? null : e - prev;
      console.log(
        `    ${fmt(r.timestamp).padEnd(22)} totalEnergy=${String(e).padStart(14)}` +
          (delta === null ? "" : `  delta=${delta.toFixed(2)}`) +
          (r.power != null ? `  kW_tuc_thoi=${r.power}` : ""),
      );
      prev = e;
    }
  }

  // ---------- 6. Do phu dong ho theo khoang ----------
  console.log("\n=== 6. DO PHU DONG HO THEO KHOANG (thang hien tai) ===");
  console.log("   Cho biet vi sao it khoang du dieu kien xet dinh.");
  const cover = await pool.query(
    `with c as (
       select p."factoryId", p."intervalStart", count(*)::int as n
       from "PowerLoadProfile" p
       join "PowerMeter" m on m."id" = p."meterId"
       where m."excludeFromTotal" = false
         and p."intervalStart" >= date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh')
       group by 1, 2
     )
     select f."code", c.n as meters_reporting, count(*)::int as intervals
     from c join "Factory" f on f."id" = c."factoryId"
     group by f."code", c.n order by f."code", c.n desc`,
  );
  for (const r of cover.rows) {
    console.log(`  ${r.code}: ${String(r.meters_reporting).padStart(3)} dong ho bao cao -> ${String(r.intervals).padStart(5)} khoang`);
  }

  // ---------- 7. Cong suat dinh muc MBA de doi chieu ----------
  console.log("\n=== 7. CONG SUAT DINH MUC MAY BIEN AP ===");
  const tf = await pool.query(
    `select f."code" as factory, t."name", t."ratedCapacity"
     from "PowerTransformer" t
     left join "Factory" f on f."id" = t."factoryId"
     order by f."code", t."name"`,
  );
  const capByFactory = new Map();
  for (const r of tf.rows) {
    console.log(`  ${String(r.factory || "?").padEnd(6)} ${String(r.name).padEnd(28)} ${r.ratedCapacity ?? "?"} kVA`);
    if (r.factory) capByFactory.set(r.factory, (capByFactory.get(r.factory) || 0) + Number(r.ratedCapacity || 0));
  }
  console.log("\n  Tong dinh muc moi nha may (dinh kW phai THAP HON con so nay):");
  for (const [k, v] of capByFactory) console.log(`    ${k}: ${v} kVA`);
}

main()
  .catch((e) => {
    console.error("Loi chan doan:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
