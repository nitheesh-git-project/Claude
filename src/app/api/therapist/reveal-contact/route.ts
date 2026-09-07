import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { canRevealContact } from "@/lib/contactMasking";

// Unmasking one patient's number, for one session, and writing down that it
// happened.
//
// The point of this route is not to withhold the number -- a therapist with
// a session that will not start, or standing outside the wrong gate, has a
// real need for it, and a control that gets in the way of care is a control
// that gets worked around. The point is that asking is visible. A caseload
// harvested for an off-platform practice looks nothing like a clinician
// ringing the patient they are with, and contact_reveal_log is what makes
// the two distinguishable after the fact.
//
// Scoped to a single appointment on purpose. There is no route that reveals
// a patient's number in the abstract, because there is no clinical reason
// to need one outside a session you are running.
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
    appointmentId?: string;
  }>(request);
  if (parseError) return parseError;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, active, approved")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "therapist") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (profile.active === false || profile.approved === false) {
    return NextResponse.json({ error: "Your account is not active." }, { status: 403 });
  }

  const appointmentId = body.appointmentId?.trim();
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointment." }, { status: 400 });
  }

  // Re-derived, never taken from the body: the session has to be this
  // therapist's, and the number that comes back is the one on that
  // session's patient, not one the caller named.
  const { data: appointment } = await admin
    .from("appointments")
    .select("id, patient_id, therapist_id, slot_time, status, visit_mode, visit_contact_phone")
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appointment || appointment.therapist_id !== user.id) {
    return NextResponse.json({ error: "That isn't your session." }, { status: 403 });
  }

  const { data: settingsRow } = await admin
    .from("site_settings")
    .select(SITE_SETTINGS_SELECT)
    .maybeSingle();
  const settings = parseAdminSettings(settingsRow);

  // Masking off means there is nothing to reveal -- the number is already
  // on the card. Answering with it anyway keeps the client's one code path
  // working, and the log entry is still worth having.
  const decision = settings.contactMaskingEnabled
    ? canRevealContact({
        slotTimeMs: new Date(appointment.slot_time).getTime(),
        status: appointment.status,
        visitMode: appointment.visit_mode ?? "online",
        beforeMinutes: settings.joinWindowMinutes,
        afterMinutes: settings.sessionCompletedAfterMinutes,
        nowMs: Date.now(),
      })
    : ({ allowed: true, reason: "masking disabled" } as const);

  if (!decision.allowed) {
    return NextResponse.json({ error: decision.message }, { status: 403 });
  }

  const { data: patient } = await admin
    .from("profiles")
    .select("phone")
    .eq("id", appointment.patient_id)
    .maybeSingle();

  // The door number a home visit was booked with may deliberately differ
  // from the account holder's -- an elderly patient's booking is often made
  // by a relative -- so it wins where it exists, exactly as the card does.
  const phone = appointment.visit_contact_phone || patient?.phone || null;
  if (!phone) {
    return NextResponse.json({ error: "There is no number on file." }, { status: 404 });
  }

  // Written before the number is returned. A log entry that fails after the
  // number has gone out is a reveal with no trace, which is the one outcome
  // this route must not produce -- so unlike the audit log's
  // best-effort posture, this failure refuses the reveal.
  const { error: logError } = await admin.from("contact_reveal_log").insert({
    therapist_id: user.id,
    patient_id: appointment.patient_id,
    appointment_id: appointment.id,
    field: "phone",
    reason: decision.reason,
  });
  if (logError) {
    console.error("Contact reveal refused: could not write the log", logError);
    return NextResponse.json(
      { error: "Could not show the number just now. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, phone });
}
