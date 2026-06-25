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

  if (meter.type === 2) {
    const prevNormal = lastRecord?.currNormal ?? 0;
    const prevPeak = lastRecord?.currPeak ?? 0;
    const prevOffPeak = lastRecord?.currOffPeak ?? 0;

    const currNormal = input.currNormal ?? 0;
    const currPeak = input.currPeak ?? 0;
    const currOffPeak = input.currOffPeak ?? 0;

    const isReset =
      currNormal < prevNormal || currPeak < prevPeak || currOffPeak < prevOffPeak;

    const deltaNormal = tariffDelta(currNormal, prevNormal, isReset);
    const deltaPeak = tariffDelta(currPeak, prevPeak, isReset);
    const deltaOffPeak = tariffDelta(currOffPeak, prevOffPeak, isReset);

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
    };
  }

  const previous = input.prevTotal ?? lastRecord?.currTotal ?? 0;
  const currTotal = input.currTotal ?? 0;
  const unitPrice = input.unitPrice ?? (await getNormalUnitPrice());
  const isReset = currTotal < previous;
  const delta = tariffDelta(currTotal, previous, isReset);
  const consTotal = delta * meter.tu * meter.ti;

  return {
    prevTotal: previous,
    currTotal,
    unitPrice,
    isReset,
    consTotal,
    costTotal: consTotal * unitPrice,
  };
}
