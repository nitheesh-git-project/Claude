import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isPastDateKey, parseDateExceptionBody, writeDateException } from "@/lib/dateException";
import {
  describeProfileStanding,
  getProfileStanding,
} from "@/lib/supabase/requireActiveProfile";

/**
 * A therapist sets (or clears) one date's exception to their own weekly
 * hours: off all day, working only certain hours, or back to normal.
 *
 * This used to be an admin-only write, and the therapist's screen showed
 * their exceptions read-only. The owner decided therapists manage their own
 * dates the way they already manage their weekly hours and their leave, so
 * this is the therapist's door onto the same write the admin's route makes
 * (src/lib/dateException.ts), with the same parsing and the same locked
 * database function -- and two rules of its own:
 *
 *   - **Only their own schedule.** The body has no therapist field at all;
 *     the id is the signed-in user's, so there is nothing to forge.
 *   - **Only today or later.** A date already behind them is history the
 *     clinic planned against, not a plan. The admin's route keeps the
 *     ability to correct one.
 *
 * Like the weekly schedule, an exception never touches an appointment: the
 * booking wins, and nothing here cancels or moves a session.
 */
export async function POST(request: NextRequest) {
  // Who is asking, before anything the caller sent is looked at.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    date?: unknown;
    mode?: unknown;
    ranges?: unknown;
    note?: unknown;
  }>(request);
  if (parseError) return parseError;

  const parsed = parseDateExceptionBody(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // Role + active + approved, the same gate the weekly schedule and leave
  // routes use: an account no admin has vetted does not shape the roster.
  const standing = await getProfileStanding(user.id, "therapist");
  if (!standing.ok) {
    const { status, error } = describeProfileStanding(standing.reason);
    return NextResponse.json({ error }, { status });
  }

  const admin = createAdminClient();
  // "Today" is the therapist's own, the key their screen lists exceptions
  // from -- a UTC today would refuse a date that is still today for a
  // therapist ahead of UTC, or accept one already gone for one behind it.
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    return NextResponse.json(
      { error: "We couldn't check your timezone just now. Nothing was changed - please try again." },
      { status: 503 }
    );
  }
  const todayKey = new Date().toLocaleDateString("en-CA", {
    timeZone: (profile?.timezone as string | null) || "UTC",
  });
  if (isPastDateKey(parsed.dateKey, todayKey)) {
    return NextResponse.json(
      { error: "That date has already passed. Pick today or a later date." },
      { status: 400 }
    );
  }

  const written = await writeDateException(admin, {
    therapistId: user.id,
    exception: parsed,
    actorId: user.id,
  });
  if (!written.ok) {
    return NextResponse.json({ error: written.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, change: parsed.description });
}
