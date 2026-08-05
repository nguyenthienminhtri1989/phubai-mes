import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { requireAdmin } from "@/lib/permissions";

// Route dùng child_process + fs => bắt buộc Node runtime, không cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Đường dẫn tới pg_dump: ưu tiên PG_BIN_DIR (dev Windows), fallback PATH hệ thống (VPS). */
function resolvePgDump() {
  const bin = process.platform === "win32" ? "pg_dump.exe" : "pg_dump";
  const dir = process.env.PG_BIN_DIR?.trim();
  return dir ? join(dir, bin) : bin;
}

/** Tách DATABASE_URL thành các tham số kết nối cho pg_dump. */
function parseDbUrl(raw: string) {
  const u = new URL(raw);
  return {
    host: u.hostname,
    port: u.port || "5432",
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    // bỏ dấu "/" đầu; cắt query (?schema=... của Prisma) nếu có
    database: decodeURIComponent(u.pathname.replace(/^\//, "").split("?")[0]),
  };
}

/** Nhãn thời gian VN cho tên file: phubai-mes_2026-08-05_14-30-05.dump */
function vnStamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${g("year")}-${g("month")}-${g("day")}_${g("hour")}-${g("minute")}-${g("second")}`;
}

export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    return NextResponse.json({ error: "Thiếu DATABASE_URL trên server" }, { status: 500 });
  }

  let db: ReturnType<typeof parseDbUrl>;
  try {
    db = parseDbUrl(rawUrl);
  } catch {
    return NextResponse.json({ error: "DATABASE_URL không hợp lệ" }, { status: 500 });
  }

  const filename = `phubai-mes_${vnStamp()}.dump`;
  const tmpFile = join(tmpdir(), filename);
  const pgDump = resolvePgDump();

  // Định dạng custom (-Fc): nén sẵn, phục hồi được bằng pg_restore.
  const args = [
    "-h", db.host,
    "-p", db.port,
    "-U", db.user,
    "-d", db.database,
    "-Fc",
    "--no-owner",
    "--no-privileges",
    "-f", tmpFile,
  ];

  // Chạy pg_dump, chờ hoàn tất, gom stderr để báo lỗi rõ ràng.
  const dumpResult = await new Promise<{ code: number | null; stderr: string; spawnError?: string }>(
    (resolve) => {
      const child = spawn(pgDump, args, {
        env: { ...process.env, PGPASSWORD: db.password },
      });
      let stderr = "";
      child.stderr.on("data", (d) => { stderr += d.toString(); });
      child.on("error", (err) => resolve({ code: null, stderr, spawnError: err.message }));
      child.on("close", (code) => resolve({ code, stderr }));
    },
  );

  // Không gọi được pg_dump (chưa cài / sai PG_BIN_DIR).
  if (dumpResult.spawnError) {
    await unlink(tmpFile).catch(() => {});
    return NextResponse.json(
      {
        error: "Không chạy được pg_dump. Kiểm tra đã cài postgresql-client và cấu hình PG_BIN_DIR.",
        detail: dumpResult.spawnError,
      },
      { status: 500 },
    );
  }

  // pg_dump chạy nhưng lỗi (sai mật khẩu, lệch version client/server, DB không tồn tại...).
  if (dumpResult.code !== 0) {
    await unlink(tmpFile).catch(() => {});
    return NextResponse.json(
      { error: "pg_dump thất bại", detail: dumpResult.stderr.slice(-2000) },
      { status: 500 },
    );
  }

  // Đọc kích thước để set Content-Length (trình duyệt hiện tiến độ tải).
  let size: number;
  try {
    size = (await stat(tmpFile)).size;
  } catch {
    return NextResponse.json({ error: "Không đọc được file backup vừa tạo" }, { status: 500 });
  }

  // Stream file về trình duyệt; xoá file tạm khi truyền xong hoặc client hủy.
  const nodeStream = createReadStream(tmpFile);
  nodeStream.on("close", () => { void unlink(tmpFile).catch(() => {}); });
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(size),
      "Cache-Control": "no-store",
    },
  });
}
