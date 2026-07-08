import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import ModbusRTU from "modbus-serial";

// ============================================================
// Energy Push Collector — co che PUSH (thay the phan thu telemetry cua energy-cron.js)
//
// Chay tai noi CO THE ket noi gateway Modbus (hien tai: may van phong;
// sau nay: mini PC dat tai nha may). Day la tien trinh DUY NHAT can chay
// o phia nha may — KHONG con SSH tunnel, KHONG ket noi truc tiep DB.
//
// Moi chu ky:
//   1. GET danh sach dong ho AUTO tu VPS  (thay cho viec query DB truoc day)
//   2. Doc Modbus tung dong ho
//   3. POST ket qua len VPS qua HTTPS (kem API key)
//   4. Neu POST loi (mat mang) -> luu vao file buffer, lan sau gui lai
//
// Toan bo giao tiep voi VPS chi la HTTPS ra ngoai (cong 443) — cuc on dinh,
// khong can mo port nao, khong tunnel.
//
// .env can co (cung thu muc chay collector):
//   API_BASE_URL=https://phubaimes.site
//   ENERGY_API_KEY=<khop voi VPS>
//   READ_INTERVAL_SECONDS=60
// ============================================================

const API_BASE = (process.env.API_BASE_URL || "").replace(/\/+$/, ""); // vd https://phubaimes.site
const API_KEY = process.env.ENERGY_API_KEY || "";
const INTERVAL_MS = Number(process.env.READ_INTERVAL_SECONDS || 60) * 1000;
const MODBUS_TIMEOUT_MS = Number(process.env.MODBUS_TIMEOUT_MS || 2500);
const BUFFER_FILE = path.join(process.cwd(), "energy-buffer.jsonl");

if (!API_BASE) throw new Error("Thieu API_BASE_URL trong .env (vd: https://phubaimes.site)");
if (!API_KEY) throw new Error("Thieu ENERGY_API_KEY trong .env");

function nowVN() {
  return new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

// Giai ma float theo dinh dang thanh ghi dong ho Selec (giu nguyen logic cu).
function parseSelecFloat(buffer, offset = 0) {
  const fixed = Buffer.alloc(4);
  fixed[0] = buffer[offset + 2];
  fixed[1] = buffer[offset + 3];
  fixed[2] = buffer[offset + 0];
  fixed[3] = buffer[offset + 1];
  return fixed.readFloatBE(0);
}

// Lay danh sach dong ho AUTO tu VPS (thay cho query DB "PowerMeter" truoc day).
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

// Doc Modbus toan bo dong ho, gom theo gateway. Tra ve mang readings.
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

// Doc cac reading con ton trong buffer (do lan truoc gui loi).
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
    /* ignore */
  }
}

// Day readings len VPS. Tra ve true neu thanh cong.
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
      clearBuffer(); // gui thanh cong -> xoa buffer cu
      console.log(`Da day ${all.length} ban ghi len VPS${buffered.length ? ` (gom ${buffered.length} ban ghi ton dong)` : ""}.`);
    } catch (pushErr) {
      // Gui loi (thuong do mat mang) -> chi luu phan MOI vao buffer (phan cu da co san trong file)
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
