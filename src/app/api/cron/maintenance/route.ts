import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { runMaintenanceSweep } from "@/lib/maintenanceSweep";

// The scheduled half of the housekeeping (see src/lib/maintenanceSweep.ts),
// called by .github/workflows/maintenance.yml. Authenticated by a shared
// secret in `CRON_SECRET`, sent as a bearer token -- there is no user here.
// Unset, the route refuses with 503 so a missing configuration reads as "not
// set up" rather than as a working schedule. Responses name which steps
// ran and nothing else.
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Maintenance schedule not configured" }, { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const valid =
    header.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  if (!valid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const steps = await runMaintenanceSweep(createAdminClient());
  const failed = Object.values(steps).includes("failed");
  return NextResponse.json({ ok: !failed, steps }, { status: failed ? 500 : 200 });
}
