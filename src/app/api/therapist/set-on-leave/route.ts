import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { parseLeaveDates, updateTherapistLeave } from "@/lib/leaveRequest";
import {
  describeProfileStanding,
  getProfileStanding,
} from "@/lib/supabase/requireActiveProfile";

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
    onLeave?: unknown;
    from?: unknown;
    to?: unknown;
    reason?: unknown;
  }>(request);
  if (parseError) return parseError;

  if (typeof body.onLeave !== "boolean") {
    return NextResponse.json({ error: "Missing onLeave" }, { status: 400 });
  }

  // Same optional dates the admin's route takes, validated by the same
  // helper. The flag is still what makes somebody unavailable; the dates
  // are what let the roster say when they are back.
  const dates = parseLeaveDates({
    onLeave: body.onLeave,
    from: body.from,
    to: body.to,
    reason: body.reason,
  });
  if ("error" in dates) {
    return NextResponse.json({ error: dates.error }, { status: 400 });
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

  const result = await updateTherapistLeave(admin, {
    therapistId: user.id,
    onLeave: body.onLeave,
    dates,
  });
  if (result && "error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    onLeave: body.onLeave,
    // The leave was recorded but the dates and reason could not be (a
    // database without those columns). Said, never swallowed.
    ...(result && "datesNotSaved" in result && result.datesNotSaved
      ? { warning: "Your leave is recorded, but the dates and reason couldn't be saved yet." }
      : {}),
  });
}
