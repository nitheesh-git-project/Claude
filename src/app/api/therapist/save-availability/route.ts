import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import {
  SCHEDULE_CONFLICT_MESSAGE,
  parseExpectedVersion,
  parseWeeklyScheduleBody,
} from "@/lib/availabilityRequest";
import { saveWeeklySchedule } from "@/lib/saveWeeklySchedule";
import {
  describeProfileStanding,
  getProfileStanding,
} from "@/lib/supabase/requireActiveProfile";
import { serverError } from "@/lib/apiError";

/**
 * A therapist replaces their own weekly working hours.
 *
 * The body is working periods per day, not individual hour cells -- the
 * editor thinks in ranges and the table still thinks in slots, and
 * parseWeeklyScheduleBody is the one place that translation happens for
 * both this route and the admin's.
 *
 * `expectedVersion` is the version the editor loaded with. Sending it is
 * what stops a therapist's save from silently overwriting an admin's edit
 * made while their tab sat open. Sending null (or nothing) claims "this
 * therapist has never saved a schedule", and the database holds it to that:
 * if a schedule-state row already exists the save is refused as a conflict
 * (or is a no-op when it asks for exactly what is stored). Before, null
 * wrote straight through -- so a screen whose read had failed, drawing an
 * empty week, could replace the real roster with it in one Save.
 */
export async function POST(request: NextRequest) {

  // Who is asking, before anything the caller sent is looked at. An
  // anonymous request is refused here rather than after body validation,
  // so an unauthenticated caller never drives this route's parsing and is
  // never told what shape the request should have been.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { data: body, error: parseError } = await parseJsonBody<{
    days?: unknown;
    expectedVersion?: unknown;
  }>(request);
  if (parseError) return parseError;

  const parsed = parseWeeklyScheduleBody(body.days);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const version = parseExpectedVersion(body.expectedVersion);
  if ("error" in version) {
    return NextResponse.json({ error: version.error }, { status: 400 });
  }


  const admin = createAdminClient();
  // Role + active + **approved**. The approval half was missing, and the
  // roster is precisely where that matters: a therapist whose application
  // has not been approved could publish a working week and book leave, and
  // the roster is the clinic's planning record of who can be offered a
  // session -- so an account no admin has vetted was shaping who gets
  // offered patients. `approved` is a lifecycle fact about the account,
  // which is why it now goes through the shared helper rather than a fourth
  // hand-written copy of this block.
  const standing = await getProfileStanding(user.id, "therapist");
  if (!standing.ok) {
    const { status, error } = describeProfileStanding(standing.reason);
    return NextResponse.json({ error }, { status });
  }

  // Scoped to this therapist's own id only, never a client-supplied one --
  // the request body has no therapist field at all, so there is nothing to
  // forge.
  const result = await saveWeeklySchedule(admin, {
    therapistId: user.id,
    slots: parsed.slots,
    expectedVersion: version.version,
    actorId: user.id,
  });

  if (result.status === "error") {
    return serverError("therapist/save-availability", result);
  }
  if (result.status === "conflict") {
    return NextResponse.json(
      { error: SCHEDULE_CONFLICT_MESSAGE, version: result.version },
      { status: 409 }
    );
  }

  return NextResponse.json({
    success: true,
    count: parsed.slots.length,
    version: result.version,
  });
}
