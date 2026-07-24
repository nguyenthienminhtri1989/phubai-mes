import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Trang thai luon tinh tuoi (khong cache), vi day la man hinh giam sat.
export const dynamic = "force-dynamic";

const DEFAULT_INTERVAL_SEC = 60;
const STALE_CYCLES = 3; // qua 3 chu ky khong thay bao cao thi coi la mat tin hieu
const MIN_STALE_MS = 180_000; // san toi thieu 3 phut, tranh bao dong gia khi mang chap chon

export type GatewayStatus = "ONLINE" | "DEGRADED" | "OFFLINE" | "UNKNOWN";

/**
 * GET /api/electric/gateway-health
 *
 * Trang thai KHONG doc tu mot cot "status" luu san, ma duoc SUY RA tai thoi diem truy van:
 * neu collector chet hoac nha may mat internet thi khong con ai bao cao, cot status cu se
 * ket cung o ONLINE va noi doi. Su VANG MAT cua bao cao moi la tin hieu that.
 *
 * Quy tac quan trong: khi collector mat tin hieu, moi gateway tra ve UNKNOWN (khong ket luan
 * gateway hong) va chi hien MOT canh bao "collector mat ket noi" - tranh bao dong gia hang loat.
 */
export async function GET() {
  const now = Date.now();

  const heartbeat = await prisma.collectorHeartbeat.findUnique({ where: { id: "default" } });
  const intervalSec = heartbeat?.intervalSec ?? DEFAULT_INTERVAL_SEC;
  const staleMs = Math.max(intervalSec * STALE_CYCLES * 1000, MIN_STALE_MS);

  const collectorLastSeen = heartbeat?.lastSeenAt ?? null;
  const collectorAgeMs = collectorLastSeen ? now - collectorLastSeen.getTime() : null;
  const collectorOnline = collectorAgeMs !== null && collectorAgeMs <= staleMs;

  const gateways = await prisma.gateway.findMany({
    where: { isActive: true },
    include: {
      factory: { select: { id: true, name: true } },
      health: true,
      _count: { select: { meters: true } },
    },
    orderBy: [{ ipAddress: "asc" }, { port: "asc" }],
  });

  const rows = gateways.map((gw) => {
    const h = gw.health;
    const reportedAgeMs = h ? now - h.reportedAt.getTime() : null;

    let status: GatewayStatus;
    if (!collectorOnline) {
      status = "UNKNOWN"; // collector chet -> khong du can cu ket luan gateway
    } else if (!h || reportedAgeMs === null || reportedAgeMs > staleMs) {
      status = "UNKNOWN"; // chua co bao cao, hoac bao cao qua cu
    } else if (!h.connected) {
      status = "OFFLINE"; // khong mo duoc TCP toi cong nay
    } else if (h.meterFailed > 0) {
      status = "DEGRADED"; // gateway song nhung co dong ho khong tra loi
    } else {
      status = "ONLINE";
    }

    return {
      id: gw.id,
      code: gw.code,
      name: gw.name,
      ipAddress: gw.ipAddress,
      port: gw.port,
      location: gw.location,
      factoryId: gw.factory?.id ?? null,
      factoryName: gw.factory?.name ?? null,
      meterCount: gw._count.meters,
      status,
      connected: h?.connected ?? null,
      lastOkAt: h?.lastOkAt ?? null,
      lastErrorAt: h?.lastErrorAt ?? null,
      lastError: h?.lastError ?? null,
      consecutiveFailures: h?.consecutiveFailures ?? 0,
      meterTotal: h?.meterTotal ?? 0,
      meterOk: h?.meterOk ?? 0,
      meterFailed: h?.meterFailed ?? 0,
      reportedAt: h?.reportedAt ?? null,
      reportedSecondsAgo: reportedAgeMs === null ? null : Math.round(reportedAgeMs / 1000),
    };
  });

  const summary = {
    total: rows.length,
    online: rows.filter((r) => r.status === "ONLINE").length,
    degraded: rows.filter((r) => r.status === "DEGRADED").length,
    offline: rows.filter((r) => r.status === "OFFLINE").length,
    unknown: rows.filter((r) => r.status === "UNKNOWN").length,
  };

  return NextResponse.json({
    checkedAt: new Date(now).toISOString(),
    staleThresholdSec: Math.round(staleMs / 1000),
    collector: {
      online: collectorOnline,
      lastSeenAt: collectorLastSeen,
      secondsAgo: collectorAgeMs === null ? null : Math.round(collectorAgeMs / 1000),
      intervalSec,
      gatewayTotal: heartbeat?.gatewayTotal ?? 0,
      gatewayOnline: heartbeat?.gatewayOnline ?? 0,
      meterTotal: heartbeat?.meterTotal ?? 0,
      meterOk: heartbeat?.meterOk ?? 0,
      meterFailed: heartbeat?.meterFailed ?? 0,
      bufferedCount: heartbeat?.bufferedCount ?? 0,
    },
    gateways: rows,
    summary,
  });
}
