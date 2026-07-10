import { prisma } from "@/lib/prisma";

export function toRecordDate(value: string | Date) {
  if (value instanceof Date) return value;
  return new Date(`${value}T12:00:00.000+07:00`);
}

export async function getUnitPrice(type: string) {
  const price = await prisma.electricityPrice.findUnique({ where: { type } });
  return price?.price ?? 0;
}

export async function getNormalUnitPrice() {
  return getUnitPrice("NORMAL");
}

function tariffDelta(curr: number, prev: number, isReset: boolean) {
  return isReset ? curr : Math.max(0, curr - prev);
}

/**
 * Đồng hồ Hạ thế (type=1): 1 chỉ số tổng.
 * Đồng hồ Trung thế (type=2): 3 chỉ số riêng (Bình thường/Cao điểm/Thấp điểm),
 * mỗi chỉ số tự phát hiện reset và tính tiền theo đúng đơn giá khung giờ của nó.
 */
export async function buildPowerRecordValues(input: {
  meterId: string;
  recordDate: Date;
  currTotal?: number;
  prevTotal?: number;
  currNormal?: number;
  currPeak?: number;
  currOffPeak?: number;
  unitPrice?: number;
}) {
  const meter = await prisma.powerMeter.findUniqueOrThrow({
    where: { id: input.meterId },
  });

  const lastRecord = await prisma.powerRecord.findFirst({
    where: { meterId: input.meterId, recordDate: { lt: input.recordDate } },
    orderBy: { recordDate: "desc" },
  });

  const BASELINE_NOTE = "Chỉ số đầu kỳ (baseline) - chưa tính tiêu thụ";
  const RESET_NOTE =
    "Nghi reset/thay đồng hồ (chỉ số mới < kỳ trước) - chưa tính tiêu thụ, cần kiểm tra & nhập tay";

  if (meter.type === 2) {
    const currNormal = input.currNormal ?? 0;
    const currPeak = input.currPeak ?? 0;
    const currOffPeak = input.currOffPeak ?? 0;

    // Lần đầu tiên (chưa có bản ghi kỳ trước để trừ): lưu cả 3 chỉ số làm MỐC GỐC,
    // không phát sinh tiêu thụ/chi phí. Từ kỳ sau mới lấy hiệu để ra sản lượng.
    if (!lastRecord) {
      const priceNormal = await getUnitPrice("NORMAL");
      return {
        prevTotal: 0,
        currTotal: 0,
        consTotal: 0,
        prevNormal: currNormal,
        currNormal,
        consNormal: 0,
        prevPeak: currPeak,
        currPeak,
        consPeak: 0,
        prevOffPeak: currOffPeak,
        currOffPeak,
        consOffPeak: 0,
        unitPrice: priceNormal,
        isReset: false,
        costTotal: 0,
        note: BASELINE_NOTE,
      };
    }

    const prevNormal = lastRecord.currNormal ?? 0;
    const prevPeak = lastRecord.currPeak ?? 0;
    const prevOffPeak = lastRecord.currOffPeak ?? 0;

    const isReset =
      currNormal < prevNormal || currPeak < prevPeak || currOffPeak < prevOffPeak;

    // Bất kỳ tier nào tụt số (nghi reset/thay đồng hồ): KHÔNG tự tính tiêu thụ cả 3 tier
    // để tránh dữ liệu sai. Ghi cờ + cảnh báo để người vận hành kiểm tra và nhập tay chỉ số cắt.
    if (isReset) {
      const priceNormal = await getUnitPrice("NORMAL");
      return {
        prevTotal: 0,
        currTotal: 0,
        consTotal: 0,
        prevNormal,
        currNormal,
        consNormal: 0,
        prevPeak,
        currPeak,
        consPeak: 0,
        prevOffPeak,
        currOffPeak,
        consOffPeak: 0,
        unitPrice: priceNormal,
        isReset: true,
        costTotal: 0,
        note: RESET_NOTE,
      };
    }

    const deltaNormal = tariffDelta(currNormal, prevNormal, false);
    const deltaPeak = tariffDelta(currPeak, prevPeak, false);
    const deltaOffPeak = tariffDelta(currOffPeak, prevOffPeak, false);

    const consNormal = deltaNormal * meter.tu * meter.ti;
    const consPeak = deltaPeak * meter.tu * meter.ti;
    const consOffPeak = deltaOffPeak * meter.tu * meter.ti;
    const consTotal = consNormal + consPeak + consOffPeak;

    const [priceNormal, pricePeak, priceOffPeak] = await Promise.all([
      getUnitPrice("NORMAL"),
      getUnitPrice("PEAK"),
      getUnitPrice("OFF_PEAK"),
    ]);

    const costTotal = consNormal * priceNormal + consPeak * pricePeak + consOffPeak * priceOffPeak;

    return {
      prevTotal: 0,
      currTotal: 0,
      consTotal,
      prevNormal,
      currNormal,
      consNormal,
      prevPeak,
      currPeak,
      consPeak,
      prevOffPeak,
      currOffPeak,
      consOffPeak,
      unitPrice: priceNormal,
      isReset,
      costTotal,
      note: undefined,
    };
  }

  const currTotal = input.currTotal ?? 0;
  const unitPrice = input.unitPrice ?? (await getNormalUnitPrice());

  // "Chỉ số đầu kỳ" do người dùng chủ ý nhập chỉ hợp lệ khi > 0. Client của trang nhập tay
  // LUÔN gửi prevTotal (mặc định 0 khi chưa có kỳ trước), nên 0/không có = KHÔNG có chỉ số
  // đầu kỳ thủ công -> tránh dựa vào `== null` (vì 0 == null là false).
  const hasManualPrev = input.prevTotal != null && input.prevTotal > 0;

  // Lần đầu tiên với đồng hồ Hạ thế (chưa có bản ghi kỳ trước) VÀ người dùng không nhập
  // chỉ số đầu kỳ: đây là MỐC GỐC -> lưu chỉ số hiện tại, tiêu thụ = 0 (không tính nhầm toàn bộ lũy kế).
  if (!lastRecord && !hasManualPrev) {
    return {
      prevTotal: currTotal,
      currTotal,
      unitPrice,
      isReset: false,
      consTotal: 0,
      costTotal: 0,
      note: BASELINE_NOTE,
    };
  }

  const previous = input.prevTotal ?? lastRecord?.currTotal ?? 0;
  const isReset = currTotal < previous;

  // Đồng hồ tụt số (nghi bị reset/thay/tràn): KHÔNG tự tính tiêu thụ để tránh dữ liệu sai.
  // Ghi cờ + cảnh báo để người vận hành kiểm tra và nhập tay chỉ số cắt nếu cần.
  if (isReset) {
    return {
      prevTotal: previous,
      currTotal,
      unitPrice,
      isReset: true,
      consTotal: 0,
      costTotal: 0,
      note: RESET_NOTE,
    };
  }

  const delta = tariffDelta(currTotal, previous, false);
  const consTotal = delta * meter.tu * meter.ti;

  return {
    prevTotal: previous,
    currTotal,
    unitPrice,
    isReset: false,
    consTotal,
    costTotal: consTotal * unitPrice,
    note: undefined,
  };
}
