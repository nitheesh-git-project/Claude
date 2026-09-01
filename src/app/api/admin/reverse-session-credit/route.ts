import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { adjustSessionCredits, creditErrorMessage } from "@/lib/sessionCredits";

const MAX_REASON_LENGTH = 500;
const MIN_REASON_LENGTH = 10;

// Gives back a credit that was spent on a session which did not really
// happen: a no-show that was not the patient's fault, a session marked
// completed by mistake, a call that dropped before anything was delivered.
//
// Deliberately separate from release_session_credit, which refuses on an
// already-consumed session. That refusal is right for the automatic path --
// a delivered session's credit is spent, and the cancellation flow must not
// quietly un-spend it -- and wrong as a blanket rule, because sometimes the
// session genuinely was not delivered. So the reversal exists, and it costs
// a stated reason and an admin's name on the ledger.
//
// It does not touch the appointment itself. Reopening a session is
// /api/admin/reopen-session, and the two are separate on purpose: an admin
// may want to credit the patient without disturbing a completed record the
// therapist wrote a note against, or reopen a session without moving money.
export async function POST(request: NextRequest) {
  const context = await requireAdminScope("money");
  if (!context) {
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

  const trimmedReason = reason?.trim() ?? "";
  if (trimmedReason.length < MIN_REASON_LENGTH) {
    return NextResponse.json(
      {
        error:
          "Say why this session's credit is being returned, in a sentence. It is stored on the patient's ledger permanently.",
      },
      { status: 400 }
    );
  }
  if (trimmedReason.length > MAX_REASON_LENGTH) {
    return NextResponse.json(
      { error: `Reason must be ${MAX_REASON_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // The consume entry is what is being reversed. Its absence is the answer:
  // either this session never took a credit (a directly-paid consultation),
  // or it took one and has not spent it yet, which is a release rather than
  // a reversal.
  const { data: consumed } = await admin
    .from("session_credit_ledger")
    .select("id, entitlement_id, patient_id")
    .eq("appointment_id", appointmentId)
    .eq("entry_type", "consume")
    .maybeSingle();

  if (!consumed) {
    return NextResponse.json(
      {
        error:
          "This session hasn't consumed a package credit, so there is nothing to reverse. If it is still booked, cancelling it returns the credit automatically.",
      },
      { status: 409 }
    );
  }

  // Keyed on the appointment, so a double-submitted reversal returns one
  // credit rather than two.
  const result = await adjustSessionCredits(admin, {
    entitlementId: consumed.entitlement_id,
    deltaConsumed: -1,
    reason: `[reversal] ${trimmedReason}`,
    actorId: context.id,
    idempotencyKey: `reverse_consume:${appointmentId}`,
  });

  if (!result.applied) {
    if (result.duplicate) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        available: result.available,
      });
    }
    return NextResponse.json({ error: creditErrorMessage(result.error) }, { status: 409 });
  }

  await recordAdminActivity(admin, context.id, {
    action: "credits.reverse",
    targetId: appointmentId,
    targetLabel: consumed.patient_id,
    details: {
      entitlementId: consumed.entitlement_id,
      reason: trimmedReason,
      availableAfter: result.available,
    },
  });

  return NextResponse.json({ success: true, available: result.available });
}
