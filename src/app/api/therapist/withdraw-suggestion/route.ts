import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";

// A therapist taking back a suggestion the patient hasn't answered yet.
//
// Needed because at most one suggestion per programme can be pending at a
// time: without a way to withdraw, a therapist who suggested the wrong time
// would be stuck until the patient happened to decline it.
//
// Only a pending one can be withdrawn. Once the patient has accepted there
// is a real booked session behind it, and unbooking that is cancellation --
// a different act, with refund and notification consequences, handled by the
// cancel route.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{ suggestionId?: string }>(
    request
  );
  if (parseError) return parseError;

  const suggestionId = body.suggestionId?.trim();
  if (!suggestionId) {
    return NextResponse.json({ error: "Missing suggestionId" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: suggestion } = await admin
    .from("session_suggestions")
    .select("id, therapist_id, status")
    .eq("id", suggestionId)
    .maybeSingle();
  if (!suggestion) {
    return NextResponse.json({ error: "That suggestion no longer exists." }, { status: 404 });
  }
  if (suggestion.therapist_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Already resolved -- the patient answered while this request was in
  // flight, or this is a second tap. Success-shaped for the same reason the
  // respond route's is: the caller wanted it gone, and it is gone.
  if (suggestion.status !== "pending") {
    return NextResponse.json({
      success: true,
      alreadyAnswered: true,
      status: suggestion.status,
    });
  }

  const { data: updated } = await admin
    .from("session_suggestions")
    .update({ status: "withdrawn", responded_at: new Date().toISOString() })
    .eq("id", suggestion.id)
    .eq("status", "pending")
    .select("status")
    .maybeSingle();

  // Lost the race to the patient's answer. Their answer stands: they acted
  // on what they were shown.
  if (!updated) {
    const { data: fresh } = await admin
      .from("session_suggestions")
      .select("status")
      .eq("id", suggestion.id)
      .maybeSingle();
    return NextResponse.json({
      success: true,
      alreadyAnswered: true,
      status: fresh?.status ?? "accepted",
    });
  }

  return NextResponse.json({ success: true, status: "withdrawn" });
}
