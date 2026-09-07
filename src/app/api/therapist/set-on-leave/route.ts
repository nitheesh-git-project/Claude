import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { parseLeaveDates, updateTherapistLeave } from "@/lib/leaveRequest";

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

  const result = await updateTherapistLeave(admin, {
    therapistId: user.id,
    onLeave: body.onLeave,
    dates,
  });
  if (result && "error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, onLeave: body.onLeave });
}
