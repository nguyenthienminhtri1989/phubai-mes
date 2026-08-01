import { NextRequest, NextResponse } from "next/server";
import { requireCollectorKey } from "@/lib/collector-auth";
import fs from "fs";
import path from "path";

/**
 * POST /api/collector/heartbeat
 *
 * Mini PC goi endpoint nay moi 2 phut de bao "toi van song".
 * VPS ghi timestamp vao file /tmp/minipc-heartbeat.
 * Mot cron script rieng kiem tra tuoi file nay va gui Telegram neu qua han.
 */

const HEARTBEAT_FILE = "/tmp/minipc-heartbeat";

export async function POST(request: NextRequest) {
  const auth = requireCollectorKey(request);
  if (!auth.ok) return auth.response;

  try {
    const now = new Date().toISOString();
    fs.writeFileSync(HEARTBEAT_FILE, now, "utf-8");

    return NextResponse.json({ ok: true, receivedAt: now });
  } catch (err) {
    console.error("Heartbeat write error:", err);
    return NextResponse.json(
      { error: "Failed to write heartbeat" },
      { status: 500 },
    );
  }
}

export async function GET() {
  // Cho phep kiem tra trang thai heartbeat (khong can auth)
  try {
    if (!fs.existsSync(HEARTBEAT_FILE)) {
      return NextResponse.json({ lastHeartbeat: null, status: "no-data" });
    }
    const content = fs.readFileSync(HEARTBEAT_FILE, "utf-8").trim();
    const lastBeat = new Date(content);
    const ageMs = Date.now() - lastBeat.getTime();
    const ageMinutes = Math.round(ageMs / 60000);

    return NextResponse.json({
      lastHeartbeat: content,
      ageMinutes,
      status: ageMinutes <= 5 ? "online" : "offline",
    });
  } catch {
    return NextResponse.json({ lastHeartbeat: null, status: "error" });
  }
}
