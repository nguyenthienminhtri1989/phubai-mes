import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// So khop recordDate theo KHOANG ngay VN (xem chi tiet o daily-status/reports): bat duoc ca
// record nhap tay (Prisma 05:00Z) lan record AUTO (energy-cron 12:00Z) cua cung mot ngay.
function vnDayStart(dateStr: string) {
  return new Date(`${dateStr}T00:00:00.000+07:00`);
}
function vnNextDayStart(dateStr: string) {
  const d = vnDayStart(dateStr);
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * XU HƯỚNG TIÊU THỤ THEO TỪNG ĐỒNG HỒ (chủ yếu Hạ thế).
 *
 * Trả về chuỗi kWh theo ngày (hoặc tháng) cho một hoặc NHIỀU đồng hồ đã chọn,
 * để so sánh chiều hướng tăng/giảm giữa các phụ tải (điều hoà, khí nén, máy công nghệ...).
 *
 * Chỉ dùng consTotal (kWh) — số đo đáng tin của từng đồng hồ. KHÔNG trả chi phí, vì chi phí
 * của đồng hồ hạ thế là số PHÂN BỔ NGƯỢC từ hoá đơn EVN (xem báo cáo), không có nghĩa khi
 * đứng riêng một đồng hồ.
 *
 * Cach loc ngay dung chung KHOANG NGAY VN (vnDayStart) voi bao cao de so lieu khop nhau.
 */

function dateKey(date: Date, groupBy: string) {
  const iso = date.toISOString().slice(0, 10);
  return groupBy === "month" ? iso.slice(0, 7) : iso;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate") || searchParams.get("from");
  const endDate = searchParams.get("endDate") || searchParams.get("to");
  const groupBy = searchParams.get("groupBy") === "month" ? "month" : "day";
  const meterIds = (searchParams.get("meterIds") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const groupIds = (searchParams.get("groupIds") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // --- Chế độ NHÓM: gom kWh tất cả đồng hồ cùng nhóm thành 1 series ---
  if (groupIds.length > 0) {
    const groups = await prisma.powerMeterGroup.findMany({
      where: { id: { in: groupIds } },
      select: { id: true, code: true, name: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });

    const rows = await prisma.powerRecord.findMany({
      where: {
        meter: {
          groupId: { in: groupIds },
          type: 1, // chỉ hạ thế
          excludeFromTotal: false,
        },
        recordDate:
          startDate || endDate
            ? {
                gte: startDate ? vnDayStart(startDate) : undefined,
                lt: endDate ? vnNextDayStart(endDate) : undefined,
              }
            : undefined,
      },
      select: {
        recordDate: true,
        consTotal: true,
        meter: { select: { groupId: true } },
      },
      orderBy: [{ recordDate: "asc" }],
    });

    const dateSet = new Set<string>();
    for (const r of rows) dateSet.add(dateKey(r.recordDate, groupBy));
    const dates = Array.from(dateSet).sort();

    // groupId -> (dateKey -> tổng kWh)
    const valueMap = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const gid = r.meter.groupId;
      if (!gid) continue;
      const key = dateKey(r.recordDate, groupBy);
      let m = valueMap.get(gid);
      if (!m) {
        m = new Map<string, number>();
        valueMap.set(gid, m);
      }
      m.set(key, (m.get(key) || 0) + r.consTotal);
    }

    const series = groups.map((g) => {
      const vm = valueMap.get(g.id) || new Map<string, number>();
      return {
        meterId: g.id,
        meterCode: g.code,
        meterName: g.name,
        points: dates.map((d) =>
          vm.has(d) ? Number((vm.get(d) as number).toFixed(2)) : null,
        ),
      };
    });

    return NextResponse.json({ dates, series });
  }

  // --- Chế độ ĐỒNG HỒ (mặc định) ---
  if (meterIds.length === 0) {
    return NextResponse.json({ dates: [], series: [] });
  }

  const [meters, rows] = await Promise.all([
    prisma.powerMeter.findMany({
      where: { id: { in: meterIds } },
      select: { id: true, code: true, name: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    }),
    prisma.powerRecord.findMany({
      where: {
        meterId: { in: meterIds },
        recordDate:
          startDate || endDate
            ? {
                gte: startDate ? vnDayStart(startDate) : undefined,
                lt: endDate ? vnNextDayStart(endDate) : undefined,
              }
            : undefined,
      },
      select: { meterId: true, recordDate: true, consTotal: true },
      orderBy: [{ recordDate: "asc" }],
    }),
  ]);

  // Trục thời gian = tập các mốc (ngày/tháng) có dữ liệu, sắp tăng dần.
  const dateSet = new Set<string>();
  for (const r of rows) dateSet.add(dateKey(r.recordDate, groupBy));
  const dates = Array.from(dateSet).sort();

  // meterId -> (dateKey -> tổng kWh). Gom tháng thì cộng dồn trong tháng.
  const valueMap = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const key = dateKey(r.recordDate, groupBy);
    let m = valueMap.get(r.meterId);
    if (!m) {
      m = new Map<string, number>();
      valueMap.set(r.meterId, m);
    }
    m.set(key, (m.get(key) || 0) + r.consTotal);
  }

  // Giữ đúng danh sách đồng hồ đã chọn (kể cả đồng hồ chưa có số liệu -> chuỗi rỗng),
  // điểm nào không có dữ liệu = null để biểu đồ ngắt đoạn thay vì vẽ về 0.
  const series = meters.map((meter) => {
    const vm = valueMap.get(meter.id) || new Map<string, number>();
    return {
      meterId: meter.id,
      meterCode: meter.code,
      meterName: meter.name,
      points: dates.map((d) =>
        vm.has(d) ? Number((vm.get(d) as number).toFixed(2)) : null,
      ),
    };
  });

  return NextResponse.json({ dates, series });
}
