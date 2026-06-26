import { prisma } from "@/lib/prisma";

export type PriceBand = "NORMAL" | "PEAK" | "OFF_PEAK";
export type DayType = "WEEKDAY" | "SUNDAY";

export type TariffRange = {
  dayType: string;
  priceType: string;
  startMinute: number;
  endMinute: number;
};

const vnFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Ho_Chi_Minh",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
});

/**
 * Gio dia phuong (Asia/Ho_Chi_Minh) cua 1 thoi diem, tinh theo phut trong ngay (0-1439)
 * va loai ngay (WEEKDAY: Thu 2 - Thu 7, SUNDAY: Chu Nhat) - dung de tra cuu khung gia EVN.
 */
export function vnDayPosition(date: Date): { minuteOfDay: number; dayType: DayType } {
  const parts = vnFormatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  const hour = Number(map.hour);
  const minute = Number(map.minute);
  return {
    minuteOfDay: hour * 60 + minute,
    dayType: map.weekday === "Sun" ? "SUNDAY" : "WEEKDAY",
  };
}

export async function getActiveTariffRanges(): Promise<TariffRange[]> {
  const version = await prisma.tariffScheduleVersion.findFirst({
    where: { isActive: true },
    include: { ranges: true },
  });
  return version?.ranges || [];
}

/** Tong so phut giao giua [startMinute, endMinute) voi tung khung gia, theo dayType. */
export function overlapMinutesByBand(
  ranges: TariffRange[],
  dayType: DayType,
  startMinute: number,
  endMinute: number,
): Record<PriceBand, number> {
  const result: Record<PriceBand, number> = { NORMAL: 0, PEAK: 0, OFF_PEAK: 0 };
  for (const range of ranges) {
    if (range.dayType !== dayType) continue;
    const overlapStart = Math.max(startMinute, range.startMinute);
    const overlapEnd = Math.min(endMinute, range.endMinute);
    if (overlapEnd > overlapStart) {
      result[range.priceType as PriceBand] += overlapEnd - overlapStart;
    }
  }
  return result;
}

/**
 * Tach tong san luong tieu thu cua tung khoang gio (giua 2 lan doc telemetry lien tiep)
 * thanh 3 khung gia, theo ty le phut giao nhau voi bieu khung gio dang active.
 * Moi khoang gio lien tiep luon nam trong cung 1 ngay vi telemetry doc dung gio chan (0 * * * *).
 */
export function splitTelemetryByTariff(
  ranges: TariffRange[],
  readings: { timestamp: Date; totalEnergy: number }[],
): { NORMAL: number; PEAK: number; OFF_PEAK: number } | null {
  if (ranges.length === 0 || readings.length < 2) return null;

  const result = { NORMAL: 0, PEAK: 0, OFF_PEAK: 0 };
  for (let i = 1; i < readings.length; i++) {
    const prev = readings[i - 1];
    const curr = readings[i];
    const delta = curr.totalEnergy - prev.totalEnergy;
    if (delta <= 0) continue; // bo qua khoang co reset/giam, da xu ly o muc tong rieng

    const { minuteOfDay: startMinute, dayType } = vnDayPosition(prev.timestamp);
    const durationMinutes = Math.round((curr.timestamp.getTime() - prev.timestamp.getTime()) / 60000);
    if (durationMinutes <= 0) continue;
    const endMinute = startMinute + durationMinutes;

    const overlap = overlapMinutesByBand(ranges, dayType, startMinute, endMinute);
    const totalMinutes = overlap.NORMAL + overlap.PEAK + overlap.OFF_PEAK;
    if (totalMinutes <= 0) continue;

    result.NORMAL += (delta * overlap.NORMAL) / totalMinutes;
    result.PEAK += (delta * overlap.PEAK) / totalMinutes;
    result.OFF_PEAK += (delta * overlap.OFF_PEAK) / totalMinutes;
  }
  return result;
}
