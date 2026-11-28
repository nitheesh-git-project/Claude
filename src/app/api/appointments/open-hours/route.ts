import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { readOpenSlotStarts, readTravelBufferMinutes } from "@/lib/openHoursServer";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";

// Which session start times at least one therapist can take, so the booking
// pickers offer only those (src/lib/openHours.ts says why).
//
// Public: a visitor picks a time before they have an account. It names no
// therapist and no patient -- only instants that are open -- so it says
// nothing a closed hour on a calendar would not.
//
// GET ?from=YYYY-MM-DD&days=1..120&categoryId=<uuid>
//     [&therapistId=<uuid>|me]   only that therapist's hours, "me" for the caller (signed in only)
//     [&exclude=<uuid>]          a session being moved does not block itself (signed in only)
//     [&visitMode=home_visit]    pad other visits by the clinic's travel buffer
//     [&tz=<IANA zone>]          answer on that zone's whole hours -- the picker's own clock.
//                                Absent: the clinic's hours (the admin pickers' grid).
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
  const UUID = /^[0-9a-f-]{36}$/i;
  let therapistId = params.get("therapistId");
  const exclude = params.get("exclude");
  if ((therapistId && therapistId !== "me" && !UUID.test(therapistId)) || (exclude && !UUID.test(exclude))) {
    return NextResponse.json({ error: "therapistId and exclude must be ids." }, { status: 400 });
  }
  // One therapist's free hours, or the roster around one session, are not
  // the clinic-wide answer a visitor gets: they need someone signed in.
  if (therapistId || exclude) {
    const { data } = await (await createClient()).auth.getUser();
    if (!data.user) return NextResponse.json({ error: "Sign in to see one therapist's hours." }, { status: 401 });
    // A therapist suggesting a session asks about their own hours.
    if (therapistId === "me") therapistId = data.user.id;
  }
  const homeVisit = params.get("visitMode") === "home_visit";
  // The picker's own clock. A zone Intl does not know is ignored rather than
  // refused: the clinic grid is a safe answer, a 400 would grey the picker.
  const tzRaw = params.get("tz");
  const gridTimeZone = tzRaw && tzRaw.length <= 64 && isKnownTimeZone(tzRaw) ? tzRaw : null;

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

  // The travel buffer is the clinic's setting; unreadable, the default.
  const bufferMinutes = homeVisit ? await readTravelBufferMinutes(admin) : 0;

  const open = await readOpenSlotStarts(admin, {
    fromDateKey: from,
    days,
    durationMinutes,
    nowMs: Date.now(),
    ...(therapistId ? { therapistIds: [therapistId] } : {}),
    ...(exclude ? { excludeAppointmentId: exclude } : {}),
    bufferMinutes,
    gridTimeZone,
  });
  if (open === null) return NextResponse.json({ checked: false });
  return NextResponse.json({ checked: true, open });
}

function isKnownTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
