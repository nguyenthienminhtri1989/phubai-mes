// scan-registers.js
// Script CHAN DOAN: quet cac thanh ghi Modbus cua MOT dong ho de tim vi tri
// chua cac dai luong (Active Energy, Total kW...). Chay THU CONG mot lan, khong lien quan cron.
//
// Cach dung tren mini PC:
//   cd /home/ubuntu/energy-collector
//   node scan-registers.js
//
// Sua 3 gia tri GATEWAY_IP / GATEWAY_PORT / SLAVE_ID cho khop MOT dong ho dang chay.
// (Lay tu danh muc Gateway + Slave ID cua dong ho trong phan mem.)

import ModbusRTU from "modbus-serial";

// ==== SUA 3 DONG NAY cho khop 1 dong ho that ====
const GATEWAY_IP = "192.168.1.233";
const GATEWAY_PORT = 502; // 502=COM1, 503=COM2
const SLAVE_ID = 16; // Slave ID cua dong ho can do
// ================================================

// Giai ma float theo dung logic collector (byte-order CDAB -> ABCD).
function parseSelecFloat(buffer, offset = 0) {
  const fixed = Buffer.alloc(4);
  fixed[0] = buffer[offset + 2];
  fixed[1] = buffer[offset + 3];
  fixed[2] = buffer[offset + 0];
  fixed[3] = buffer[offset + 1];
  return fixed.readFloatBE(0);
}

// Doc 2 thanh ghi tai 1 offset, tra ve gia tri float (hoac null neu loi).
async function readFloatAt(client, offset) {
  try {
    const data = await client.readInputRegisters(offset, 2);
    return Number(parseSelecFloat(data.buffer, 0).toFixed(3));
  } catch (err) {
    return `LOI: ${err.message}`;
  }
}

async function main() {
  const client = new ModbusRTU();
  console.log(
    `Ket noi ${GATEWAY_IP}:${GATEWAY_PORT} (Slave ID ${SLAVE_ID})...`,
  );
  await client.connectTCP(GATEWAY_IP, { port: GATEWAY_PORT });
  client.setID(SLAVE_ID);
  client.setTimeout(3000);

  // Theo datasheet EM368-C, cac dai luong deu la Float 2 thanh ghi, dia chi CHAN:
  //   0=Active Energy, 2=Apparent Energy, 4=Reactive Energy,
  //   6/8/10=PF pha 1/2/3, 12=Avg PF, 14=Total kW, 16=Total kVAr
  // Quet ca cac offset chan tu 0 den 30 de doi chieu voi mat dong ho that.
  const labels = {
    0: "Active Energy (kWh?)",
    2: "Apparent Energy",
    4: "Reactive Energy",
    6: "PF pha 1",
    8: "PF pha 2",
    10: "PF pha 3",
    12: "Avg PF",
    14: "Total kW (?)",
    16: "Total kVAr",
  };

  console.log(
    "\n=== Ket qua quet (readInputRegisters, moi dai luong 2 thanh ghi) ===",
  );
  for (let offset = 0; offset <= 30; offset += 2) {
    const val = await readFloatAt(client, offset);
    const label = labels[offset] ? `  <-- ${labels[offset]}` : "";
    console.log(
      `  offset ${String(offset).padStart(2, " ")} (address 3${String(offset).padStart(4, "0")}): ${val}${label}`,
    );
    await new Promise((r) => setTimeout(r, 60));
  }

  // Mot so dong ho de cac dai luong tuc thoi o HOLDING registers thay vi INPUT.
  // Neu tren khong ra kW hop ly, thu doc holding registers cung cac offset.
  console.log("\n=== Doi chieu: readHoldingRegisters (neu tren khong ra) ===");
  for (const offset of [14, 16, 0]) {
    try {
      const data = await client.readHoldingRegisters(offset, 2);
      const v = Number(parseSelecFloat(data.buffer, 0).toFixed(3));
      console.log(`  holding offset ${offset}: ${v}`);
    } catch (err) {
      console.log(`  holding offset ${offset}: LOI ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 60));
  }

  client.close(() => console.log("\nDa dong ket noi. Xong."));
}

main().catch((err) => {
  console.error("Loi:", err.message);
  process.exit(1);
});
