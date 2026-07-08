import { NextRequest, NextResponse } from "next/server";

/**
 * Xac thuc request tu collector (may van phong / mini PC) bang API key.
 *
 * Collector gui header `x-api-key`; server so voi bien moi truong `ENERGY_API_KEY`.
 * Day la kenh may-toi-may (khong dung session NextAuth) nen tach rieng khoi `@/lib/permissions`.
 *
 * Tra ve `{ ok: true }` khi hop le, hoac `{ ok: false, response }` de route tra ve luon.
 */
export function requireCollectorKey(
  request: NextRequest,
): { ok: true } | { ok: false; response: NextResponse } {
  const expected = process.env.ENERGY_API_KEY || "";

  if (!expected) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Server chua cau hinh ENERGY_API_KEY" },
        { status: 500 },
      ),
    };
  }

  const provided = request.headers.get("x-api-key") || "";
  if (provided !== expected) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true };
}
