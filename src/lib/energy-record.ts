import { prisma } from "@/lib/prisma";

export function toRecordDate(value: string | Date) {
  if (value instanceof Date) return value;
  return new Date(`${value}T12:00:00.000+07:00`);
}

export async function getNormalUnitPrice() {
  const price = await prisma.electricityPrice.findUnique({
    where: { type: "NORMAL" },
  });

  return price?.price ?? 0;
}

export async function buildPowerRecordValues(input: {
  meterId: string;
  recordDate: Date;
  currTotal: number;
  prevTotal?: number;
  unitPrice?: number;
}) {
  const meter = await prisma.powerMeter.findUniqueOrThrow({
    where: { id: input.meterId },
  });

  const previous =
    input.prevTotal ??
    (
      await prisma.powerRecord.findFirst({
        where: {
          meterId: input.meterId,
          recordDate: { lt: input.recordDate },
        },
        orderBy: { recordDate: "desc" },
      })
    )?.currTotal ??
    0;

  const unitPrice = input.unitPrice ?? (await getNormalUnitPrice());
  const isReset = input.currTotal < previous;
  const delta = isReset ? input.currTotal : Math.max(0, input.currTotal - previous);
  const consTotal = delta * meter.tu * meter.ti;

  return {
    prevTotal: previous,
    currTotal: input.currTotal,
    unitPrice,
    isReset,
    consTotal,
    costTotal: consTotal * unitPrice,
  };
}
