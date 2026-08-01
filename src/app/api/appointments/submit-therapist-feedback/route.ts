import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActive } from "@/lib/supabase/requireActiveProfile";

const MAX_FEEDBACK_LENGTH = 1000;

export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{
    appointmentId?: string;
    rating?: unknown;
    feedback?: unknown;
  }>(request);
  if (parseError) return parseError;
  const { appointmentId, rating, feedback } = body;

  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Rating must be 1-5" }, { status: 400 });
  }
  const trimmedFeedback = typeof feedback === "string" ? feedback.trim() : "";
  if (trimmedFeedback.length > MAX_FEEDBACK_LENGTH) {
    return NextResponse.json(
      { error: `Feedback must be ${MAX_FEEDBACK_LENGTH} characters or less.` },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await isProfileActive(user.id))) {
    return NextResponse.json({ error: "Your account has been suspended." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: appointment } = await admin
    .from("appointments")
    .select("id, therapist_id, status, no_show")
    .eq("id", appointmentId)
    .single();

  if (!appointment) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (appointment.therapist_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (appointment.status !== "completed") {
    return NextResponse.json(
      { error: "This session isn't marked completed yet." },
      { status: 400 }
    );
  }
  // Same reasoning as submit-patient-feedback: the client hides the form
  // for a no-show, but a page rendered just before the no-show was recorded
  // could still have it open — reject the write here too.
  if (appointment.no_show) {
    return NextResponse.json(
      { error: "This session was marked as a no-show — there's nothing to rate." },
      { status: 400 }
    );
  }

  // Condition the write itself on therapist_rating still being null, instead
  // of trusting the read above — closes the race where two near-simultaneous
  // submissions both pass the read-time check and the second silently
  // clobbers the first's rating.
  const { data: updated, error } = await admin
    .from("appointments")
    .update({
      therapist_rating: rating,
      therapist_feedback: trimmedFeedback ? trimmedFeedback : null,
      therapist_feedback_at: new Date().toISOString(),
    })
    .eq("id", appointmentId)
    .is("therapist_rating", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: "You've already rated this session." },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
