import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const MES_DATABASE_URL = process.env.DATABASE_URL;
const ERP_DATABASE_URL = process.env.ERP_DATABASE_URL;
const DRY_RUN = process.argv.includes("--dry-run");
const CONFIRM = process.argv.includes("--yes");

if (!ERP_DATABASE_URL) {
  console.error("Missing ERP_DATABASE_URL. Example: ERP_DATABASE_URL=postgresql://postgres:123456@localhost:5432/phubai_erp_db?schema=public");
  process.exit(1);
}

if (!MES_DATABASE_URL) {
  console.error("Missing DATABASE_URL for PHUBAI-MES.");
  process.exit(1);
}

if (!DRY_RUN && !CONFIRM) {
  console.error("This import writes to PHUBAI-MES. Run with --dry-run first, then add --yes to import.");
  process.exit(1);
}

const erp = new Client({ connectionString: ERP_DATABASE_URL });
const mes = new Client({ connectionString: MES_DATABASE_URL });

const idMap = {
  factory: (id) => `erp-factory-${id}`,
  transformer: (id) => `erp-substation-${id}`,
  meterGroup: (id) => `erp-meter-group-${id}`,
  meter: (id) => `erp-meter-${id}`,
  price: (id) => `erp-price-${id}`,
  telemetry: (id) => `erp-telemetry-${id}`,
};

const asNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asBool = (value) => value === true || value === "true" || value === 1 || value === "1";

const recordDate = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 5, 0, 0));
};

async function tableCount(client, tableName) {
  const result = await client.query(`select count(*)::int as count from ${tableName}`);
  return result.rows[0]?.count ?? 0;
}

async function queryMaybe(client, sql) {
  try {
    return await client.query(sql);
  } catch (error) {
    if (error?.code === "42P01") return { rows: [] };
    throw error;
  }
}

async function upsertFactory(row) {
  await mes.query(
    `insert into "Factory" ("id", "code", "name", "description", "location", "isActive", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, null, true, now(), now())
     on conflict ("id") do update set
       "code" = excluded."code",
       "name" = excluded."name",
       "description" = excluded."description",
       "updatedAt" = now()`,
    [idMap.factory(row.id), `ERP-F${row.id}`, row.name, row.note]
  );
}

async function upsertTransformer(row) {
  await mes.query(
    `insert into "PowerTransformer" ("id", "code", "name", "factoryId", "location", "capacityKva", "isActive", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, null, null, true, now(), now())
     on conflict ("id") do update set
       "code" = excluded."code",
       "name" = excluded."name",
       "factoryId" = excluded."factoryId",
       "updatedAt" = now()`,
    [idMap.transformer(row.id), row.code || `ERP-TBA-${row.id}`, row.name, row.factoryId ? idMap.factory(row.factoryId) : null]
  );
}

async function upsertMeterGroup(row) {
  await mes.query(
    `insert into "PowerMeterGroup" ("id", "code", "name", "description", "sortOrder", "isActive", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, 0, true, now(), now())
     on conflict ("id") do update set
       "code" = excluded."code",
       "name" = excluded."name",
       "description" = excluded."description",
       "updatedAt" = now()`,
    [idMap.meterGroup(row.id), row.groupCode || `ERP-MG-${row.id}`, row.groupName || `Nhóm ERP ${row.id}`, row.note]
  );
}

async function upsertPrice(row) {
  const note = [row.name, row.description].filter(Boolean).join(" - ") || null;
  await mes.query(
    `insert into "ElectricityPrice" ("id", "type", "price", "effectiveFrom", "note", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, now(), now())
     on conflict ("type") do update set
       "price" = excluded."price",
       "effectiveFrom" = excluded."effectiveFrom",
       "note" = excluded."note",
       "updatedAt" = now()`,
    [idMap.price(row.id), row.type || "NORMAL", asNumber(row.price), row.updatedAt || new Date(), note]
  );
}

async function upsertMeter(row) {
  await mes.query(
    `insert into "PowerMeter" (
       "id", "code", "name", "meterNo", "transformerId", "groupId", "isActive", "isAuto", "modbusId", "gatewayIp", "gatewayPort", "registerAddr", "tu", "ti", "note", "createdAt", "updatedAt"
     ) values ($1, $2, $3, null, $4, $5, $6, $7, $8, $9, $10, 0, $11, $12, $13, now(), now())
     on conflict ("id") do update set
       "code" = excluded."code",
       "name" = excluded."name",
       "transformerId" = excluded."transformerId",
       "groupId" = excluded."groupId",
       "isActive" = excluded."isActive",
       "isAuto" = excluded."isAuto",
       "modbusId" = excluded."modbusId",
       "gatewayIp" = excluded."gatewayIp",
       "gatewayPort" = excluded."gatewayPort",
       "tu" = excluded."tu",
       "ti" = excluded."ti",
       "note" = excluded."note",
       "updatedAt" = now()`,
    [
      idMap.meter(row.id),
      row.code,
      row.name,
      row.substationId ? idMap.transformer(row.substationId) : null,
      row.meterGroupId ? idMap.meterGroup(row.meterGroupId) : null,
      asBool(row.isActive),
      asBool(row.isAuto),
      row.modbusId,
      row.gatewayIp,
      asNumber(row.gatewayPort, 502),
      asNumber(row.tu, 1),
      asNumber(row.ti, 1),
      row.description,
    ]
  );
}

async function upsertTelemetry(row) {
  await mes.query(
    `insert into "PowerTelemetry" ("id", "meterId", "totalEnergy", "voltage", "current", "power", "powerFactor", "frequency", "rawData", "timestamp")
     values ($1, $2, $3, null, null, $4, null, null, $5, $6)
     on conflict ("id") do update set
       "meterId" = excluded."meterId",
       "totalEnergy" = excluded."totalEnergy",
       "power" = excluded."power",
       "rawData" = excluded."rawData",
       "timestamp" = excluded."timestamp"`,
    [
      idMap.telemetry(row.id),
      idMap.meter(row.meterId),
      asNumber(row.totalEnergy, 0),
      row.activePower === null ? null : asNumber(row.activePower),
      row,
      row.timestamp || new Date(),
    ]
  );
}

async function upsertRecord(row) {
  await mes.query(
    `insert into "PowerRecord" (
       "id", "recordDate", "meterId", "dataSource", "prevTotal", "currTotal", "consTotal", "unitPrice", "costTotal", "isReset", "note", "createdBy", "createdAt", "updatedAt"
     ) values ($1, $2, $3, $4::"PowerDataSource", $5, $6, $7, 0, $8, $9, $10, 'ERP_IMPORT', $11, $12)
     on conflict ("recordDate", "meterId") do update set
       "dataSource" = excluded."dataSource",
       "prevTotal" = excluded."prevTotal",
       "currTotal" = excluded."currTotal",
       "consTotal" = excluded."consTotal",
       "costTotal" = excluded."costTotal",
       "isReset" = excluded."isReset",
       "note" = excluded."note",
       "updatedAt" = excluded."updatedAt"`,
    [
      row.id,
      recordDate(row.recordDate),
      idMap.meter(row.meterId),
      row.dataSource === "AUTO" ? "AUTO" : "MANUAL",
      asNumber(row.prevTotal, 0),
      asNumber(row.currTotal, 0),
      asNumber(row.consTotal, 0),
      asNumber(row.costTotal, 0),
      asBool(row.isReset),
      row.note,
      row.createdAt || new Date(),
      row.updatedAt || new Date(),
    ]
  );
}

async function importRows(label, rows, handler) {
  console.log(`${DRY_RUN ? "[dry-run] " : ""}${label}: ${rows.length}`);
  if (DRY_RUN) return;
  for (const row of rows) await handler(row);
}

async function main() {
  await erp.connect();
  await mes.connect();

  console.log("ERP -> MES electric import");
  console.log(`Mode: ${DRY_RUN ? "dry-run" : "write"}`);

  const tables = [
    'factories',
    'substations',
    'meter_group_categories',
    'electricity_prices',
    'power_meters',
    'power_telemetries',
    'power_records',
  ];
  for (const table of tables) {
    console.log(`ERP ${table}: ${await tableCount(erp, table)}`);
  }

  const factories = (await erp.query('select id, name, note from factories order by id')).rows;
  const substations = (await queryMaybe(erp, 'select id, code, name, "factoryId" from substations order by id')).rows;
  const groups = (await queryMaybe(erp, 'select id, "groupCode", "groupName", note from meter_group_categories order by id')).rows;
  const prices = (await queryMaybe(erp, 'select id, type, name, price, description, "updatedAt" from electricity_prices order by id')).rows;
  const meters = (await erp.query('select id, code, name, description, type, tu, ti, "isActive", "isAuto", "modbusId", "gatewayIp", "gatewayPort", "factoryId", "substationId", "meterGroupId" from power_meters order by id')).rows;
  const telemetry = (await queryMaybe(erp, 'select id::text as id, timestamp, "meterId", "totalEnergy", "activePower" from power_telemetries order by id')).rows;
  const records = (await queryMaybe(erp, 'select id, "recordDate", "meterId", "isReset", "dataSource", "prevTotal", "currTotal", "consTotal", "costTotal", note, "createdAt", "updatedAt" from power_records order by "recordDate", "meterId"')).rows;

  await mes.query("begin");
  try {
    await importRows("Factories", factories, upsertFactory);
    await importRows("Transformers/Substations", substations, upsertTransformer);
    await importRows("Meter groups", groups, upsertMeterGroup);
    await importRows("Electricity prices", prices, upsertPrice);
    await importRows("Meters", meters, upsertMeter);
    await importRows("Telemetry", telemetry, upsertTelemetry);
    await importRows("Records", records, upsertRecord);
    if (DRY_RUN) await mes.query("rollback");
    else await mes.query("commit");
  } catch (error) {
    await mes.query("rollback");
    throw error;
  }

  if (!DRY_RUN) {
    const mesCounts = [
      '"Factory"',
      '"PowerTransformer"',
      '"PowerMeterGroup"',
      '"ElectricityPrice"',
      '"PowerMeter"',
      '"PowerTelemetry"',
      '"PowerRecord"',
    ];
    for (const table of mesCounts) {
      console.log(`MES ${table}: ${await tableCount(mes, table)}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await erp.end().catch(() => {});
    await mes.end().catch(() => {});
  });
