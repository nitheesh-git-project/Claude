import type { SupabaseClient } from "@supabase/supabase-js";
import { sessionTherapistCutPaise, type PayoutAppointment } from "@/lib/therapistPayouts";

/**
 * The record of what one delivered session was worth, written when it is
 * delivered.
 *
 * Every money figure in this app is a **derivation** -- `adminMetrics.ts`
 * reads `appointments` plus the rates frozen on each row and divides it up.
 * The arithmetic is right and two invariants are asserted in tests, but a
 * settlement cannot be queried, there is no per-session record of *when* a
 * split was computed, and a payout batch references appointments rather than
 * settlements. That is audit items 10, 32, 33, 35, 36 and 129-131 between
 * them.
 *
 * **This writes alongside the derivation and does not replace it.** That is
 * the same playbook `session_credit_ledger` follows and it is the whole
 * reason this could land in one change rather than as a migration with its
 * own reconciliation plan: nothing reads these rows to decide what anybody is
 * paid, historical sessions have no row and need no backfill, and
 * `verify_settlement_agreement()` reports where a row and the derivation
 * disagree. Until that is green on real data, nothing should read from here.
 *
 * Three rules:
 *
 * 1. **It never fails the completion.** Completing a session is what creates
 *    the debt, the revenue and the therapist's pay; a shadow record that
 *    refused to write must not be the thing that stops a clinic closing a
 *    session. Same posture as the credit mirror and the audit log, and the
 *    opposite of the refund attempt -- which is written *before* money moves
 *    and so has to be able to refuse.
 * 2. **It stores amounts, not rates.** A rate is what a figure would be
 *    computed from, and this table exists so nothing has to compute it again.
 *    The percentages ride along for explanation only.
 * 3. **The therapist's share comes from the one module that owns it**
 *    (`sessionTherapistCutPaise`), never a local multiplication -- the
 *    duplication rule, in the one place where a third copy would be written
 *    into a permanent record rather than onto a screen.
 */

export type SettlementInput = {
  appointmentId: string;
  therapistId: string | null;
  hospitalId: string | null;
  /**
   * The **effective** therapist share for this session -- `readSettlementRates`
   * has already chosen between the ordinary rate and the home-visit one, so
   * there is no second rate to pass and no second place to get that choice
   * wrong.
   */
  therapistSharePercent: number | null;
  hospitalSharePercent: number | null;
};

/**
 * Splits one session. Dependency-free so the arithmetic is unit-tested rather
 * than only integration-tested -- it is the shape of the permanent record.
 *
 * The partner's commission is taken on what the clinic keeps **after** the
 * therapist, which is the rule `moneyByBucketFor` already applies; computing
 * it on gross would pay a partner a share of the therapist's own money.
 * Travel is inside the therapist's figure and never revenue, so the three
 * shares still sum to gross exactly -- which is what
 * `verify_settlement_agreement()` asserts.
 */
export function splitSessionSettlement(input: {
  grossPaise: number;
  travelPaise: number;
  therapistSharePaise: number;
  hospitalSharePercent: number | null;
}): { therapistSharePaise: number; partnerSharePaise: number; clinicSharePaise: number } {
  const therapistSharePaise = Math.max(0, Math.min(input.therapistSharePaise, input.grossPaise));
  const afterTherapist = input.grossPaise - therapistSharePaise;
  const partnerSharePaise =
    input.hospitalSharePercent === null
      ? 0
      : Math.max(0, Math.round((afterTherapist * input.hospitalSharePercent) / 100));
  // The clinic takes the remainder rather than its own percentage, so the
  // three always sum to gross and rounding can never invent or lose a paisa.
  const clinicSharePaise = afterTherapist - partnerSharePaise;
  return { therapistSharePaise, partnerSharePaise, clinicSharePaise };
}

export async function recordSessionSettlement(
  admin: SupabaseClient,
  input: SettlementInput
): Promise<void> {
  try {
    // The money columns are read here rather than taken from the caller: the
    // completion route's own select does not carry them, `amount_due_paise`
    // and `payment_terms` are migration-dependent, and widening a shared
    // select for a shadow record is how a database mid-migration loses the
    // write that closes a session. Isolated, and a failure costs this row
    // alone.
    const { data: row } = await admin
      .from("appointments")
      .select(
        "id, status, payment_status, amount_paid_paise, therapist_id, patient_id, category_id, slot_time, paid_at, therapist_payout_paid_at, therapist_payout_amount_paise, therapist_payout_method, therapist_payout_note, patient_rating, patient_feedback, therapist_rating, therapist_feedback, visit_mode, travel_fee_paise"
      )
      .eq("id", input.appointmentId)
      .maybeSingle();
    if (!row) return;

    const { data: terms } = await admin
      .from("appointments")
      .select("payment_terms, amount_due_paise")
      .eq("id", input.appointmentId)
      .maybeSingle();

    const a = {
      ...row,
      payment_terms: terms?.payment_terms ?? null,
      amount_due_paise: terms?.amount_due_paise ?? null,
    } as unknown as PayoutAppointment;

    const grossPaise = Math.max(
      0,
      a.amount_paid_paise ?? a.amount_due_paise ?? 0
    );
    const travelPaise =
      a.visit_mode === "home_visit" ? Math.max(0, a.travel_fee_paise ?? 0) : 0;

    const therapistSharePaise =
      input.therapistSharePercent === null
        ? 0
        : sessionTherapistCutPaise(a, input.therapistSharePercent, null);

    const split = splitSessionSettlement({
      grossPaise,
      travelPaise,
      therapistSharePaise,
      hospitalSharePercent: input.hospitalSharePercent,
    });

    await admin.from("session_settlements").insert({
      source: "session_completion",
      source_id: input.appointmentId,
      appointment_id: input.appointmentId,
      therapist_id: input.therapistId,
      hospital_id: input.hospitalId,
      gross_paise: grossPaise,
      travel_paise: travelPaise,
      therapist_share_paise: split.therapistSharePaise,
      partner_share_paise: split.partnerSharePaise,
      clinic_share_paise: split.clinicSharePaise,
      therapist_share_percent: input.therapistSharePercent,
      hospital_share_percent: input.hospitalSharePercent,
      recognised_at: new Date().toISOString(),
    });
  } catch (e) {
    // Never fails the completion it describes. A duplicate is the ordinary
    // case rather than an error: the unique index on `appointment_id` is what
    // makes a re-completion idempotent, so there is nothing to report.
    console.error("Failed to record session settlement", input.appointmentId, e);
  }
}
