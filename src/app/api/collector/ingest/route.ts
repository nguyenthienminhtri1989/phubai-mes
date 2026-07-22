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

// POST /api/collector/ingest
// Body: { readings: [ { meterId, totalEnergy, readAt } ] }
// - Cap nhat ban doc moi nhat (PowerLiveReading) cho realtime.
// - Ghi telemetry lich su theo gio (timestamp = readAt, KHONG dung now() de buffer gui tre van dung moc).
export async function POST(request: NextRequest) {
  const guard = requireCollectorKey(request);
  if (!guard.ok) return guard.response;

  let body: { readings?: IncomingReading[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body khong phai JSON hop le" }, { status: 400 });
  }

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
    return NextResponse.json({ liveUpdated: 0, telemetryInserted: 0, skipped: rawReadings.length });
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
  });
}
