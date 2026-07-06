import "dotenv/config";
import http from "node:http";
import ModbusRTU from "modbus-serial";

// ============================================================
// Energy Agent — dịch vụ đọc Modbus đặt tại nơi CÓ THỂ kết nối gateway
// (hiện tại: máy văn phòng; sau này: mini PC đặt tại nhà máy).
//
// Web app trên VPS gọi tới agent này qua reverse SSH tunnel để đọc
// chỉ số điện tức thời (realtime), thay vì tự kết nối Modbus (VPS không
// đọc được gateway). Agent CHỈ đọc Modbus, không đụng tới database.
// ============================================================

const PORT = Number(process.env.AGENT_PORT || 4000);
const TOKEN = process.env.AGENT_TOKEN || "";

if (!TOKEN) {
  throw new Error("Thiếu AGENT_TOKEN trong .env — bắt buộc phải có để bảo vệ agent.");
}

// Giải mã số thực (float) theo định dạng thanh ghi của đồng hồ Selec.
// Giữ nguyên logic đảo byte như trong energy-cron.js để đảm bảo đọc đúng.
function parseSelecFloat(buffer, offset = 0) {
  const fixedBuffer = Buffer.alloc(4);
  fixedBuffer[0] = buffer[offset + 2];
  fixedBuffer[1] = buffer[offset + 3];
  fixedBuffer[2] = buffer[offset + 0];
  fixedBuffer[3] = buffer[offset + 1];
  return fixedBuffer.readFloatBE(0);
}

// Đọc tổng điện năng (kWh) của một đồng hồ qua Modbus TCP.
async function readMeter({ gatewayIp, gatewayPort, modbusId, registerAddr }) {
  if (!gatewayIp || modbusId == null) {
    throw new Error("Thiếu gatewayIp hoặc modbusId.");
  }

  const client = new ModbusRTU();
  try {
    await client.connectTCP(String(gatewayIp).trim(), {
      port: Number(gatewayPort) || 502,
    });
    client.setTimeout(3000);
    client.setID(Number(modbusId));
    const data = await client.readInputRegisters(Number(registerAddr) || 0, 2);
    const totalEnergy = Number(parseSelecFloat(data.buffer, 0).toFixed(2));
    return totalEnergy;
  } finally {
    client.close();
  }
}

const server = http.createServer((req, res) => {
  // Chỉ chấp nhận đúng POST /read
  if (req.method !== "POST" || req.url !== "/read") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  // Kiểm tra token bảo vệ (phải khớp với AGENT_TOKEN trên VPS)
  if (req.headers["x-agent-token"] !== TOKEN) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", async () => {
    try {
      const body = JSON.parse(raw || "{}");
      const totalEnergy = await readMeter(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ totalEnergy }));
      console.log(
        `[${new Date().toLocaleString("vi-VN")}] Doc OK: gateway ${body.gatewayIp} / modbusId ${body.modbusId} -> ${totalEnergy} kWh`,
      );
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
      console.error(
        `[${new Date().toLocaleString("vi-VN")}] Doc LOI: ${err.message}`,
      );
    }
  });
});

// Chỉ lắng nghe trên 127.0.0.1 — không phơi ra LAN/internet.
// VPS truy cập được nhờ reverse SSH tunnel trỏ về localhost của máy này.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`[energy-agent] Dang lang nghe tai http://127.0.0.1:${PORT}`);
});
