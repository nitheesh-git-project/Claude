import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";

// Reverts a mistakenly (or prematurely) completed session back to
// "confirmed" — admin-only, deliberately not self-service for the
// therapist, so undoing a Done can't be used to walk back a bad rating.
// Any ratings/feedback already submitted are cleared, since they were
// given on the premise that the session actually happened; if it's
// reopened, that premise no longer holds and both sides should be asked
// again once it's genuinely done.
export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{ appointmentId?: string }>(
    request
  );
  if (parseError) return parseError;
  const { appointmentId } = body;
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: appointment } = await admin
    .from("appointments")
    .select("id, status")
    .eq("id", appointmentId)
    .single();

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.status !== "completed") {
    return NextResponse.json(
      { error: "Only completed sessions can be reopened." },
      { status: 400 }
    );
  }

  const { error } = await admin
    .from("appointments")
    .update({
      status: "confirmed",
      patient_rating: null,
      patient_feedback: null,
      patient_feedback_at: null,
      therapist_rating: null,
      therapist_feedback: null,
      therapist_feedback_at: null,
    })
    .eq("id", appointmentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
