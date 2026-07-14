import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

// ============================================================
// EVN Portal Collector — tự động lấy chỉ số công tơ TRUNG THẾ từ
// portal CSKH của EVNCPC (https://cskh.cpc.vn) rồi đẩy lên PHUBAI-MES.
//
// HỖ TRỢ NHIỀU TÀI KHOẢN: EVN cấp mỗi công tơ trung thế một tài khoản riêng,
// nên mỗi tài khoản có token riêng, cache riêng. Một tài khoản lỗi (sai mật khẩu,
// portal chặn) KHÔNG làm hỏng các tài khoản còn lại.
//
// Chạy 1 LẦN mỗi sáng qua cron (khuyến nghị 06:30, sau mốc chốt 06:00):
//   30 6 * * *  cd /opt/phubai-collector && /usr/bin/node evn-portal-collector.js >> evn.log 2>&1
//
// Luồng cho từng tài khoản:
//   1. Login portal EVN (hoặc dùng token cache — token EVN sống ~1 năm)
//   2. GET thongsovanhanh, time = HÔM NAY 06:00 (giờ VN)
//   3. Kiểm tra ngaygio trả về ĐÚNG mốc 06:00 hôm nay (dữ liệu tươi)
//   4. Gom lại, POST 1 lần lên VPS /api/collector/mv-ingest,
//      recordDate = HÔM QUA (đúng quy ước trang nhập tay: số 06:00 sáng nay
//      chốt cho tiêu thụ của ngày hôm qua)
//   5. Lỗi mạng VPS -> lưu buffer, lần chạy sau gửi lại
//
// VPS bỏ qua ngày đã có bản ghi (nhập tay thắng, chạy lại không nhân đôi).
//
// ---- CẤU HÌNH ----
// .env:
//   API_BASE_URL=https://phubaimes.site
//   ENERGY_API_KEY=<khop voi VPS>
//   EVN_LOGIN_URL=https://cskh-api.cpc.vn/api/cskh/user/login   (mac dinh, khong can khai bao)
//   EVN_DATA_BASE=https://cskh-api.cpc.vn/api/remote/dspm       (mac dinh)
//   EVN_ACCOUNTS_FILE=./evn-accounts.json                        (mac dinh)
//
// evn-accounts.json  (chmod 600, KHONG commit git):
// [
//   {
//     "username": "soiphubai01",
//     "password": "...",
//     "customerPoint": "PC03PP0202258001",
//     "customerCode": "PC03PP0202258",
//     "meterCode": "PC03PP0202258"          <-- ma dong ho trong MES
//   },
//   { ... tai khoan 2 ... },
//   { ... tai khoan 3 ... }
// ]
// ============================================================

const API_BASE = (process.env.API_BASE_URL || "").replace(/\/+$/, "");
const API_KEY = process.env.ENERGY_API_KEY || "";
const EVN_LOGIN_URL = (process.env.EVN_LOGIN_URL || "https://cskh-api.cpc.vn/api/cskh/user/login").trim();
const EVN_DATA_BASE = (process.env.EVN_DATA_BASE || "https://cskh-api.cpc.vn/api/remote/dspm").replace(/\/+$/, "");
const ACCOUNTS_FILE = path.resolve(process.env.EVN_ACCOUNTS_FILE || "./evn-accounts.json");
const TOKEN_DIR = path.join(process.cwd(), ".evn-tokens");
const BUFFER_FILE = path.join(process.cwd(), "evn-mv-buffer.jsonl");

for (const [k, v] of Object.entries({ API_BASE_URL: API_BASE, ENERGY_API_KEY: API_KEY })) {
  if (!v) throw new Error(`Thieu ${k} trong .env`);
}

function loadAccounts() {
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    throw new Error(`Khong tim thay ${ACCOUNTS_FILE}. Tao file JSON chua danh sach tai khoan EVN (xem chu thich dau file).`);
  }
  const list = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`${ACCOUNTS_FILE} phai la mang JSON co it nhat 1 tai khoan.`);
  }
  for (const acc of list) {
    for (const field of ["username", "password", "customerPoint", "customerCode", "meterCode"]) {
      if (!acc[field]) throw new Error(`Tai khoan trong ${ACCOUNTS_FILE} thieu truong "${field}": ${JSON.stringify(acc)}`);
    }
  }
  return list;
}

function nowVN() {
  return new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

// Ngày VN dạng các phần rời, độc lập timezone của máy chạy script.
function vnDateParts(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return { y: get("year"), m: get("month"), d: get("day") };
}

// ---------- EVN auth (token RIÊNG cho từng tài khoản) ----------

function tokenFileOf(username) {
  return path.join(TOKEN_DIR, `${username.replace(/[^\w.-]/g, "_")}.json`);
}

function loadCachedToken(username) {
  try {
    const raw = JSON.parse(fs.readFileSync(tokenFileOf(username), "utf8"));
    return typeof raw.access_token === "string" ? raw.access_token : null;
  } catch {
    return null;
  }
}

async function loginEvn(account) {
  console.log(`  Dang login EVN: ${account.username}...`);
  const res = await fetch(EVN_LOGIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: account.username,
      password: account.password,
      grant_type: "password",
      scope: "CSKH",
      ThongTinCaptcha: { captcha: "undefined", token: "undefined" },
    }),
  });
  if (!res.ok) {
    throw new Error(`Login ${account.username} loi ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Login ${account.username}: khong co access_token (isShowCaptcha=${data.isShowCaptcha ?? "?"}). Neu portal bat dau doi captcha, phai login tay roi dan token vao ${tokenFileOf(account.username)}`);
  }
  fs.mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    tokenFileOf(account.username),
    JSON.stringify({ access_token: data.access_token, savedAt: new Date().toISOString() }, null, 2),
    { mode: 0o600 },
  );
  return data.access_token;
}

// ---------- EVN data ----------

async function fetchThongSoVanHanh(token, account, timeParam) {
  const url =
    `${EVN_DATA_BASE}/thongsovanhanh` +
    `?customerPoint=${encodeURIComponent(account.customerPoint)}` +
    `&customerCode=${encodeURIComponent(account.customerCode)}` +
    `&time=${encodeURIComponent(timeParam)}`;
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

// Đọc chỉ số 3 khung của 1 công tơ tại mốc 06:00 hôm nay. Tự re-login khi 401.
async function readAccount(account) {
  const today = vnDateParts(0);
  // Portal dùng định dạng Mỹ MM/DD/YYYY (xác nhận từ request thật của trình duyệt)
  const timeParam = `${today.m}/${today.d}/${today.y} 06:00`;

  let token = loadCachedToken(account.username);
  if (!token) token = await loginEvn(account);

  let res = await fetchThongSoVanHanh(token, account, timeParam);
  if (res.status === 401) {
    token = await loginEvn(account); // token hết hạn / bị thu hồi
    res = await fetchThongSoVanHanh(token, account, timeParam);
  }
  if (!res.ok) {
    throw new Error(`${account.meterCode}: GET thongsovanhanh loi ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const data = await res.json();
  const row = Array.isArray(data.results) ? data.results[0] : null;
  if (!data.isOk || !row) {
    throw new Error(`${account.meterCode}: portal tra ve rong/isOk=false — cong to co the chua day so 06:00 len`);
  }

  // BẮT BUỘC đúng mốc 06:00 hôm nay. Nếu công tơ mất sóng và portal trả bản đọc CŨ,
  // KHÔNG được đẩy — ghi nhầm số cũ thành số chốt hôm nay sẽ làm sai cả sản lượng
  // lẫn tiền, và rất khó phát hiện. Thà để trống cho người vận hành nhập tay.
  const expected = `${today.y}-${today.m}-${today.d}T06:00:00`;
  if (row.ngaygio !== expected) {
    throw new Error(`${account.meterCode}: du lieu CHUA TUOI (ngaygio=${row.ngaygio}, can ${expected}) — bo qua, cho nhap tay`);
  }

  // Chống lắp nhầm tài khoản với điểm đo trong file cấu hình.
  if (row.mA_DIEMDO && row.mA_DIEMDO !== account.customerPoint) {
    throw new Error(`${account.meterCode}: portal tra ve diem do ${row.mA_DIEMDO} nhung cau hinh la ${account.customerPoint} — kiem tra lai evn-accounts.json`);
  }

  const currNormal = Number(row.impbt);
  const currPeak = Number(row.impcd);
  const currOffPeak = Number(row.imptd);
  if (![currNormal, currPeak, currOffPeak].every(Number.isFinite)) {
    throw new Error(`${account.meterCode}: thieu impbt/impcd/imptd trong response`);
  }

  // Đối chiếu: tổng 3 khung phải xấp xỉ importkwh (dung sai làm tròn).
  const sum = currNormal + currPeak + currOffPeak;
  const imp = Number(row.importkwh);
  if (Number.isFinite(imp) && Math.abs(sum - imp) > 0.1) {
    console.warn(`  ! ${account.meterCode}: BT+CD+TD=${sum.toFixed(2)} lech importkwh=${imp} — van day len nhung nen kiem tra`);
  }

  const yesterday = vnDateParts(-1);
  return {
    meterCode: account.meterCode,
    recordDate: `${yesterday.y}-${yesterday.m}-${yesterday.d}`,
    currNormal,
    currPeak,
    currOffPeak,
    note: `EVN ${account.customerPoint} luc ${row.ngaygio}${row.chuoI_GIA ? ` | Gia EVN: ${row.chuoI_GIA}` : ""}`,
  };
}

// ---------- Buffer ----------

function loadBuffer() {
  try {
    if (!fs.existsSync(BUFFER_FILE)) return [];
    return fs.readFileSync(BUFFER_FILE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

function saveToBuffer(readings) {
  if (readings.length === 0) return;
  fs.appendFileSync(BUFFER_FILE, readings.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

function clearBuffer() {
  try {
    if (fs.existsSync(BUFFER_FILE)) fs.unlinkSync(BUFFER_FILE);
  } catch { /* bỏ qua */ }
}

// ---------- Push lên MES ----------

async function pushToMes(readings) {
  const res = await fetch(`${API_BASE}/api/collector/mv-ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({ readings }),
  });
  if (!res.ok) {
    throw new Error(`POST /api/collector/mv-ingest loi ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

// ---------- Main (one-shot cho cron) ----------

async function main() {
  const accounts = loadAccounts();
  console.log(`\n[${nowVN()}] EVN portal collector bat dau — ${accounts.length} tai khoan/cong to.`);

  const fresh = [];
  let failed = 0;

  // Tuần tự, không song song: portal EVN không cần bị dội request,
  // và một tài khoản hỏng không được kéo theo các tài khoản khác.
  for (const account of accounts) {
    try {
      const reading = await readAccount(account);
      fresh.push(reading);
      console.log(`  + ${reading.meterCode}: BT=${reading.currNormal} CD=${reading.currPeak} TD=${reading.currOffPeak} -> recordDate=${reading.recordDate}`);
    } catch (err) {
      failed += 1;
      console.error(`  - ${err.message}`);
    }
  }

  const buffered = loadBuffer();
  const all = [...buffered, ...fresh];

  if (all.length === 0) {
    console.error(`KHONG lay duoc cong to nao (${failed}/${accounts.length} loi). Hom nay can nhap tay.`);
    process.exit(1);
  }

  try {
    const result = await pushToMes(all);
    clearBuffer();
    for (const r of result.results || []) {
      console.log(`  = ${r.meterCode} ${r.recordDate}: ${r.status}`);
    }
    console.log(`Da day ${all.length} ban ghi${buffered.length ? ` (gom ${buffered.length} ton dong)` : ""}. Loi doc: ${failed}/${accounts.length}.`);
  } catch (pushErr) {
    saveToBuffer(fresh);
    console.error(`Day len VPS that bai, da luu ${fresh.length} ban ghi vao buffer: ${pushErr.message}`);
    process.exit(1);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`Loi nghiem trong: ${err.message}`);
  process.exit(1);
});
