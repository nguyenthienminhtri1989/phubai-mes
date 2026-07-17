import { NextRequest, NextResponse } from "next/server";
import { toRecordDate } from "@/lib/energy-record";
import { prisma } from "@/lib/prisma";

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
 * Cách lọc ngày dùng chung `toRecordDate` với báo cáo để số liệu khớp nhau.
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
                gte: startDate ? toRecordDate(startDate) : undefined,
                lte: endDate ? toRecordDate(endDate) : undefined,
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
