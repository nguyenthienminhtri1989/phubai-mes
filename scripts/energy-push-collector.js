import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import ModbusRTU from "modbus-serial";

// ============================================================
// Energy Push Collector — cơ chế PUSH (thay thế phần thu telemetry của energy-cron.js)
//
// Chạy tại nơi CÓ THỂ kết nối gateway Modbus (hiện tại: máy văn phòng;
// sau này: mini PC đặt tại nhà máy). Đây là tiến trình DUY NHẤT cần chạy
// ở phía nhà máy — KHÔNG còn SSH tunnel, KHÔNG kết nối trực tiếp DB.
//
// Mỗi chu kỳ:
//   1. GET danh sách đồng hồ AUTO từ VPS (thay cho việc query DB trước đây)
//   2. Đọc Modbus từng đồng hồ
//   3. POST kết quả lên VPS qua HTTPS (kèm API key)
//   4. Nếu POST lỗi (mất mạng) -> lưu vào file buffer, lần sau gửi lại
//
// Toàn bộ giao tiếp với VPS chỉ là HTTPS ra ngoài (cổng 443) — cực ổn định,
// không cần mở port nào, không tunnel.
//
// .env cần có (cùng thư mục chạy collector):
//   API_BASE_URL=https://phubaimes.site
//   ENERGY_API_KEY=<khop voi VPS>
//   READ_INTERVAL_SECONDS=60
// ============================================================

const API_BASE = (process.env.API_BASE_URL || "").replace(/\/+$/, ""); // ví dụ https://phubaimes.site
const API_KEY = process.env.ENERGY_API_KEY || "";
const INTERVAL_MS = Number(process.env.READ_INTERVAL_SECONDS || 60) * 1000;
const MODBUS_TIMEOUT_MS = Number(process.env.MODBUS_TIMEOUT_MS || 2500);
const BUFFER_FILE = path.join(process.cwd(), "energy-buffer.jsonl");

if (!API_BASE) throw new Error("Thieu API_BASE_URL trong .env (vd: https://phubaimes.site)");
if (!API_KEY) throw new Error("Thieu ENERGY_API_KEY trong .env");

function nowVN() {
  return new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

// Giải mã float theo định dạng thanh ghi đồng hồ Selec (giữ nguyên logic cũ).
function parseSelecFloat(buffer, offset = 0) {
  const fixed = Buffer.alloc(4);
  fixed[0] = buffer[offset + 2];
  fixed[1] = buffer[offset + 3];
  fixed[2] = buffer[offset + 0];
  fixed[3] = buffer[offset + 1];
  return fixed.readFloatBE(0);
}

// Lấy danh sách đồng hồ AUTO từ VPS (thay cho query DB "PowerMeter" trước đây).
async function fetchMeters() {
  const res = await fetch(`${API_BASE}/api/collector/meters`, {
    headers: { "x-api-key": API_KEY },
  });
  if (!res.ok) {
    throw new Error(`GET /api/collector/meters loi ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return Array.isArray(data.meters) ? data.meters : [];
}

// Đọc Modbus toàn bộ đồng hồ, gom theo gateway. Trả về mảng readings.
async function readAllMeters(meters) {
  const gateways = new Map();
  for (const m of meters) {
    if (!m.gatewayIp || m.modbusId == null) continue;
    const key = `${m.gatewayIp}:${m.gatewayPort || 502}`;
    gateways.set(key, [...(gateways.get(key) || []), m]);
  }

  const readings = [];
  for (const [gatewayKey, metersOnGateway] of gateways.entries()) {
    const [ip, portStr] = gatewayKey.split(":");
    const port = Number.parseInt(portStr || "502", 10);
    const client = new ModbusRTU();

    try {
      await client.connectTCP(ip.trim(), { port });
      client.setTimeout(MODBUS_TIMEOUT_MS);

      for (const meter of metersOnGateway) {
        try {
          client.setID(meter.modbusId);
          const data = await client.readInputRegisters(meter.registerAddr || 0, 2);
          const totalEnergy = Number(parseSelecFloat(data.buffer, 0).toFixed(2));
          readings.push({
            meterId: meter.id,
            totalEnergy,
            readAt: new Date().toISOString(),
          });
          console.log(`  + ${meter.code || meter.id} (ID ${meter.modbusId}): ${totalEnergy} kWh`);
          await new Promise((r) => setTimeout(r, 50));
        } catch (err) {
          console.error(`  - Loi doc ${meter.code || meter.id} (ID ${meter.modbusId}): ${err.message}`);
        }
      }
    } catch (err) {
      console.error(`Loi ket noi Gateway ${ip}:${port} (bo qua ${metersOnGateway.length} dong ho): ${err.message}`);
    } finally {
      client.close();
    }
  }
  return readings;
}

// Đọc các reading còn tồn trong buffer (do lần trước gửi lỗi).
function loadBuffer() {
  try {
    if (!fs.existsSync(BUFFER_FILE)) return [];
    const lines = fs.readFileSync(BUFFER_FILE, "utf8").split("\n").filter(Boolean);
    return lines.map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

function saveToBuffer(readings) {
  const lines = readings.map((r) => JSON.stringify(r)).join("\n") + "\n";
  fs.appendFileSync(BUFFER_FILE, lines);
}

function clearBuffer() {
  try {
    if (fs.existsSync(BUFFER_FILE)) fs.unlinkSync(BUFFER_FILE);
  } catch {
    /* bỏ qua */
  }
}

// Đẩy readings lên VPS. Trả về true nếu thành công.
async function pushReadings(readings) {
  if (readings.length === 0) return true;
  const res = await fetch(`${API_BASE}/api/collector/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({ readings }),
  });
  if (!res.ok) {
    throw new Error(`POST /api/collector/ingest loi ${res.status}: ${await res.text()}`);
  }
  return true;
}

async function runCycle() {
  console.log(`\n[${nowVN()}] Bat dau chu ky thu thap...`);
  try {
    const meters = await fetchMeters();
    if (meters.length === 0) {
      console.log("Khong co dong ho AUTO nao. Bo qua chu ky.");
      return;
    }

    const fresh = await readAllMeters(meters);
    const buffered = loadBuffer();
    const all = [...buffered, ...fresh];

    if (all.length === 0) {
      console.log("Khong doc duoc dong ho nao trong chu ky nay.");
      return;
    }

    try {
      await pushReadings(all);
      clearBuffer(); // gửi thành công -> xóa buffer cũ
      console.log(`Da day ${all.length} ban ghi len VPS${buffered.length ? ` (gom ${buffered.length} ban ghi ton dong)` : ""}.`);
    } catch (pushErr) {
      // Gửi lỗi (thường do mất mạng) -> chỉ lưu phần MỚI vào buffer (phần cũ đã có sẵn trong file)
      saveToBuffer(fresh);
      console.error(`Day len VPS that bai, da luu tam ${fresh.length} ban ghi vao buffer. Loi: ${pushErr.message}`);
    }
  } catch (err) {
    console.error(`Loi chu ky: ${err.message}`);
  }
}

console.log(`Energy push collector khoi dong. Doc moi ${INTERVAL_MS / 1000}s, day len ${API_BASE}.`);
runCycle();
setInterval(runCycle, INTERVAL_MS);
