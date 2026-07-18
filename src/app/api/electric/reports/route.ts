import { NextRequest, NextResponse } from "next/server";
import { toRecordDate } from "@/lib/energy-record";
import { prisma } from "@/lib/prisma";

/**
 * BÁO CÁO ĐIỆN NĂNG — 2 LỚP DỮ LIỆU, TUYỆT ĐỐI KHÔNG CỘNG VÀO NHAU
 *
 * Lớp 1 — HÓA ĐƠN EVN (đồng hồ Trung thế, type = 2):
 *   Công tơ tổng đầu nguồn của điện lực, gắn thẳng vào Factory. Nó đo TRÙM lên toàn bộ
 *   đồng hồ hạ thế của cùng nhà máy. Có đủ 3 chỉ số TOU (Bình thường/Cao điểm/Thấp điểm)
 *   nên `costTotal` tính đúng 3 giá => ĐÂY LÀ SỐ TIỀN THẬT PHẢI TRẢ.
 *
 * Lớp 2 — PHÂN BỔ NỘI BỘ (đồng hồ Hạ thế, type = 1):
 *   Đo từng nhánh phụ tải bên trong nhà máy. Số kWh đáng tin, nhưng `costTotal` thì KHÔNG:
 *     - LV nhập tay (chốt 1 lần/ngày lúc 06:00): không đủ dữ liệu để tách khung giờ
 *       -> toàn bộ sản lượng bị dồn vào giá Bình thường -> SAI.
 *     - LV AUTO (telemetry 1 lần/giờ): tách được 3 khung, nhưng chỉ là NỘI SUY tuyến tính
 *       theo số phút giao với biểu khung giờ -> gần đúng, vẫn không khớp EVN.
 *
 * => Chi phí của từng đồng hồ hạ thế được PHÂN BỔ NGƯỢC từ hóa đơn MV theo tỷ trọng kWh:
 *
 *      rate(nhà máy)          = Σ costTotal(MV) / Σ consTotal(LV)      [VNĐ/kWh]
 *      costAllocated(record)  = consTotal(record) × rate(nhà máy)
 *
 *    Nhờ vậy tổng chi phí phân bổ LUÔN khớp hóa đơn EVN, và không phụ thuộc việc đồng hồ
 *    hạ thế đã lắp AUTO hay chưa. Khi LV lên AUTO hết, tỷ trọng chỉ chính xác hơn.
 *    Cột `costTotal` gốc trong PowerRecord vẫn giữ nguyên (trả về dưới tên `costRaw`
 *    để đối chiếu, KHÔNG dùng để cộng tổng).
 *
 * Chênh lệch  consMV − Σ consLV  = TỔN THẤT + phụ tải chưa gắn đồng hồ.
 * Nếu ÂM (Σ LV > MV) => dữ liệu bất thường (sai TU/TI, hoặc MV nhập thiếu ngày) -> cảnh báo.
 *
 * TƯƠNG THÍCH NGƯỢC: các field cũ (`totalConsumption`, `totalCost`, `byDate.consTotal`...)
 * vẫn còn nhưng nay mang nghĩa "số liệu hóa đơn EVN" thay vì tổng gộp MV+LV như trước.
 */

const MV_TYPE = 2; // Trung thế — công tơ EVN
const NO_FACTORY = "__none__";
const collator = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });

function dateKey(date: Date, groupBy: string) {
  const iso = date.toISOString().slice(0, 10);
  return groupBy === "month" ? iso.slice(0, 7) : iso;
}

function toUnitId(value: string | null) {
  const id = Number(value || 0);
  return id || null;
}

function compareFactoryName(
  a: { factoryName: string; factoryCode?: string },
  b: { factoryName: string; factoryCode?: string },
) {
  return (
    collator.compare(a.factoryName, b.factoryName) ||
    collator.compare(a.factoryCode || "", b.factoryCode || "")
  );
}

function compareMvMeter(
  a: { factoryName: string; meterName: string; meterCode: string },
  b: { factoryName: string; meterName: string; meterCode: string },
) {
  return (
    collator.compare(a.factoryName, b.factoryName) ||
    collator.compare(a.meterName, b.meterName) ||
    collator.compare(a.meterCode, b.meterCode)
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate") || searchParams.get("from");
  const endDate = searchParams.get("endDate") || searchParams.get("to");
  const groupBy = searchParams.get("groupBy") === "month" ? "month" : "day";
  const factoryId = searchParams.get("factoryId");
  const transformerId =
    searchParams.get("substationId") || searchParams.get("transformerId");
  const transformerUnitId = toUnitId(searchParams.get("transformerUnitId"));
  const meterGroupId =
    searchParams.get("meterGroupId") || searchParams.get("groupId");

  // FIX QUAN TRỌNG: đồng hồ Trung thế gắn thẳng `factoryId` trên PowerMeter và có
  // `transformerId = null`. Bộ lọc cũ `transformer: { factoryId }` loại sạch MV ra khỏi
  // kết quả -> mất luôn hóa đơn EVN mỗi khi người dùng chọn 1 nhà máy. Phải dò cả 3 đường.
  const meterWhere = {
    transformerUnitId: transformerUnitId || undefined,
    transformerId: transformerId || undefined,
    groupId: meterGroupId || undefined,
    ...(factoryId
      ? {
          OR: [
            { factoryId },
            { transformer: { factoryId } },
            { transformerUnit: { transformer: { factoryId } } },
          ],
        }
      : {}),
  };

  const meterInclude = {
    group: true,
    factory: true,
    transformer: { include: { factory: true } },
    transformerUnit: { include: { transformer: { include: { factory: true } } } },
  };

  const rows = await prisma.powerRecord.findMany({
    where: {
      recordDate:
        startDate || endDate
          ? {
              gte: startDate ? toRecordDate(startDate) : undefined,
              lte: endDate ? toRecordDate(endDate) : undefined,
            }
          : undefined,
      meter: meterWhere,
    },
    include: { meter: { include: meterInclude } },
    orderBy: [{ recordDate: "asc" }, { meter: { code: "asc" } }],
  });

  type Row = (typeof rows)[number];

  // Đồng hồ Hạ thế treo dưới PowerTransformer / PowerTransformerUnit, đồng hồ Trung thế
  // treo thẳng vào Factory. Phải dò đủ 3 đường mới ra được nhà máy của đồng hồ.
  const resolveFactory = (row: Row) =>
    row.meter.factory ||
    row.meter.transformer?.factory ||
    row.meter.transformerUnit?.transformer?.factory ||
    null;

  const factoryKeyOf = (row: Row) => resolveFactory(row)?.id || NO_FACTORY;

  const mvRows = rows.filter((row) => row.meter.type === MV_TYPE);
  const lvRows = rows.filter((row) => row.meter.type !== MV_TYPE);

  // --- Bước 1: gom hóa đơn EVN theo nhà máy ---------------------------------------------
  type MvBucket = {
    cons: number;
    cost: number;
    normal: number;
    peak: number;
    offPeak: number;
  };
  const mvByFactory = new Map<string, MvBucket>();
  for (const row of mvRows) {
    const key = factoryKeyOf(row);
    const bucket =
      mvByFactory.get(key) || { cons: 0, cost: 0, normal: 0, peak: 0, offPeak: 0 };
    bucket.cons += row.consTotal;
    bucket.cost += row.costTotal;
    bucket.normal += row.consNormal ?? 0;
    bucket.peak += row.consPeak ?? 0;
    bucket.offPeak += row.consOffPeak ?? 0;
    mvByFactory.set(key, bucket);
  }

  // --- Bước 2: tổng kWh nội bộ theo nhà máy -> đơn giá phân bổ ---------------------------
  const lvConsByFactory = new Map<string, number>();
  for (const row of lvRows) {
    const key = factoryKeyOf(row);
    lvConsByFactory.set(key, (lvConsByFactory.get(key) || 0) + row.consTotal);
  }

  // rate = tiền thật của EVN / tổng kWh nội bộ (VNĐ/kWh). Đây là "đơn giá bình quân thực tế"
  // của nhà máy, đã bao gồm sẵn ảnh hưởng của 3 khung giá.
  const rateByFactory = new Map<string, number>();
  for (const [key, lvCons] of lvConsByFactory) {
    const mv = mvByFactory.get(key);
    rateByFactory.set(key, mv && lvCons > 0 ? mv.cost / lvCons : 0);
  }

  const allocatedCost = (row: Row) =>
    row.consTotal * (rateByFactory.get(factoryKeyOf(row)) || 0);

  // --- Bước 3: tổng hợp theo các chiều ---------------------------------------------------
  const byDateMap = new Map<
    string,
    {
      date: string;
      consTotal: number; // = billed (EVN) — giữ tên cũ cho biểu đồ xu hướng
      costTotal: number; // = billed (EVN)
      internalCons: number; // tổng hạ thế
    }
  >();

  const touchDate = (row: Row) => {
    const key = dateKey(row.recordDate, groupBy);
    const bucket =
      byDateMap.get(key) || { date: key, consTotal: 0, costTotal: 0, internalCons: 0 };
    byDateMap.set(key, bucket);
    return bucket;
  };

  for (const row of mvRows) {
    const bucket = touchDate(row);
    bucket.consTotal += row.consTotal;
    bucket.costTotal += row.costTotal;
  }
  for (const row of lvRows) {
    touchDate(row).internalCons += row.consTotal;
  }

  // byMeter: CHỈ đồng hồ hạ thế. `costTotal` ở đây là chi phí ĐÃ PHÂN BỔ từ hóa đơn EVN,
  // `costRaw` là con số cũ do đồng hồ tự tính (giữ lại để đối chiếu, không dùng cộng tổng).
  const byMeterMap = new Map<
    string,
    {
      meterId: string;
      meterCode: string;
      meterName: string;
      meterType: number;
      isAuto: boolean;
      isNonProduction: boolean;
      factoryId: string | null;
      factoryName: string;
      groupName: string;
      substationName: string;
      transformerUnitName: string;
      consTotal: number;
      costTotal: number;
      costRaw: number;
    }
  >();

  const byGroupMap = new Map<
    string,
    {
      groupId: string | null;
      groupCode: string;
      groupName: string;
      consTotal: number;
      costTotal: number;
    }
  >();

  for (const row of lvRows) {
    const factory = resolveFactory(row);
    const cost = allocatedCost(row);

    const meterBucket =
      byMeterMap.get(row.meterId) || {
        meterId: row.meterId,
        meterCode: row.meter.code,
        meterName: row.meter.name,
        meterType: row.meter.type,
        isAuto: row.meter.isAuto,
        isNonProduction: row.meter.isNonProduction,
        factoryId: factory?.id || null,
        factoryName: factory?.name || "Chưa gắn nhà máy",
        groupName: row.meter.group?.name || "Chưa phân nhóm",
        substationName: row.meter.transformer?.name || "Chưa gắn trạm",
        transformerUnitName: row.meter.transformerUnit?.name || "Chưa gắn máy biến áp",
        consTotal: 0,
        costTotal: 0,
        costRaw: 0,
      };
    meterBucket.consTotal += row.consTotal;
    meterBucket.costTotal += cost;
    meterBucket.costRaw += row.costTotal;
    byMeterMap.set(row.meterId, meterBucket);

    const groupKey = row.meter.groupId || "none";
    const groupBucket =
      byGroupMap.get(groupKey) || {
        groupId: row.meter.groupId,
        groupCode: row.meter.group?.code || "NONE",
        groupName: row.meter.group?.name || "Chưa phân nhóm",
        consTotal: 0,
        costTotal: 0,
      };
    groupBucket.consTotal += row.consTotal;
    groupBucket.costTotal += cost;
    byGroupMap.set(groupKey, groupBucket);
  }

  // byMvMeter: danh sách công tơ EVN + số tiền thật của từng cái.
  const byMvMeterMap = new Map<
    string,
    {
      meterId: string;
      meterCode: string;
      meterName: string;
      factoryName: string;
      consTotal: number;
      consNormal: number;
      consPeak: number;
      consOffPeak: number;
      costTotal: number;
    }
  >();
  for (const row of mvRows) {
    const factory = resolveFactory(row);
    const bucket =
      byMvMeterMap.get(row.meterId) || {
        meterId: row.meterId,
        meterCode: row.meter.code,
        meterName: row.meter.name,
        factoryName: factory?.name || "Chưa gắn nhà máy",
        consTotal: 0,
        consNormal: 0,
        consPeak: 0,
        consOffPeak: 0,
        costTotal: 0,
      };
    bucket.consTotal += row.consTotal;
    bucket.consNormal += row.consNormal ?? 0;
    bucket.consPeak += row.consPeak ?? 0;
    bucket.consOffPeak += row.consOffPeak ?? 0;
    bucket.costTotal += row.costTotal;
    byMvMeterMap.set(row.meterId, bucket);
  }

  // byFactory: đối chiếu hóa đơn EVN vs tổng nội bộ vs tổn thất.
  const factoryNames = new Map<string, { code: string; name: string }>();
  for (const row of rows) {
    const factory = resolveFactory(row);
    factoryNames.set(factoryKeyOf(row), {
      code: factory?.code || "NONE",
      name: factory?.name || "Chưa gắn nhà máy",
    });
  }

  const warnings: string[] = [];
  const byFactory = Array.from(factoryNames.entries()).map(([key, info]) => {
    const mv = mvByFactory.get(key);
    const internalCons = lvConsByFactory.get(key) || 0;
    const billedCons = mv?.cons || 0;
    const billedCost = mv?.cost || 0;
    // Tổn thất ÂM được giữ nguyên (không kẹp về 0) để lộ ngay dữ liệu bất thường.
    const lossCons = billedCons - internalCons;
    const lossPercent = billedCons > 0 ? (lossCons / billedCons) * 100 : 0;
    const hasMv = Boolean(mv);

    if (!hasMv && internalCons > 0) {
      warnings.push(
        `${info.name}: chưa có số công tơ trung thế trong kỳ — không phân bổ được chi phí cho ${internalCons.toFixed(0)} kWh hạ thế.`,
      );
    }
    if (hasMv && lossCons < 0) {
      warnings.push(
        `${info.name}: tổng hạ thế (${internalCons.toFixed(0)} kWh) VƯỢT công tơ EVN (${billedCons.toFixed(0)} kWh) ${Math.abs(lossPercent).toFixed(1)}% — kiểm tra hệ số TU/TI hoặc số trung thế nhập thiếu ngày.`,
      );
    }

    return {
      factoryId: key === NO_FACTORY ? null : key,
      factoryCode: info.code,
      factoryName: info.name,
      hasMv,
      // Giữ tên cũ consTotal/costTotal = số liệu hóa đơn EVN.
      consTotal: billedCons,
      costTotal: billedCost,
      billedCons,
      billedCost,
      internalCons,
      lossCons,
      lossPercent,
      avgUnitPrice: rateByFactory.get(key) || 0,
    };
  });

  // --- Bước 4: summary -------------------------------------------------------------------
  const billedConsumption = mvRows.reduce((sum, row) => sum + row.consTotal, 0);
  const billedCost = mvRows.reduce((sum, row) => sum + row.costTotal, 0);
  const internalConsumption = lvRows.reduce((sum, row) => sum + row.consTotal, 0);

  // Tach chi phi phan bo thanh 2 nhom: San xuat vs Ngoai san xuat (van phong, bom chua chay...).
  // LUU Y QUAN TRONG: viec tach nay CHI de gom nhom hien thi. Ca 2 nhom VAN nam trong mau so
  // rate (allocatedCost tinh tren TOAN BO lvRows), vi dien cua ho thuc su nam trong cong to EVN
  // cua nha may. Neu loai nhom ngoai SX khoi mau so, don gia rate se bi thoi phong va cac dong ho
  // san xuat se ganh oan phan tien cua van phong/chua chay. Tong 2 nhom LUON = hoa don EVN.
  let productionCost = 0;
  let productionCons = 0;
  let nonProductionCost = 0;
  let nonProductionCons = 0;
  for (const row of lvRows) {
    const cost = allocatedCost(row);
    if (row.meter.isNonProduction) {
      nonProductionCost += cost;
      nonProductionCons += row.consTotal;
    } else {
      productionCost += cost;
      productionCons += row.consTotal;
    }
  }

  // 3 khung giờ lấy TRỰC TIẾP từ công tơ EVN — không còn fallback `consNormal ?? consTotal`
  // (fallback cũ dồn hết sản lượng chưa tách khung vào Bình thường, thổi phồng tỷ trọng).
  const totalNormal = mvRows.reduce((sum, row) => sum + (row.consNormal ?? 0), 0);
  const totalPeak = mvRows.reduce((sum, row) => sum + (row.consPeak ?? 0), 0);
  const totalOffPeak = mvRows.reduce((sum, row) => sum + (row.consOffPeak ?? 0), 0);

  const lossConsumption = billedConsumption - internalConsumption;
  const lossPercent =
    billedConsumption > 0 ? (lossConsumption / billedConsumption) * 100 : 0;

  // Số ngày có dữ liệu = số ngày công tơ EVN đã chốt (đây là cơ sở của mọi con số tiền).
  const billedDays = new Set(
    mvRows.map((row) => row.recordDate.toISOString().slice(0, 10)),
  ).size;

  let prevPeriodConsumption = 0;
  let trendPercent: number | null = null;
  if (startDate && endDate) {
    const start = toRecordDate(startDate);
    const end = toRecordDate(endDate);
    const spanMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const prevStart = new Date(prevEnd.getTime() - spanMs);

    // So sánh xu hướng trên sản lượng EVN (không trộn nội bộ vào, tránh đếm trùng).
    const prevRows = await prisma.powerRecord.findMany({
      where: {
        recordDate: { gte: prevStart, lte: prevEnd },
        meter: { ...meterWhere, type: MV_TYPE },
      },
      select: { consTotal: true },
    });

    prevPeriodConsumption = prevRows.reduce((sum, row) => sum + row.consTotal, 0);
    trendPercent =
      prevPeriodConsumption > 0
        ? ((billedConsumption - prevPeriodConsumption) / prevPeriodConsumption) * 100
        : null;
  }

  return NextResponse.json({
    summary: {
      // --- Hóa đơn EVN (SỐ TIỀN THẬT) ---
      billedConsumption,
      billedCost,
      totalConsumption: billedConsumption, // alias tương thích ngược
      totalCost: billedCost, // alias tương thích ngược
      totalNormal,
      totalPeak,
      totalOffPeak,
      // --- Nội bộ & tổn thất ---
      internalConsumption,
      // Chi phi phan bo tach 2 nhom (tong 2 nhom = tong chi phi phan bo, va ~ billedCost):
      productionCost,
      productionCons,
      nonProductionCost,
      nonProductionCons,
      lossConsumption,
      lossPercent,
      hasNegativeLoss: lossConsumption < 0,
      avgUnitPrice: internalConsumption > 0 ? billedCost / internalConsumption : 0,
      // --- Chung ---
      avgPerDay: billedDays ? billedConsumption / billedDays : 0,
      daysWithData: billedDays,
      mvMeterCount: byMvMeterMap.size,
      lvMeterCount: byMeterMap.size,
      prevPeriodConsumption,
      trendPercent,
      warnings,
    },
    byDate: Array.from(byDateMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
    byMeter: Array.from(byMeterMap.values()).sort((a, b) => b.consTotal - a.consTotal),
    byMvMeter: Array.from(byMvMeterMap.values()).sort(compareMvMeter),
    byGroup: Array.from(byGroupMap.values()).sort((a, b) => b.consTotal - a.consTotal),
    byFactory: byFactory.sort(compareFactoryName),
  });
}
