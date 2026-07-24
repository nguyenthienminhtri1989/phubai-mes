import { NextRequest, NextResponse } from "next/server";
import { requireCollectorKey } from "@/lib/collector-auth";
import { prisma } from "@/lib/prisma";

// Telemetry lich su lay theo MOC GIO TRON: chi luu ban doc DAU TIEN cua moi gio
// (vd ~08:00, ~09:00...), khong phinh bang du collector doc day moi 60s.
// Moc gio tinh bang UTC; vi gio VN lech UTC dung 7 tieng chan nen moc gio tron UTC
// trung khop moc gio tron VN.
function hourBucket(ms: number) {
  return Math.floor(ms / 3_600_000);
}

type IncomingReading = {
  meterId?: unknown;
  totalEnergy?: unknown;
  readAt?: unknown;
};

type ParsedReading = {
  meterId: string;
  totalEnergy: number;
  readAt: Date;
};

type ParsedGateway = {
  ipAddress: string;
  port: number;
  connected: boolean;
  error: string | null;
  meterTotal: number;
  meterOk: number;
  meterFailed: number;
  at: Date;
};

function toCount(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

function toDate(value: unknown) {
  if (!value) return new Date();
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function parseGateways(raw: unknown): ParsedGateway[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedGateway[] = [];
  for (const item of raw) {
    const g = (item ?? {}) as Record<string, unknown>;
    const ipAddress = typeof g.ipAddress === "string" ? g.ipAddress.trim() : "";
    const port = Number(g.port);
    if (!ipAddress || !Number.isFinite(port)) continue;
    out.push({
      ipAddress,
      port: Math.trunc(port),
      connected: g.connected === true,
      error: typeof g.error === "string" && g.error ? g.error.slice(0, 500) : null,
      meterTotal: toCount(g.meterTotal),
      meterOk: toCount(g.meterOk),
      meterFailed: toCount(g.meterFailed),
      at: toDate(g.at),
    });
  }
  return out;
}

/**
 * Ghi bao cao suc khoe cua tung bus gateway.
 * Gateway chua co trong danh muc se duoc TU TAO (upsert theo ipAddress+port) de giam sat
 * chay duoc ngay, nguoi dung doi ten/gan nha may sau trong `/electric/catalog`.
 */
async function saveGatewayHealth(gateways: ParsedGateway[]) {
  if (gateways.length === 0) return 0;

  const ids = new Map<string, string>();
  for (const g of gateways) {
    const row = await prisma.gateway.upsert({
      where: { ipAddress_port: { ipAddress: g.ipAddress, port: g.port } },
      create: {
        code: `GW-${g.ipAddress.replace(/\./g, "-")}-${g.port}`,
        name: `Gateway ${g.ipAddress}:${g.port}`,
        ipAddress: g.ipAddress,
        port: g.port,
      },
      update: {},
      select: { id: true },
    });
    ids.set(`${g.ipAddress}:${g.port}`, row.id);
  }

  // Lay so lan hong lien tiep dang co de cong don (dung de phan biet chap chon vs hong han).
  const existing = await prisma.gatewayHealth.findMany({
    where: { gatewayId: { in: [...ids.values()] } },
    select: { gatewayId: true, consecutiveFailures: true },
  });
  const failuresById = new Map(existing.map((h) => [h.gatewayId, h.consecutiveFailures]));

  let saved = 0;
  for (const g of gateways) {
    const gatewayId = ids.get(`${g.ipAddress}:${g.port}`);
    if (!gatewayId) continue;

    const consecutiveFailures = g.connected ? 0 : (failuresById.get(gatewayId) ?? 0) + 1;
    const hasProblem = !g.connected || g.error !== null;

    await prisma.gatewayHealth.upsert({
      where: { gatewayId },
      create: {
        gatewayId,
        connected: g.connected,
        lastOkAt: g.connected ? g.at : null,
        lastErrorAt: hasProblem ? g.at : null,
        lastError: g.error,
        consecutiveFailures,
        meterTotal: g.meterTotal,
        meterOk: g.meterOk,
        meterFailed: g.meterFailed,
        reportedAt: g.at,
      },
      update: {
        connected: g.connected,
        ...(g.connected ? { lastOkAt: g.at } : {}),
        ...(hasProblem ? { lastErrorAt: g.at, lastError: g.error } : { lastError: null }),
        consecutiveFailures,
        meterTotal: g.meterTotal,
        meterOk: g.meterOk,
        meterFailed: g.meterFailed,
        reportedAt: g.at,
      },
    });
    saved += 1;
  }

  return saved;
}

/** Nhip tim collector: chi mot dong id="default". Vang mat dong nay qua lau = collector chet. */
async function saveHeartbeat(raw: unknown) {
  if (!raw || typeof raw !== "object") return false;
  const c = raw as Record<string, unknown>;
  const intervalSec = Number(c.intervalSec);

  const stats = {
    lastSeenAt: toDate(c.at),
    gatewayTotal: toCount(c.gatewayTotal),
    gatewayOnline: toCount(c.gatewayOnline),
    meterTotal: toCount(c.meterTotal),
    meterOk: toCount(c.meterOk),
    meterFailed: toCount(c.meterFailed),
    bufferedCount: toCount(c.bufferedCount),
    intervalSec: Number.isFinite(intervalSec) && intervalSec > 0 ? Math.trunc(intervalSec) : null,
  };

  await prisma.collectorHeartbeat.upsert({
    where: { id: "default" },
    create: { id: "default", ...stats },
    update: stats,
  });
  return true;
}

// POST /api/collector/ingest
// Body: { readings: [...], gateways?: [...], collector?: {...} }
// - Cap nhat ban doc moi nhat (PowerLiveReading) cho realtime.
// - Ghi telemetry lich su theo gio (timestamp = readAt, KHONG dung now() de buffer gui tre van dung moc).
// - Ghi suc khoe tung bus gateway + nhip tim collector (2 truong sau la optional -> tuong thich
//   nguoc voi collector ban cu chi gui `readings`).
export async function POST(request: NextRequest) {
  const guard = requireCollectorKey(request);
  if (!guard.ok) return guard.response;

  let body: { readings?: IncomingReading[]; gateways?: unknown; collector?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body khong phai JSON hop le" }, { status: 400 });
  }

  // Ghi suc khoe TRUOC readings: chu ky khong doc duoc dong ho nao chinh la luc
  // bao cao trang thai quan trong nhat, khong duoc return som bo qua.
  const gatewaysReported = await saveGatewayHealth(parseGateways(body?.gateways));
  const heartbeatSaved = await saveHeartbeat(body?.collector);

  const rawReadings = Array.isArray(body?.readings) ? body.readings : [];

  // Loc cac reading hop le (kieu du lieu dung).
  const parsed: ParsedReading[] = [];
  for (const r of rawReadings) {
    const meterId = typeof r.meterId === "string" ? r.meterId : "";
    const totalEnergy = Number(r.totalEnergy);
    const readAt = r.readAt ? new Date(r.readAt as string) : null;
    if (!meterId || !Number.isFinite(totalEnergy) || !readAt || Number.isNaN(readAt.getTime())) {
      continue;
    }
    parsed.push({ meterId, totalEnergy, readAt });
  }

  if (parsed.length === 0) {
    return NextResponse.json({
      liveUpdated: 0,
      telemetryInserted: 0,
      skipped: rawReadings.length,
      gatewaysReported,
      heartbeatSaved,
    });
  }

  // Xu ly theo thu tu thoi gian tang dan de buffer ton dong duoc ghi dung nhip.
  parsed.sort((a, b) => a.readAt.getTime() - b.readAt.getTime());

  const meterIds = [...new Set(parsed.map((r) => r.meterId))];

  // Chi nhan reading cua dong ho co that (tranh loi khoa ngoai lam hong ca lo).
  const existingMeters = await prisma.powerMeter.findMany({
    where: { id: { in: meterIds } },
    select: { id: true },
  });
  const validMeters = new Set(existingMeters.map((m) => m.id));

  // Moc gio tron cua telemetry gan nhat hien co cua tung dong ho.
  const lastTelemetry = await prisma.powerTelemetry.groupBy({
    by: ["meterId"],
    where: { meterId: { in: meterIds } },
    _max: { timestamp: true },
  });
  const lastTelemetryBucket = new Map<string, number>();
  for (const row of lastTelemetry) {
    if (row._max.timestamp) lastTelemetryBucket.set(row.meterId, hourBucket(row._max.timestamp.getTime()));
  }

  // Moc live hien co de khong de ban doc cu dan len ban doc moi hon.
  const existingLive = await prisma.powerLiveReading.findMany({
    where: { meterId: { in: meterIds } },
    select: { meterId: true, readAt: true },
  });
  const liveTs = new Map<string, number>();
  for (const row of existingLive) liveTs.set(row.meterId, row.readAt.getTime());

  let skipped = rawReadings.length - parsed.length;

  // Gom truoc, ghi DB theo lo de moi POST khong bi keo dai khi nhieu dong ho:
  //  - live: chi giu ban doc MOI NHAT cua moi dong ho (parsed da sap tang dan nen ban cuoi la moi nhat).
  //  - telemetry: chi ban doc DAU TIEN cua moi gio tron, gom vao mang roi createMany.
  const newestLive = new Map<string, ParsedReading>();
  const telemetryRows: { meterId: string; totalEnergy: number; timestamp: Date }[] = [];

  for (const reading of parsed) {
    if (!validMeters.has(reading.meterId)) {
      skipped += 1;
      continue;
    }

    // 1) Ban doc moi nhat cho realtime (ghi de vi parsed tang dan theo thoi gian).
    newestLive.set(reading.meterId, reading);

    // 2) Telemetry lich su theo gio tron.
    const readBucket = hourBucket(reading.readAt.getTime());
    const lastBucket = lastTelemetryBucket.get(reading.meterId);
    if (lastBucket === undefined || readBucket > lastBucket) {
      telemetryRows.push({
        meterId: reading.meterId,
        totalEnergy: reading.totalEnergy,
        timestamp: reading.readAt,
      });
      lastTelemetryBucket.set(reading.meterId, readBucket);
    }
  }

  // Chi upsert live khi ban moi nhat that su moi hon ban dang luu.
  const liveUpserts = [];
  for (const [meterId, reading] of newestLive) {
    const currentLive = liveTs.get(meterId);
    if (currentLive !== undefined && reading.readAt.getTime() < currentLive) continue;
    liveUpserts.push(
      prisma.powerLiveReading.upsert({
        where: { meterId },
        create: { meterId, totalEnergy: reading.totalEnergy, readAt: reading.readAt },
        update: { totalEnergy: reading.totalEnergy, readAt: reading.readAt },
      }),
    );
  }

  if (liveUpserts.length > 0) await prisma.$transaction(liveUpserts);
  if (telemetryRows.length > 0) await prisma.powerTelemetry.createMany({ data: telemetryRows });

  return NextResponse.json({
    liveUpdated: liveUpserts.length,
    telemetryInserted: telemetryRows.length,
    skipped,
    gatewaysReported,
    heartbeatSaved,
  });
}
