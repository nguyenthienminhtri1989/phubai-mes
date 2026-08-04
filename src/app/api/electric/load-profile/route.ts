import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * BÁO CÁO PHỤ TẢI & CÔNG SUẤT ĐỈNH (peak shaving).
 *
 * Đọc từ PowerLoadProfile (khoảng 30 phút, mức đồng hồ) và PowerPeakMonthly (chốt tháng).
 * KHÔNG đọc PowerTelemetry — dữ liệu thô chỉ giữ 90 ngày và đã được rollup xử lý sạch
 * (chặn đứt chuỗi hai chiều) trong scripts/load-profile-rollup.js.
 *
 * CHỈ CÓ ĐỒNG HỒ HẠ THẾ AUTO mới có đường cong: đồng hồ trung thế (type=2) chỉ có 1 số/ngày
 * lúc 06:00 từ portal EVN. Do đó đường cong là TỔNG CÁC NHÁNH hạ thế, KHÔNG phải số trên
 * công tơ EVN — hai con số này lệch nhau (tổn hao, nhánh chưa gắn đồng hồ).
 *
 * ĐỈNH CỦA TỔNG != TỔNG CÁC ĐỈNH: mọi phép gộp đều CỘNG theo từng khoảng 30 phút TRƯỚC
 * (group by intervalStart), rồi mới lấy max. Cộng các đỉnh riêng lẻ của từng nhánh sẽ ra
 * con số không bao giờ tồn tại trong thực tế.
 */

const BUCKET_MIN = 30;
const MIN_MINUTES_FOR_PEAK = 25;
const PEAK_COVERAGE_RATIO = 0.8;

function vnDayStart(dateStr: string) {
  return new Date(`${dateStr}T00:00:00.000+07:00`);
}
function vnNextDayStart(dateStr: string) {
  const d = vnDayStart(dateStr);
  d.setDate(d.getDate() + 1);
  return d;
}

/** Ngày VN (YYYY-MM-DD) của một instant. */
function vnDate(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

/** Chỉ số khoảng trong ngày: 0..47 (0 = 00:00-00:30 giờ VN). */
function vnSlot(d: Date) {
  const hhmm = d.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const [h, m] = hhmm.split(":").map(Number);
  return h * 2 + (m >= BUCKET_MIN ? 1 : 0);
}

type IntervalRow = {
  intervalStart: Date;
  kw: number;
  kwh: number;
  meterCount: number;
  minMinutes: number;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const factoryId = searchParams.get("factoryId") || undefined;
  const groupId = searchParams.get("groupId") || undefined;
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "Thiếu tham số from/to" }, { status: 400 });
  }

  const start = vnDayStart(from);
  const end = vnNextDayStart(to);

  // Lọc đồng hồ: luôn loại excludeFromTotal (đồng hồ tổng trùm) để không đếm đôi.
  // groupId lọc LÚC QUERY chứ không đóng băng vào PowerLoadProfile — nhóm là lăng kính
  // phân tích, người dùng sẽ sắp xếp lại; đóng băng sẽ làm báo cáo cũ/mới mâu thuẫn.
  const meterWhere: Record<string, unknown> = {
    excludeFromTotal: false,
    type: 1,
    isAuto: true,
  };
  if (groupId) meterWhere.groupId = groupId;

  const meters = await prisma.powerMeter.findMany({
    where: meterWhere,
    select: { id: true, code: true, name: true },
  });
  const meterIds = meters.map((m) => m.id);
  const meterById = new Map(meters.map((m) => [m.id, m]));

  if (meterIds.length === 0) {
    return NextResponse.json({
      intervals: [],
      days: [],
      heatmap: [],
      peak: null,
      monthly: [],
      events: [],
      meterCountTotal: 0,
      fullMeterCount: 0,
    });
  }

  const profiles = await prisma.powerLoadProfile.findMany({
    where: {
      meterId: { in: meterIds },
      intervalStart: { gte: start, lt: end },
      ...(factoryId ? { factoryId } : {}),
    },
    select: {
      meterId: true,
      intervalStart: true,
      kwh: true,
      avgKw: true,
      minutes: true,
    },
    orderBy: { intervalStart: "asc" },
  });

  // ----- Gộp theo khoảng 30 phút -----
  const byInterval = new Map<number, IntervalRow>();
  for (const p of profiles) {
    const ms = p.intervalStart.getTime();
    let row = byInterval.get(ms);
    if (!row) {
      row = {
        intervalStart: p.intervalStart,
        kw: 0,
        kwh: 0,
        meterCount: 0,
        minMinutes: Number.POSITIVE_INFINITY,
      };
      byInterval.set(ms, row);
    }
    row.kw += p.avgKw;
    row.kwh += p.kwh;
    row.meterCount += 1;
    row.minMinutes = Math.min(row.minMinutes, p.minutes);
  }

  const intervalRows = [...byInterval.values()].sort(
    (a, b) => a.intervalStart.getTime() - b.intervalStart.getTime(),
  );

  // Số đồng hồ báo cáo đông nhất = "đầy đủ". Tự hiệu chỉnh, không khai báo cứng.
  const fullMeterCount = intervalRows.reduce((mx, r) => Math.max(mx, r.meterCount), 0);
  const minMeterCount = Math.max(1, Math.round(fullMeterCount * PEAK_COVERAGE_RATIO));

  const isEligible = (r: IntervalRow) =>
    r.meterCount >= minMeterCount && r.minMinutes >= MIN_MINUTES_FOR_PEAK;

  const intervals = intervalRows.map((r) => ({
    at: r.intervalStart.toISOString(),
    date: vnDate(r.intervalStart),
    slot: vnSlot(r.intervalStart),
    kw: Number(r.kw.toFixed(1)),
    kwh: Number(r.kwh.toFixed(2)),
    meterCount: r.meterCount,
    eligible: isEligible(r),
  }));

  // ----- Đỉnh trong khoảng đang xem -----
  // Hòa nhau -> lấy khoảng SỚM HƠN (quy tắc phải rõ ràng, nếu không mỗi lần tải lại ra
  // kết quả khác nhau và không ai còn tin vào con số).
  const eligible = intervalRows.filter(isEligible);
  let peak: {
    at: string;
    kw: number;
    meterCount: number;
    contributions: { code: string; name: string; kw: number }[];
  } | null = null;

  if (eligible.length > 0) {
    let best = eligible[0];
    for (const r of eligible) if (r.kw > best.kw) best = r;

    const contributions = profiles
      .filter((p) => p.intervalStart.getTime() === best.intervalStart.getTime())
      .map((p) => ({
        code: meterById.get(p.meterId)?.code || "?",
        name: meterById.get(p.meterId)?.name || "",
        kw: Number(p.avgKw.toFixed(1)),
      }))
      .sort((a, b) => b.kw - a.kw);

    peak = {
      at: best.intervalStart.toISOString(),
      kw: Number(best.kw.toFixed(1)),
      meterCount: best.meterCount,
      contributions,
    };
  }

  // ----- Tổng hợp theo ngày -----
  const dayMap = new Map<string, { kwh: number; peakKw: number; peakSlot: number; slots: number }>();
  for (const it of intervals) {
    let d = dayMap.get(it.date);
    if (!d) {
      d = { kwh: 0, peakKw: 0, peakSlot: 0, slots: 0 };
      dayMap.set(it.date, d);
    }
    d.kwh += it.kwh;
    d.slots += 1;
    if (it.eligible && it.kw > d.peakKw) {
      d.peakKw = it.kw;
      d.peakSlot = it.slot;
    }
  }
  const days = [...dayMap.entries()]
    .map(([date, v]) => ({
      date,
      kwh: Number(v.kwh.toFixed(1)),
      peakKw: Number(v.peakKw.toFixed(1)),
      peakSlot: v.peakSlot,
      // Hệ số phụ tải ngày = trung bình / đỉnh. Càng thấp càng nhiều dư địa cắt đỉnh.
      loadFactor: v.peakKw > 0 ? Number((v.kwh / (v.slots * 0.5) / v.peakKw).toFixed(3)) : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ----- Heatmap ngày x khoảng -----
  const heatmap = intervals.map((it) => ({
    date: it.date,
    slot: it.slot,
    kw: it.kw,
    eligible: it.eligible,
  }));

  // ----- Đỉnh các tháng (từ bảng chốt, giữ vĩnh viễn) -----
  const monthlyRows = await prisma.powerPeakMonthly.findMany({
    where: factoryId ? { factoryId } : {},
    select: {
      year: true,
      month: true,
      peakKw: true,
      peakAt: true,
      totalKwh: true,
      loadFactor: true,
      isMonthClosed: true,
      factory: { select: { code: true, name: true } },
    },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });
  const monthly = monthlyRows.map((m) => ({
    label: `${String(m.month).padStart(2, "0")}/${m.year}`,
    factoryCode: m.factory.code,
    peakKw: Number(m.peakKw.toFixed(1)),
    peakAt: m.peakAt.toISOString(),
    totalKwh: Number(m.totalKwh.toFixed(1)),
    loadFactor: Number(m.loadFactor.toFixed(3)),
    isMonthClosed: m.isMonthClosed,
  }));

  // ----- Sự kiện đứt chuỗi trong khoảng (giải thích các lỗ hổng trên đường cong) -----
  const eventRows = await prisma.powerMeterEvent.findMany({
    where: { meterId: { in: meterIds }, occurredAt: { gte: start, lt: end } },
    select: {
      occurredAt: true,
      kind: true,
      source: true,
      prevTotal: true,
      currTotal: true,
      impliedKw: true,
      note: true,
      acknowledged: true,
      meter: { select: { code: true, name: true } },
    },
    orderBy: { occurredAt: "desc" },
    take: 100,
  });
  const events = eventRows.map((e) => ({
    at: e.occurredAt.toISOString(),
    code: e.meter.code,
    name: e.meter.name,
    kind: e.kind,
    source: e.source,
    prevTotal: e.prevTotal,
    currTotal: e.currTotal,
    impliedKw: e.impliedKw,
    note: e.note,
    acknowledged: e.acknowledged,
  }));

  return NextResponse.json({
    intervals,
    days,
    heatmap,
    peak,
    monthly,
    events,
    meterCountTotal: meterIds.length,
    fullMeterCount,
  });
}
