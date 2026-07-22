-- Chan hai dong ho AUTO trung dia chi tren cung mot bus RS485.
-- Cung (gatewayIp, gatewayPort, modbusId) tren cung mot cong N520 se dung do Modbus
-- (ca hai thiet bi tra loi cung luc) -> doc ra rac hoac timeout.
-- Postgres coi NULL la distinct nen cac dong ho MANUAL (gatewayIp/modbusId = NULL)
-- KHONG bi rang buoc nay, du co bao nhieu dong ho di nua.
CREATE UNIQUE INDEX "PowerMeter_gatewayIp_gatewayPort_modbusId_key"
  ON "PowerMeter"("gatewayIp", "gatewayPort", "modbusId");
