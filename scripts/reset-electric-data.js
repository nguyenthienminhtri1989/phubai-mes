import "dotenv/config";
import pg from "pg";

// ============================================================
// XOA DU LIEU DIEN NANG THU NGHIEM de bat dau lai tu dau.
//
// BOI CANH: giai doan lap thu nghiem, dong ho hong / trao doi lien tuc nen chuoi so khong
// nhat quan (vd DP1 nhay tu 49.943 len 520.208 ngay 1/8). Du lieu vai ngay nay khong co
// gia tri phan tich ma con lam nhieu moi bao cao ve sau.
//
// AN TOAN:
//   - MAC DINH la DRY-RUN: chi DEM va IN ra, khong xoa gi. Phai them --yes moi thuc su xoa.
//   - MAC DINH chi xoa du lieu cua dong ho HA THE AUTO (type=1, isAuto=true).
//     Du lieu TRUNG THE (type=2, nhap tay tu cong to EVN) la SO THAT DE DOI CHIEU HOA DON,
//     khong dung toi. Muon xoa ca thi dung --scope all.
//   - Chay trong TRANSACTION: hoac xoa het, hoac khong xoa gi.
//
//   node scripts/reset-electric-data.js                 # xem truoc, khong xoa
//   node scripts/reset-electric-data.js --yes           # xoa du lieu ha the AUTO
//   node scripts/reset-electric-data.js --scope all --yes   # xoa CA trung the (can than!)
//
// SAU KHI XOA: lan chot so ke tiep se ghi ban ghi MOC GOC (baseline, tieu thu = 0) cho tung
// dong ho, dung nhu khi lap moi. Khong can lam gi them.
// ============================================================

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const TZ = "Asia/Ho_Chi_Minh";

const args = process.argv.slice(2);
const CONFIRMED = args.includes("--yes");
const SCOPE = args.includes("--scope") ? args[args.indexOf("--scope") + 1] : "auto-lv";

// Dieu kien chon dong ho bi anh huong.
const METER_FILTER =
  SCOPE === "all"
    ? "true"
    : `"type" = 1 and "isAuto" = true`;

async function main() {
  console.log(`\n=== XOA DU LIEU DIEN NANG THU NGHIEM ===`);
  console.log(`Pham vi : ${SCOPE === "all" ? "TAT CA dong ho (ke ca trung the nhap tay)" : "Chi dong ho HA THE AUTO"}`);
  console.log(`Che do  : ${CONFIRMED ? "*** XOA THAT ***" : "DRY-RUN (chi xem truoc, khong xoa)"}`);

  const meters = await pool.query(
    `select "id", "code", "name", "type", "isAuto" from "PowerMeter" where ${METER_FILTER} order by "code"`,
  );
  const meterIds = meters.rows.map((m) => m.id);
  console.log(`\nDong ho bi anh huong: ${meters.rowCount}`);
  for (const m of meters.rows) {
    console.log(`  ${String(m.code).padEnd(14)} ${m.name} (type=${m.type}, auto=${m.isAuto})`);
  }

  if (meterIds.length === 0) {
    console.log("\nKhong co dong ho nao khop dieu kien. Dung lai.");
    return;
  }

  // ---------- Dem truoc ----------
  const counts = {};
  const q = async (label, sql, params) => {
    const r = await pool.query(sql, params);
    counts[label] = Number(r.rows[0].n);
  };

  await q("PowerLoadProfile", 'select count(*)::int as n from "PowerLoadProfile" where "meterId" = any($1)', [meterIds]);
  await q("PowerTelemetry", 'select count(*)::int as n from "PowerTelemetry" where "meterId" = any($1)', [meterIds]);
  await q("PowerRecord", 'select count(*)::int as n from "PowerRecord" where "meterId" = any($1)', [meterIds]);
  await q("PowerMeterEvent", 'select count(*)::int as n from "PowerMeterEvent" where "meterId" = any($1)', [meterIds]);
  await q("PowerLiveReading", 'select count(*)::int as n from "PowerLiveReading" where "meterId" = any($1)', [meterIds]);
  await q("PowerFactorLog", 'select count(*)::int as n from "PowerFactorLog" where "meterId" = any($1)', [meterIds]);
  await q("PowerPeakMonthly", 'select count(*)::int as n from "PowerPeakMonthly"', []);

  console.log("\nSo dong se bi xoa:");
  let total = 0;
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(20)} ${String(v).padStart(8)}`);
    total += v;
  }
  console.log(`  ${"TONG".padEnd(20)} ${String(total).padStart(8)}`);

  // Nhac lai nhung gi GIU LAI, de nguoi chay biet minh khong mat gi ngoai y muon.
  if (SCOPE !== "all") {
    const kept = await pool.query(
      `select count(*)::int as n from "PowerRecord" pr
       join "PowerMeter" m on m."id" = pr."meterId"
       where not (m."type" = 1 and m."isAuto" = true)`,
    );
    console.log(`\nGIU LAI: ${kept.rows[0].n} ban ghi PowerRecord cua dong ho trung the / nhap tay (so doi chieu hoa don EVN).`);
  }

  if (!CONFIRMED) {
    console.log("\n--- DRY-RUN: chua xoa gi ---");
    console.log("Chay lai voi --yes de thuc su xoa:");
    console.log(`  node scripts/reset-electric-data.js${SCOPE === "all" ? " --scope all" : ""} --yes\n`);
    return;
  }

  // ---------- Xoa that, trong transaction ----------
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query('delete from "PowerLoadProfile" where "meterId" = any($1)', [meterIds]);
    await client.query('delete from "PowerTelemetry" where "meterId" = any($1)', [meterIds]);
    await client.query('delete from "PowerRecord" where "meterId" = any($1)', [meterIds]);
    await client.query('delete from "PowerMeterEvent" where "meterId" = any($1)', [meterIds]);
    await client.query('delete from "PowerLiveReading" where "meterId" = any($1)', [meterIds]);
    await client.query('delete from "PowerFactorLog" where "meterId" = any($1)', [meterIds]);

    // Dinh thang duoc tinh LAI hoan toan tu PowerLoadProfile nen xoa sach, khong loc theo dong ho.
    await client.query('delete from "PowerPeakMonthly"');

    await client.query("COMMIT");
    console.log(`\n[${new Date().toLocaleString("vi-VN", { timeZone: TZ })}] Da xoa xong ${total} dong.`);
    console.log("\nBUOC TIEP THEO:");
    console.log("  1. Doi collector day telemetry moi len (~1-2 phut)");
    console.log("  2. Lan chot so 06:15 ke tiep se ghi ban ghi MOC GOC cho tung dong ho");
    console.log("  3. Tu ngay sau moi bat dau co so tieu thu va duong cong phu tai");
    console.log("  4. Kiem tra: node scripts/diag-load-profile.js\n");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Loi khi xoa, da ROLLBACK - khong co gi bi thay doi:", e.message);
    process.exitCode = 1;
  } finally {
    client.release();
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
