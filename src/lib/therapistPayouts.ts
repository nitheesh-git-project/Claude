// Pure aggregation for the admin Payouts tab — kept separate from
// AdminPayoutsTab.tsx so the math can be unit-tested without rendering,
// matching adminMetrics.ts's own convention. Deliberately NOT wired into
// the existing per-therapist detail page (therapists/[id]/page.tsx), which
// already has its own inline, already-verified version of this same math —
// touching working, tested code for the sake of sharing ~10 lines wasn't
// worth the regression risk.

export type PayoutAppointment = {
  id: string;
  status: string;
  payment_status: string;
  amount_paid_paise: number | null;
  therapist_id: string | null;
  patient_id: string;
  category_id: string | null;
  slot_time: string | null;
  paid_at: string | null;
  therapist_payout_paid_at: string | null;
  therapist_payout_amount_paise: number | null;
  therapist_payout_method: string | null;
  therapist_payout_note: string | null;
  patient_rating: number | null;
  patient_feedback: string | null;
  therapist_rating: number | null;
  therapist_feedback: string | null;
};

export type TherapistPayoutSummary = {
  therapistId: string;
  sharePercent: number | null;
  completedCount: number;
  upcomingCount: number;
  revenuePaise: number;
  cutPaise: number;
  paidOutPaise: number;
  owedPaise: number;
  profitPaise: number;
};

// One row's worth of numbers for the Payouts table. `sharePercent === null`
// means the therapist's revenue share isn't set yet -- cutPaise/owedPaise/
// profitPaise are meaningless in that case (0, not "nothing owed") and the
// UI must check sharePercent itself before trusting them, same guard the
// existing therapist detail page already uses.
export function computeTherapistPayoutSummary(
  therapistId: string,
  sharePercent: number | null,
  therapistAppointments: PayoutAppointment[],
  nowMs: number
): TherapistPayoutSummary {
  const completed = therapistAppointments.filter((a) => a.status === "completed");
  const upcoming = therapistAppointments.filter(
    (a) => a.status === "confirmed" && a.slot_time && new Date(a.slot_time).getTime() >= nowMs
  );

  // Revenue counts every paid session regardless of completion (money
  // already collected from the patient), matching "Revenue (range)" on the
  // Metrics tab. Cut/payout only ever apply to completed sessions -- same
  // "the work has to actually be delivered before it's earned" rule the
  // existing settle-therapist-payout route already enforces server-side.
  const paidAppointments = therapistAppointments.filter((a) => a.payment_status === "paid");
  const revenuePaise = paidAppointments.reduce((sum, a) => sum + (a.amount_paid_paise ?? 0), 0);

  const completedPaid = completed.filter((a) => a.payment_status === "paid");
  let cutPaise = 0;
  let paidOutPaise = 0;
  if (sharePercent !== null) {
    for (const a of completedPaid) {
      const feePaise = a.amount_paid_paise ?? 0;
      const isSettled = !!a.therapist_payout_paid_at;
      const thisCutPaise = isSettled
        ? a.therapist_payout_amount_paise ?? Math.round((feePaise * sharePercent) / 100)
        : Math.round((feePaise * sharePercent) / 100);
      cutPaise += thisCutPaise;
      if (isSettled) paidOutPaise += thisCutPaise;
    }
  }
  const owedPaise = cutPaise - paidOutPaise;
  const profitPaise = revenuePaise - cutPaise;

  return {
    therapistId,
    sharePercent,
    completedCount: completed.length,
    upcomingCount: upcoming.length,
    revenuePaise,
    cutPaise,
    paidOutPaise,
    owedPaise,
    profitPaise,
  };
}
