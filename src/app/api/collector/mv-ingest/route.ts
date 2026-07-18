import { NextRequest, NextResponse } from "next/server";
import { requireCollectorKey } from "@/lib/collector-auth";
import { buildPowerRecordValues, toRecordDate } from "@/lib/energy-record";
import { prisma } from "@/lib/prisma";

// ============================================================
// POST /api/collector/mv-ingest — nhận chỉ số công tơ TRUNG THẾ do
// evn-portal-collector.js lấy tự động từ portal CSKH của EVNCPC.
//
// Body: { readings: [ { meterCode, recordDate: "YYYY-MM-DD",
//                       currNormal, currPeak, currOffPeak, note? } ] }
//
// Quy ước recordDate GIỐNG HỆT trang nhập tay /electric/daily-mv:
// số đọc lúc 06:00 sáng nay được ghi cho recordDate = NGÀY HÔM QUA.
// Collector chịu trách nhiệm gửi đúng ngày; endpoint không tự suy diễn.
//
// Nguyên tắc an toàn: NẾU ĐÃ CÓ BẢN GHI (recordDate, meterId) -> BỎ QUA,
// không ghi đè. Nghĩa là số nhập tay luôn thắng, và chạy lại script
// không bao giờ nhân đôi dữ liệu. Toàn bộ logic baseline/reset/TU×TI/3 giá
// dùng chung buildPowerRecordValues với flow nhập tay — một nguồn sự thật.
// ============================================================

type IncomingMvReading = {
  meterCode?: unknown;
  recordDate?: unknown;
  currNormal?: unknown;
  currPeak?: unknown;
  currOffPeak?: unknown;
  note?: unknown;
  powerFactor?: unknown;
};

type IncomingPowerFactor = {
  date?: unknown;
  readAt?: unknown;
  a?: unknown;
  b?: unknown;
  c?: unknown;
};

const toPf = (value: unknown) => {
  const n = Number(value);
  // cos phi hop le trong khoang (0, 1]. Portal tra 0 khi khong do duoc -> coi nhu khong co.
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : null;
};

/**
 * Ghi cos phi vao PowerFactorLog. GOI DOC LAP voi logic tao PowerRecord:
 * PowerRecord bi BO QUA khi da ton tai (de nhap tay luon thang), nhung cos phi thi
 * VAN PHAI ghi — neu khong, ngay nao nguoi van hanh nhap tay truoc se mat cos phi.
 * Dung upsert nen chay lai script bao nhieu lan cung khong nhan doi.
 */
async function savePowerFactor(meterId: string, raw: unknown) {
  const pf = (raw || {}) as IncomingPowerFactor;
  const dateStr = typeof pf.date === "string" ? pf.date : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;

  const pfA = toPf(pf.a);
  const pfB = toPf(pf.b);
  const pfC = toPf(pf.c);
  if (pfA == null && pfB == null && pfC == null) return; // khong co so nao dung -> bo qua

  const readAt =
    typeof pf.readAt === "string" && !Number.isNaN(Date.parse(pf.readAt))
      ? new Date(pf.readAt)
      : null;

  const recordDate = toRecordDate(dateStr);
  const data = { readAt, pfA, pfB, pfC };

  await prisma.powerFactorLog.upsert({
    where: { recordDate_meterId: { recordDate, meterId } },
    create: { meterId, recordDate, ...data },
    update: data,
  });
}

export async function POST(request: NextRequest) {
  const guard = requireCollectorKey(request);
  if (!guard.ok) return guard.response;

  let body: { readings?: IncomingMvReading[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body khong phai JSON hop le" }, { status: 400 });
  }

  const rawReadings = Array.isArray(body?.readings) ? body.readings : [];
  const results: Array<{ meterCode: string; recordDate: string; status: string }> = [];

  for (const raw of rawReadings) {
    const meterCode = typeof raw.meterCode === "string" ? raw.meterCode.trim() : "";
    const recordDateStr = typeof raw.recordDate === "string" ? raw.recordDate : "";
    const currNormal = Number(raw.currNormal);
    const currPeak = Number(raw.currPeak);
    const currOffPeak = Number(raw.currOffPeak);

    const push = (status: string) =>
      results.push({ meterCode: meterCode || "?", recordDate: recordDateStr || "?", status });

    if (
      !meterCode ||
      !/^\d{4}-\d{2}-\d{2}$/.test(recordDateStr) ||
      !Number.isFinite(currNormal) ||
      !Number.isFinite(currPeak) ||
      !Number.isFinite(currOffPeak)
    ) {
      push("invalid");
      continue;
    }

    const meter = await prisma.powerMeter.findUnique({ where: { code: meterCode } });
    if (!meter || meter.type !== 2 || !meter.isActive) {
      push(meter ? "not-mv-or-inactive" : "meter-not-found");
      continue;
    }

    const recordDate = toRecordDate(recordDateStr);

    // Ghi cos phi TRUOC va DOC LAP voi phan PowerRecord ben duoi, vi PowerRecord co the
    // bi bo qua (exists-skipped) nhung cos phi thi luon can duoc cap nhat.
    try {
      await savePowerFactor(meter.id, raw.powerFactor);
    } catch (err) {
      console.error(`[mv-ingest] Loi ghi cos phi cho ${meterCode}:`, err);
      // Khong chan luong chinh: cos phi chi la du lieu theo doi, khong duoc lam hong viec chot so.
    }

    const existing = await prisma.powerRecord.findUnique({
      where: { recordDate_meterId: { recordDate, meterId: meter.id } },
    });
    if (existing) {
      push("exists-skipped");
      continue;
    }

    const values = await buildPowerRecordValues({
      meterId: meter.id,
      recordDate,
      currNormal,
      currPeak,
      currOffPeak,
    });

    const extraNote = typeof raw.note === "string" && raw.note.trim() ? ` | ${raw.note.trim()}` : "";
    await prisma.powerRecord.create({
      data: {
        ...values,
        meterId: meter.id,
        recordDate,
        dataSource: "AUTO",
        createdBy: "evn-collector",
        note: `${values.note ? values.note + " | " : ""}Tự động lấy từ EVN CSKH${extraNote}`,
      },
    });

    push(values.isReset ? "created-reset-warning" : values.note ? "created-baseline" : "created");
  }

  return NextResponse.json({ results });
}
