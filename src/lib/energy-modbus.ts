import ModbusRTU from "modbus-serial";

export type MeterConnection = {
  code: string;
  modbusId: number | null;
  gatewayIp: string | null;
  gatewayPort: number;
  registerAddr: number;
};

export function parseSelecFloat(buffer: Buffer, offset = 0) {
  const fixedBuffer = Buffer.alloc(4);
  fixedBuffer[0] = buffer[offset + 2];
  fixedBuffer[1] = buffer[offset + 3];
  fixedBuffer[2] = buffer[offset + 0];
  fixedBuffer[3] = buffer[offset + 1];

  return fixedBuffer.readFloatBE(0);
}

export async function readSelecTotalEnergy(meter: MeterConnection) {
  if (!meter.modbusId || !meter.gatewayIp) {
    throw new Error("Dong ho chua cau hinh du Modbus ID hoac Gateway IP.");
  }

  const client = new ModbusRTU();

  try {
    await client.connectTCP(meter.gatewayIp.trim(), {
      port: meter.gatewayPort || 502,
    });
    client.setTimeout(2500);
    client.setID(meter.modbusId);

    const data = await client.readInputRegisters(meter.registerAddr || 0, 2);
    return Number(parseSelecFloat(data.buffer, 0).toFixed(2));
  } finally {
    client.close();
  }
}
