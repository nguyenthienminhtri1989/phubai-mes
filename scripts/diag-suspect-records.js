import "dotenv/config";
import pg from "pg";

// ============================================================
// DO CAC BAN GHI PowerRecord KHA NGHI (chi so nhay vot lot vao truoc khi co chan tren).
// CHI DOC - KHONG SUA GI. In ra danh sach + cau UPDATE goi y de nguoi van hanh tu quyet.
//
//   node scripts/diag-suspect-records.js
//   node scripts/diag-suspect-records.js --from 2026-07-01
//
// VI SAO KHONG TU SUA: khong the doan duoc tieu thu THUC TE cua ngay bi dut chuoi -
// chi so cu va chi so moi la cua HAI THIET BI KHAC NHAU. Chi nguoi van hanh (biet dong ho
// nao duoc thay luc nao, chi so cat bao nhieu) moi quyet dinh duoc con so dung.
// ============================================================

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const TZ = "Asia/Ho_Chi_Minh";
const FALLBACK_MAX_DAILY_KWH = 100_000;

const fmtDate = (d) => new Date(d).toLocaleDateString("vi-VN", { timeZone: TZ });
const fmtNum = (n) => Number(n).toLocaleString("vi-VN", { maximumFractionDigits: 0 });

async function main() {
  const fromArg = process.argv.includes("--from")
    ? process.argv[process.argv.indexOf("--from") + 1]
    : "2026-01-01";

  const res = await pool.query(
    `select pr."id", pr."recordDate", pr."prevTotal", pr."currTotal", pr."consTotal",
            pr."costTotal", pr."isReset", pr."dataSource", pr."note",
            m."code", m."name", m."tu", m."ti",
            t."capacityKva", f."code" as factory
     from "PowerRecord" pr
     join "PowerMeter" m on m."id" = pr."meterId"
     left join "PowerTransformer" t on t."id" = m."transformerId"
     left join "Factory" f on f."id" = coalesce(m."factoryId", t."factoryId")
     where pr."recordDate" >= $1 and pr."consTotal" > 0
     order by pr."consTotal" desc`,
    [fromArg],
  );

  const suspects = [];
  for (const r of res.rows) {
    const cap = Number(r.capacityKva ?? 0);
    const maxDaily = cap > 0 ? cap * 24 : FALLBACK_MAX_DAILY_KWH;
    if (Number(r.consTotal) > maxDaily) {
      suspects.push({ ...r, maxDaily, cap });
    }
  }

  console.log(`\n=== BAN GHI KHA NGHI (tu ${fromArg}) ===`);
  console.log(`Da quet ${res.rowCount} ban ghi co tieu thu > 0.\n`);

  if (suspects.length === 0) {
    console.log("Khong tim thay ban ghi nao vuot gioi han vat ly. Tot.\n");
  } else {
    for (const s of suspects) {
      console.log(`  ${s.code} (${s.factory || "?"}) ngay ${fmtDate(s.recordDate)}`);
      console.log(`    prevTotal = ${fmtNum(s.prevTotal)}  ->  currTotal = ${fmtNum(s.currTotal)}`);
      console.log(`    consTotal = ${fmtNum(s.consTotal)} kWh   (gioi han ${fmtNum(s.maxDaily)} kWh${s.cap > 0 ? `, MBA ${s.cap} kVA` : ", chua khai bao MBA"})`);
      console.log(`    costTotal = ${fmtNum(s.costTotal)} VND   nguon=${s.dataSource}  isReset=${s.isReset}`);
      console.log(`    id = ${s.id}`);
      console.log("");
    }

    console.log("--- CAU LENH GOI Y (danh dau dut chuoi, khong tinh tieu thu) ---");
    console.log("-- Kiem tra ky TUNG DONG truoc khi chay. Doi 'note' cho dung thuc te.\n");
    for (const s of suspects) {
      console.log(
        `update "PowerRecord" set "isReset" = true, "consTotal" = 0, "consNormal" = null,\n` +
          `  "consPeak" = null, "consOffPeak" = null, "costTotal" = 0,\n` +
          `  "note" = 'Thay dong ho ${fmtDate(s.recordDate)} - chi so cu va moi khac thiet bi, khong tinh tieu thu',\n` +
          `  "updatedAt" = now()\n` +
          `where "id" = '${s.id}';   -- ${s.code} ${fmtDate(s.recordDate)}\n`,
      );
    }
  }

  // ---------- Anh huong toi bao cao ----------
  console.log("\n=== ANH HUONG TOI TONG THEO THANG ===");
  const monthly = await pool.query(
    `select f."code" as factory,
            to_char(pr."recordDate", 'YYYY-MM') as thang,
            sum(pr."consTotal") as tong_kwh,
            sum(pr."costTotal") as tong_tien
     from "PowerRecord" pr
     join "PowerMeter" m on m."id" = pr."meterId"
     left join "PowerTransformer" t on t."id" = m."transformerId"
     left join "Factory" f on f."id" = coalesce(m."factoryId", t."factoryId")
     where pr."recordDate" >= $1 and m."type" = 1 and m."excludeFromTotal" = false
     group by 1, 2 order by 2 desc, 1`,
    [fromArg],
  );
  for (const r of monthly.rows) {
    console.log(`  ${String(r.factory || "?").padEnd(6)} ${r.thang}: ${fmtNum(r.tong_kwh)} kWh | ${fmtNum(r.tong_tien)} VND`);
  }

  const suspectKwh = suspects.reduce((s, r) => s + Number(r.consTotal), 0);
  if (suspectKwh > 0) {
    console.log(`\n  Trong do ${fmtNum(suspectKwh)} kWh den tu cac ban ghi kha nghi o tren.`);
    console.log("  Sau khi sua, tong thang se giam tuong ung va phan bo chi phi se dung lai.");
  }

  // ---------- Su kien dut chuoi da ghi nhan ----------
  const events = await pool.query(
    `select m."code", e."occurredAt", e."kind", e."source", e."prevTotal", e."currTotal",
            e."impliedKw", e."acknowledged", e."note"
     from "PowerMeterEvent" e join "PowerMeter" m on m."id" = e."meterId"
     where e."occurredAt" >= $1
     order by e."occurredAt" desc limit 50`,
    [fromArg],
  );
  console.log(`\n=== SU KIEN DUT CHUOI DA GHI NHAN (${events.rowCount}) ===`);
  if (events.rowCount === 0) {
    console.log("  (chua co - chay lai rollup/cron de he thong ghi nhan)");
  }
  for (const e of events.rows) {
    console.log(
      `  ${String(e.code).padEnd(14)} ${new Date(e.occurredAt).toLocaleString("vi-VN", { timeZone: TZ }).padEnd(22)} ` +
        `${String(e.kind).padEnd(11)} ${String(e.source).padEnd(12)}` +
        `${e.prevTotal != null ? ` ${fmtNum(e.prevTotal)} -> ${fmtNum(e.currTotal)}` : ""}` +
        `${e.impliedKw != null ? ` (${fmtNum(e.impliedKw)} kW)` : ""}` +
        `${e.acknowledged ? " [da xu ly]" : ""}`,
    );
  }
}

main()
  .catch((e) => {
    console.error("Loi:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
