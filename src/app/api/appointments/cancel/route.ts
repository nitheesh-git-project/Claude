import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { cancelAppointmentAndRefund } from "@/lib/cancelAppointment";
import { isProfileActiveAndApproved, profileCheckUnavailable } from "@/lib/supabase/requireActiveProfile";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { patientCancelClosed } from "@/lib/patientCancelCutoff";
import { serverNowMs } from "@/lib/debugClock";

const MAX_REASON_LENGTH = 500;

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
    reason?: string;
  }>(request);
  if (parseError) return parseError;
  const { appointmentId, reason } = body;
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }
  if (reason && reason.length > MAX_REASON_LENGTH) {
    return NextResponse.json(
      { error: `Reason must be ${MAX_REASON_LENGTH} characters or less.` },
      { status: 400 }
    );
  }

  const standing = await isProfileActiveAndApproved(user.id);
  if (standing === null) return profileCheckUnavailable();
  if (!standing) {
    return NextResponse.json({ error: "Your account is not active - it is either awaiting admin approval or has been suspended." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: appointment } = await admin
    .from("appointments")
    .select("id, patient_id, slot_time, visit_mode")
    .eq("id", appointmentId)
    .single();
  if (!appointment || appointment.patient_id !== user.id) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  // The clinic's cut-off: an online session can't be cancelled by the
  // patient in its last N minutes. An unreadable setting is "we couldn't
  // check", not a green light or a refusal.
  if (appointment.visit_mode !== "home_visit") {
    const { data: settingsRow, error: settingsError } = await admin
      .from("site_settings")
      .select(SITE_SETTINGS_SELECT)
      .maybeSingle();
    if (settingsError) {
      return NextResponse.json(
        { error: "We couldn't check whether this session can still be cancelled. Please try again." },
        { status: 503 }
      );
    }
    const cutoffMinutes = parseAdminSettings(settingsRow).patientCancelCutoffMinutes;
    if (patientCancelClosed({ slotTime: appointment.slot_time, nowMs: serverNowMs(request), cutoffMinutes })) {
      return NextResponse.json(
        {
          error: `This session starts too soon to cancel online (within ${cutoffMinutes} minutes). Please contact the clinic.`,
          code: "cancel_cutoff",
        },
        { status: 409 }
      );
    }
  }

  const result = await cancelAppointmentAndRefund(admin, {
    appointmentId,
    cancelledBy: user.id,
    reason,
  });
  if ("error" in result) {
    // Patients never see the internal "payout settled" reasoning - it's
    // meaningless to them and this is a genuine dead end for a patient to
    // resolve on their own.
    const error = result.payoutSettled
      ? "This session can't be cancelled online - please contact the clinic."
      : result.error;
    return NextResponse.json({ error }, { status: result.status });
  }
  return NextResponse.json({
    success: true,
    refunded: result.refunded,
    refundFailed: result.refundFailed ?? false,
  });
}
