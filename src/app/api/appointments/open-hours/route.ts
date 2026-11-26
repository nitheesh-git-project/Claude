import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { readOpenSlotStarts } from "@/lib/openHoursServer";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";

// Which session start times at least one therapist can take, so the booking
// pickers offer only those (src/lib/openHours.ts says why).
//
// Public: a visitor picks a time before they have an account. It names no
// therapist and no patient -- only instants that are open -- so it says
// nothing a closed hour on a calendar would not.
//
// GET ?from=YYYY-MM-DD&days=1..120&categoryId=<uuid>
// 200 { checked: true, open: number[] }   epoch ms, ascending
// 200 { checked: false }                  the roster could not be read; offer every hour
// 400, 429
export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(request, "openHours");
  if (limited) return limited;

  const params = request.nextUrl.searchParams;
  const from = params.get("from") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return NextResponse.json({ error: "Pass from as YYYY-MM-DD." }, { status: 400 });
  }
  const daysRaw = Number(params.get("days") ?? "62");
  const days = Number.isInteger(daysRaw) && daysRaw >= 1 && daysRaw <= 120 ? daysRaw : 62;
  const categoryId = params.get("categoryId");

  const admin = createAdminClient();
  // The service's session length, read alongside the roster rather than
  // before it: the picker waits on this answer, so the reads overlap.
  const durationMinutes: Promise<number> =
    categoryId && /^[0-9a-f-]{36}$/i.test(categoryId)
      ? Promise.resolve(
          admin.from("treatment_categories").select("duration_minutes").eq("id", categoryId).maybeSingle()
        ).then(
          ({ data }) => (data as { duration_minutes?: number | null } | null)?.duration_minutes ?? BASE_DURATION_MINUTES,
          () => BASE_DURATION_MINUTES
        )
      : Promise.resolve(BASE_DURATION_MINUTES);

  const open = await readOpenSlotStarts(admin, { fromDateKey: from, days, durationMinutes, nowMs: Date.now() });
  if (open === null) return NextResponse.json({ checked: false });
  return NextResponse.json({ checked: true, open });
}
