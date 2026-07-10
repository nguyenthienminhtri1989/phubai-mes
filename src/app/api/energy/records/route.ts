import { NextRequest, NextResponse } from "next/server";
import { PowerDataSource } from "@/generated/prisma/enums";
import { buildPowerRecordValues, toRecordDate } from "@/lib/energy-record";
import { requireEditor } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const meterId = searchParams.get("meterId");

  const data = await prisma.powerRecord.findMany({
    where: {
      meterId: meterId || undefined,
      recordDate:
        from || to
          ? {
              gte: from ? toRecordDate(from) : undefined,
              lte: to ? toRecordDate(to) : undefined,
            }
          : undefined,
    },
    include: {
      meter: {
        include: {
          group: true,
          transformer: true,
        },
      },
    },
    orderBy: [{ recordDate: "desc" }, { meter: { code: "asc" } }],
  });

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "";
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const record = await prisma.powerRecord.findUnique({
    where: { id },
    include: {
      meter: {
        include: {
          factory: true,
          transformer: true,
          transformerUnit: { include: { transformer: true } },
        },
      },
    },
  });
  if (!record) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  // Kiểm tra quyền theo nhà máy (khớp với kiểm tra của POST).
  const sessionUser = guard.session.user as { role?: string; factoryIds?: string[] };
  const meter = record.meter;

  // Bản ghi AUTO (do cron chốt tự động): CHỈ ADMIN được xóa. EDITOR/MANAGER không được
  // vì bản ghi AUTO gắn với telemetry và chuỗi chốt số, xóa nhầm dễ gây sai lệch hàng loạt.
  if (record.dataSource === "AUTO" && sessionUser.role !== "ADMIN") {
    return NextResponse.json(
      {
        error: "AUTO_RECORD_ADMIN_ONLY",
        message: "Bản ghi tự động (AUTO) chỉ ADMIN mới được xóa.",
      },
      { status: 403 },
    );
  }

  const meterFactoryId =
    meter.factoryId ||
    meter.transformer?.factoryId ||
    meter.transformerUnit?.transformer?.factoryId ||
    null;
  const userFactoryIds = Array.isArray(sessionUser.factoryIds) ? sessionUser.factoryIds : [];
  if (sessionUser.role !== "ADMIN" && userFactoryIds.length > 0 && (!meterFactoryId || !userFactoryIds.includes(meterFactoryId))) {
    return NextResponse.json(
      { error: "User is not allowed to modify records for this factory" },
      { status: 403 },
    );
  }

  // Cần thiết: không cho xóa nếu đồng hồ này đã có bản ghi cho ngày SAU (bản ghi này đang
  // làm "kỳ trước" của chuỗi). Xóa sẽ làm vỡ delta downstream.
  const laterRecords = await prisma.powerRecord.findMany({
    where: {
      meterId: record.meterId,
      recordDate: { gt: record.recordDate },
    },
    orderBy: { recordDate: "asc" },
    select: { recordDate: true },
    take: 5,
  });
  if (laterRecords.length > 0) {
    return NextResponse.json(
      {
        error: "BLOCKED_BY_LATER_RECORDS",
        message:
          "Không xóa được: đồng hồ này đã có bản ghi cho ngày sau. Hãy xóa từ ngày mới nhất về cũ.",
        laterDates: laterRecords.map((r) => r.recordDate.toISOString().slice(0, 10)),
      },
      { status: 409 },
    );
  }

  await prisma.powerRecord.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const recordDate = toRecordDate(body.recordDate);
  const meterId = String(body.meterId || "");

  if (!meterId) {
    return NextResponse.json({ error: "Missing meterId" }, { status: 400 });
  }

  const sessionUser = guard.session.user as { role?: string; factoryIds?: string[] };
  const meter = await prisma.powerMeter.findUnique({
    where: { id: meterId },
    include: {
      factory: true,
      transformer: true,
      transformerUnit: {
        include: {
          transformer: true,
        },
      },
    },
  });

  if (!meter) {
    return NextResponse.json({ error: "Meter not found" }, { status: 404 });
  }

  const meterFactoryId = meter.factoryId || meter.transformer?.factoryId || meter.transformerUnit?.transformer?.factoryId || null;
  const userFactoryIds = Array.isArray(sessionUser.factoryIds) ? sessionUser.factoryIds : [];
  if (sessionUser.role !== "ADMIN" && userFactoryIds.length > 0 && (!meterFactoryId || !userFactoryIds.includes(meterFactoryId))) {
    return NextResponse.json(
      { error: "User is not allowed to input readings for this factory" },
      { status: 403 },
    );
  }

  const optionalNumber = (value: unknown) =>
    value === undefined || value === null || value === "" ? undefined : Number(value);

  const values = await buildPowerRecordValues({
    meterId,
    recordDate,
    currTotal: Number(body.currTotal || 0),
    prevTotal: optionalNumber(body.prevTotal),
    currNormal: optionalNumber(body.currNormal),
    currPeak: optionalNumber(body.currPeak),
    currOffPeak: optionalNumber(body.currOffPeak),
    unitPrice: optionalNumber(body.unitPrice),
  });

  const data = await prisma.powerRecord.upsert({
    where: {
      recordDate_meterId: {
        recordDate,
        meterId,
      },
    },
    update: {
      ...values,
      dataSource: PowerDataSource.MANUAL,
      note: body.note || values.note || null,
    },
    create: {
      recordDate,
      meterId,
      ...values,
      dataSource: PowerDataSource.MANUAL,
      note: body.note || values.note || null,
    },
    include: {
      meter: true,
    },
  });

  return NextResponse.json(data);
}
