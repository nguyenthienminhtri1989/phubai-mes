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
// connectTCP tu no KHONG co timeout: mot Gateway chet (mat dien/rot mang) se treo theo
// SYN-timeout cua OS (~20s+). Gioi han rieng de fail nhanh, khong lam nghen ca chu ky.
const CONNECT_TIMEOUT_MS = Number(process.env.MODBUS_CONNECT_TIMEOUT_MS || 4000);
// So Gateway doc dong thoi. Cac N520 khac nhau (khac IP) VA khac port (502/503) la endpoint
// TCP doc lap nen doc song song an toan; trong CUNG mot bus RS485 van tuan tu.
const GATEWAY_CONCURRENCY = Number(process.env.GATEWAY_CONCURRENCY || 4);
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

// Kết nối TCP có timeout rõ ràng. Nếu quá hạn thì hủy socket để không giữ handle treo.
function connectWithTimeout(client, ip, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        client.destroy?.();
      } catch {
        /* bỏ qua */
      }
      reject(new Error(`connect timeout sau ${timeoutMs}ms`));
    }, timeoutMs);
    client
      .connectTCP(ip, { port })
      .then(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
  });
}

// Đóng client an toàn, không để chu kỳ sau treo nếu callback close không bao giờ gọi.
function safeClose(client) {
  return new Promise((resolve) => {
    try {
      client.close(() => resolve());
      setTimeout(resolve, 500); // fallback nếu socket đã hỏng, callback không bắn
    } catch {
      resolve();
    }
  });
}

// Chạy các tác vụ theo lô, giới hạn số tác vụ chạy đồng thời (concurrency).
async function mapWithConcurrency(items, limit, worker) {
  const results = [];
  let index = 0;
  const runnerCount = Math.max(1, Math.min(limit, items.length));
  const runners = Array.from({ length: runnerCount }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current], current);
    }
  });
  await Promise.all(runners);
  return results;
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
//
// Gom theo `ip:port` nên cùng một N520 dùng cả COM1 (502) và COM2 (503) sẽ thành 2 nhóm
// -> 2 kết nối TCP riêng, đúng bản chất gateway 2 cổng nối tiếp. Mỗi nhóm mở 1 kết nối rồi
// đọc lần lượt từng Slave ID trên bus đó. Các nhóm (gateway) đọc SONG SONG có giới hạn.
async function readAllMeters(meters) {
  const gateways = new Map();
  for (const m of meters) {
    if (!m.gatewayIp || m.modbusId == null) continue;
    const key = `${m.gatewayIp}:${m.gatewayPort || 502}`;
    gateways.set(key, [...(gateways.get(key) || []), m]);
  }

  const gatewayList = [...gateways.entries()];

  const perGateway = await mapWithConcurrency(
    gatewayList,
    GATEWAY_CONCURRENCY,
    async ([gatewayKey, metersOnGateway]) => {
      const [ip, portStr] = gatewayKey.split(":");
      const port = Number.parseInt(portStr || "502", 10);
      const client = new ModbusRTU();
      const readings = [];

      // Bao cao suc khoe cua CHINH bus nay, gui kem len VPS de phan biet
      // "gateway chet" (connected=false) voi "gateway song nhung vai dong ho khong tra loi".
      const health = {
        ipAddress: ip.trim(),
        port,
        connected: false,
        error: null,
        meterTotal: metersOnGateway.length,
        meterOk: 0,
        meterFailed: 0,
        at: new Date().toISOString(),
      };

      try {
        await connectWithTimeout(client, ip.trim(), port, CONNECT_TIMEOUT_MS);
        client.setTimeout(MODBUS_TIMEOUT_MS);
        health.connected = true;

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
            health.meterOk += 1;
            console.log(`  + [${ip}:${port}] ${meter.code || meter.id} (ID ${meter.modbusId}): ${totalEnergy} kWh`);
            await new Promise((r) => setTimeout(r, 50));
          } catch (err) {
            health.meterFailed += 1;
            health.error = `${meter.code || meter.id} (ID ${meter.modbusId}): ${err.message}`;
            console.error(`  - [${ip}:${port}] Loi doc ${meter.code || meter.id} (ID ${meter.modbusId}): ${err.message}`);
          }
        }
      } catch (err) {
        health.connected = false;
        health.error = err.message;
        health.meterFailed = metersOnGateway.length;
        console.error(`Loi ket noi Gateway ${ip}:${port} (bo qua ${metersOnGateway.length} dong ho): ${err.message}`);
      } finally {
        await safeClose(client);
      }

      return { readings, health };
    },
  );

  return {
    readings: perGateway.flatMap((g) => g.readings),
    gateways: perGateway.map((g) => g.health),
  };
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

// Đẩy readings + báo cáo sức khỏe lên VPS.
// LUÔN gửi kể cả khi readings rỗng: đúng lúc không đọc được đồng hồ nào mới là lúc
// phía VPS cần biết nhất (gateway chết). Đây cũng là nhịp tim chứng minh collector còn sống.
async function pushPayload(readings, gateways, collector) {
  const res = await fetch(`${API_BASE}/api/collector/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({ readings, gateways, collector }),
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

    // Kể cả khi chưa khai đồng hồ nào, vẫn gửi nhịp tim để VPS biết collector còn sống.
    const { readings: fresh, gateways } =
      meters.length === 0 ? { readings: [], gateways: [] } : await readAllMeters(meters);

    if (meters.length === 0) console.log("Chua khai bao dong ho AUTO nao.");

    const buffered = loadBuffer();
    const all = [...buffered, ...fresh];

    const collector = {
      at: new Date().toISOString(),
      intervalSec: Math.round(INTERVAL_MS / 1000),
      gatewayTotal: gateways.length,
      gatewayOnline: gateways.filter((g) => g.connected).length,
      meterTotal: gateways.reduce((s, g) => s + g.meterTotal, 0),
      meterOk: gateways.reduce((s, g) => s + g.meterOk, 0),
      meterFailed: gateways.reduce((s, g) => s + g.meterFailed, 0),
      bufferedCount: buffered.length,
    };

    try {
      await pushPayload(all, gateways, collector);
      clearBuffer(); // gửi thành công -> xóa buffer cũ
      const gwInfo = `${collector.gatewayOnline}/${collector.gatewayTotal} gateway OK, ${collector.meterOk}/${collector.meterTotal} dong ho OK`;
      console.log(
        all.length > 0
          ? `Da day ${all.length} ban ghi len VPS (${gwInfo})${buffered.length ? ` (gom ${buffered.length} ban ghi ton dong)` : ""}.`
          : `Khong doc duoc dong ho nao, da bao trang thai len VPS (${gwInfo}).`,
      );
    } catch (pushErr) {
      // Gửi lỗi (thường do mất mạng) -> chỉ lưu phần MỚI vào buffer (phần cũ đã có sẵn trong file).
      // KHÔNG buffer báo cáo sức khỏe: trạng thái cũ gửi trễ là vô nghĩa, chỉ gây hiểu nhầm.
      if (fresh.length > 0) saveToBuffer(fresh);
      console.error(`Day len VPS that bai, da luu tam ${fresh.length} ban ghi vao buffer. Loi: ${pushErr.message}`);
    }
  } catch (err) {
    console.error(`Loi chu ky: ${err.message}`);
  }
}

// Chống chu kỳ chồng lặp: nếu chu kỳ trước chưa xong (nhiều Gateway/Gateway chậm) thì
// BỎ QUA nhịp này, tránh mở 2 kết nối đồng thời tới cùng một cổng N520 (nghẽn RS485).
let cycleRunning = false;
async function runCycleSafely() {
  if (cycleRunning) {
    console.warn(`[${nowVN()}] Chu ky truoc chua xong -> bo qua nhip nay.`);
    return;
  }
  cycleRunning = true;
  try {
    await runCycle();
  } finally {
    cycleRunning = false;
  }
}

console.log(
  `Energy push collector khoi dong. Doc moi ${INTERVAL_MS / 1000}s, ` +
    `toi da ${GATEWAY_CONCURRENCY} Gateway song song, connect-timeout ${CONNECT_TIMEOUT_MS}ms, day len ${API_BASE}.`,
);
runCycleSafely();
setInterval(runCycleSafely, INTERVAL_MS);
