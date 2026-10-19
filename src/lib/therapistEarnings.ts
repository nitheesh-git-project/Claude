// The therapist's own Earnings rows -- kept out of the component so the maths
// is tested without rendering. Deliberately accrual-based, not
// settlement-based: a session counts the moment it is delivered and earned,
// whether or not an admin has settled a payout for it yet.
//
// Pay later widened "delivered and paid for" to "delivered": a trusted
// patient is treated first and settles afterwards, and the clinic's decision
// is that the therapist is not made to wait on that. They did the work and
// had no say in extending the credit, so the share is earned at completion
// and the clinic carries the gap.
//
// **Every figure here comes from `therapistPayouts.ts`**, which is what Money
// -> Payouts, the therapist's admin profile, the payout request and the Pay
// button read. This module used to carry its own copy of the multiplication
// with its own fallback for a session carrying no amount -- the standard
// session fee, where the payout maths reads nothing. A QA therapist read
// ₹9,232.80 pending here and ₹4,435.20 on both admin screens; the ₹4,797.60
// between them is a whole number of ₹1,999 fees at their share -- a share of
// money nobody recorded, which the Pay button would never transfer (QA F-21).
// The loader also never read `amount_due_paise`, so a delivered pay-later
// session was quoted at that same guessed fee rather than its frozen price.
// Eligibility is `isTherapistShareEarned`, the cut
// is `sessionTherapistCutPaise` (which also reads back what a settled session
// actually transferred), and the pending total is the summary's `owedPaise`.

import { sessionAmountPaise } from "@/lib/sessionAmount";
import {
  computeTherapistPayoutSummary,
  isTherapistShareEarned,
  sessionTherapistCutPaise,
  type PayoutSummaryInput,
} from "@/lib/therapistPayouts";

export type EarningsAppointment = {
  id: string;
  session_code?: string | null;
  patient_id: string;
  category_id: string | null;
  slot_time: string | null;
  status: string;
  payment_status: string;
  amount_paid_paise: number | null;
  // Pay later, optional for the usual migration-tolerance reason: absent, every
  // row reads as prepaid and this module behaves exactly as it always has.
  payment_terms?: string | null;
  amount_due_paise?: number | null;
  therapist_payout_paid_at: string | null;
  therapist_payout_amount_paise?: number | null;
  // Home-visit fields, optional so every existing online-only caller is
  // unaffected -- see the matching comment on PayoutAppointment in
  // therapistPayouts.ts. Travel fee is paid in full on top of the share.
  visit_mode?: string | null;
  travel_fee_paise?: number | null;
};

export type TherapistEarningRow = {
  id: string;
  sessionCode: string | null;
  patientId: string;
  patientName: string;
  date: string; // slot_time, ISO
  categoryId: string | null;
  categoryTitle: string;
  feePaise: number;
  earningPaise: number;
  status: "paid_out" | "pending";
};

// homeVisitSharePercent is profiles.home_visit_revenue_share_percent,
// nullable -- when unset, a home-visit session falls back to `sharePercent`,
// same rule as computeTherapistPayoutSummary in therapistPayouts.ts.
export function computeTherapistEarningRows(
  appointments: EarningsAppointment[],
  sharePercent: number | null,
  categoryTitleById: Map<string, string>,
  patientNameById: Map<string, string>,
  homeVisitSharePercent: number | null = null
): TherapistEarningRow[] {
  if (sharePercent === null) return [];
  return appointments
    .filter((a) => isTherapistShareEarned(a))
    .map((a): TherapistEarningRow => {
      const isHomeVisit = a.visit_mode === "home_visit";
      // The figure the cut is computed from, with the payout maths' own
      // fallback (nothing) -- so the row's fee and its earning cannot tell
      // two different stories about one session.
      const feePaise = sessionAmountPaise(a, 0);
      const travelPaise = isHomeVisit ? Math.max(0, a.travel_fee_paise ?? 0) : 0;
      return {
        id: a.id,
        sessionCode: a.session_code ?? null,
        patientId: a.patient_id,
        patientName: patientNameById.get(a.patient_id) ?? "Unknown patient",
        date: a.slot_time ?? new Date(0).toISOString(),
        categoryId: a.category_id,
        categoryTitle: a.category_id ? categoryTitleById.get(a.category_id) ?? "-" : "-",
        feePaise: feePaise + travelPaise,
        earningPaise: sessionTherapistCutPaise(a, sharePercent, homeVisitSharePercent),
        status: a.therapist_payout_paid_at ? "paid_out" : "pending",
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * What the therapist is shown as pending: the payout summary's `owedPaise`,
 * the same figure their admin profile prints and Money -> Payouts lists.
 * Cash they are holding is netted by the request and the Pay button
 * (`netOwedPaise`), exactly as on those screens.
 */
export function computeTherapistPendingOwed(
  therapistId: string,
  sharePercent: number | null,
  appointments: PayoutSummaryInput[],
  nowMs: number,
  homeVisitSharePercent: number | null = null
): number {
  return computeTherapistPayoutSummary(
    therapistId,
    sharePercent,
    appointments,
    nowMs,
    homeVisitSharePercent
  ).owedPaise;
}
