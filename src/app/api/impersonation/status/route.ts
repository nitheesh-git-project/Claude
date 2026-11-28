import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { IMPERSONATION_COOKIE, isExpired, parseMarker } from "@/lib/impersonation";

// Whether this browser is inside an admin's "view as" swap. The marker cookie
// is httpOnly and the public pages are cached, so a page like /book cannot
// read it on the server; its Exit bar asks here after it loads instead.
// Says nothing but the marker the caller's own cookie already carries.
export async function GET() {
  const jar = await cookies();
  const marker = parseMarker(jar.get(IMPERSONATION_COOKIE)?.value);
  const active = marker && !isExpired(marker, Date.now()) ? marker : null;
  return NextResponse.json({ marker: active }, { headers: { "Cache-Control": "no-store" } });
}
