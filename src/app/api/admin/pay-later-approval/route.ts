import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverError } from "@/lib/apiError";
import { claimTherapistSlot, describeClaimFailure } from "@/lib/claimTherapistSlot";
import { checkTherapistAssignable, unassignableBody } from "@/lib/therapistAssignability";
import { announceConfirmedSession, VISIT_COLUMNS, type VisitRow } from "@/lib/announceConfirmedSession";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";

/** Ten characters, the same floor the pay-later grant and a rejected payment use. */
const MIN_REASON = 10;

/**
 * Approve or decline one pay-later booking (owner's decision: the clinic
 * approves each one). It is a money decision -- the clinic agreeing to treat
 * before it is paid -- so it is `money` scope wherever its button sits.
 *
 * Approve: the booking may now be confirmed. If a therapist is already on
 * it, it is confirmed here, with the roster re-checked, the calendar event
 * and the patient's email -- exactly as Assign & Confirm would. Otherwise it
 * joins "Sessions with no therapist", where assigning confirms it.
 *
 * Decline: the booking becomes an ordinary unpaid one the patient pays online
 * (`payment_terms` back to `prepaid`); the reason is what they are told and
 * is required. Both are claimed on `pay_later_approval = 'pending'`, so two
 * admins cannot decide one booking twice.
 *
 * Body: { appointmentId: string, decision: "approve" | "decline", reason?: string }
 */
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("money");
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: body, error: parseError } = await parseJsonBody<{
    appointmentId?: unknown;
    decision?: unknown;
    reason?: unknown;
  }>(request);
  if (parseError) return parseError;

  const appointmentId = typeof body.appointmentId === "string" ? body.appointmentId.trim() : "";
  const decision = body.decision === "approve" || body.decision === "decline" ? body.decision : null;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!appointmentId || !decision) {
    return NextResponse.json({ error: "Missing appointmentId or decision." }, { status: 400 });
  }
  if (decision === "decline" && reason.length < MIN_REASON) {
    return NextResponse.json(
      { error: `Say why in at least ${MIN_REASON} characters - the patient is shown this.` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: row, error: readError } = await admin
    .from("appointments")
    .select("id, patient_id, status, therapist_id, slot_time, duration_minutes, timezone, payment_terms, pay_later_approval")
    .eq("id", appointmentId)
    .maybeSingle();
  if (readError) return serverError("admin/pay-later-approval", readError);
  if (!row) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  if (row.pay_later_approval !== "pending" || row.payment_terms !== "pay_later") {
    return NextResponse.json({ error: "This booking is not waiting for a pay-later approval." }, { status: 409 });
  }
  if (row.status !== "requested") {
    return NextResponse.json({ error: "This session is no longer waiting - it was cancelled or changed." }, { status: 409 });
  }

  const now = new Date().toISOString();

  if (decision === "decline") {
    const { data: claimed, error } = await admin
      .from("appointments")
      .update({
        pay_later_approval: "declined",
        pay_later_approved_by: adminUser.id,
        pay_later_approved_at: now,
        pay_later_decline_reason: reason,
        payment_terms: "prepaid",
        amount_due_paise: null,
      })
      .eq("id", appointmentId)
      .eq("pay_later_approval", "pending")
      .eq("status", "requested")
      .select("id")
      .maybeSingle();
    if (error) return serverError("admin/pay-later-approval", error);
    if (!claimed) return NextResponse.json({ error: "Somebody else decided this a moment ago." }, { status: 409 });
    await recordAdminActivity(admin, adminUser.id, {
      action: "pay_later.decline_booking",
      targetId: appointmentId,
      details: { patientId: row.patient_id, reason },
    });
    return NextResponse.json({ success: true, decision });
  }

  // Approve. With a therapist already on it, the roster is asked again
  // before anything is written: approving a booking its therapist can no
  // longer take would confirm a session nobody will run.
  if (row.therapist_id && row.slot_time) {
    const assignable = await checkTherapistAssignable(
      admin,
      row.therapist_id,
      row.slot_time,
      row.duration_minutes ?? BASE_DURATION_MINUTES,
      { excludeAppointmentId: appointmentId }
    );
    if (assignable.ok === null) {
      return NextResponse.json(
        { error: "We couldn't check the therapist's schedule just now. Please try again." },
        { status: 503 }
      );
    }
    if (!assignable.ok) return NextResponse.json(unassignableBody(assignable.reasons), { status: 409 });
  }

  const { data: approved, error: approveError } = await admin
    .from("appointments")
    .update({ pay_later_approval: "approved", pay_later_approved_by: adminUser.id, pay_later_approved_at: now })
    .eq("id", appointmentId)
    .eq("pay_later_approval", "pending")
    .eq("status", "requested")
    .select("id")
    .maybeSingle();
  if (approveError) return serverError("admin/pay-later-approval", approveError);
  if (!approved) return NextResponse.json({ error: "Somebody else decided this a moment ago." }, { status: 409 });

  let confirmed = false;
  if (row.therapist_id) {
    const claim = await claimTherapistSlot(admin, {
      appointmentId,
      therapistId: row.therapist_id,
      expectedTherapistId: row.therapist_id,
      confirm: true,
    });
    if (!claim.ok) {
      // Approved, but not confirmed: it now sits in "Assigned, not
      // confirmed", where the drawer's Confirm button finishes it.
      const { status, error } = describeClaimFailure(claim);
      await recordAdminActivity(admin, adminUser.id, {
        action: "pay_later.approve_booking",
        targetId: appointmentId,
        details: { patientId: row.patient_id, confirmed: false },
      });
      return NextResponse.json(
        { error: `Approved, but not confirmed: ${error}`, approved: true },
        { status }
      );
    }
    confirmed = true;
    const { data: visit } = await admin.from("appointments").select(VISIT_COLUMNS).eq("id", appointmentId).maybeSingle();
    await announceConfirmedSession(admin, {
      appointmentId,
      patientId: row.patient_id,
      therapistId: row.therapist_id,
      slotTime: row.slot_time,
      durationMinutes: row.duration_minutes,
      timezone: row.timezone,
      visit: (visit as VisitRow | null) ?? null,
    });
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "pay_later.approve_booking",
    targetId: appointmentId,
    details: { patientId: row.patient_id, confirmed },
  });
  return NextResponse.json({ success: true, decision, confirmed });
}
