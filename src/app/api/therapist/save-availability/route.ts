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
 * made while their tab sat open; sending nothing is still accepted, and
 * means "I have not read a version, write mine" -- the pre-redesign
 * behaviour, kept so a stale client cannot be locked out of its own
 * schedule.
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
  const { data: profile } = await admin
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "therapist") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (profile.active === false) {
    return NextResponse.json({ error: "Your account has been suspended." }, { status: 403 });
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
    return NextResponse.json({ error: result.message }, { status: 500 });
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
