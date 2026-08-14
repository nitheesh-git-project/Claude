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
  // Home-visit fields, all optional so every existing online-only caller of
  // this type is unaffected. When visit_mode is 'home_visit', travel_fee is
  // owed to the therapist in full on top of their share (see
  // homeVisitPricing.ts), and cash_collected_*/cash_remitted_at are what the
  // net-off below reads to find money the therapist is already holding.
  visit_mode?: string | null;
  travel_fee_paise?: number | null;
  cash_collected_at?: string | null;
  cash_collected_amount_paise?: number | null;
  cash_remitted_at?: string | null;
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
  // Cash currently sitting with the therapist, uncollected by the business
  // (any un-remitted collection, regardless of that visit's own settlement
  // state) -- see therapistCashLedger.ts.
  cashHeldPaise: number;
  // What settling right now would actually transfer: owedPaise net of
  // cashHeldPaise, floored at zero. This is the number the Pay button
  // should show; owedPaise alone overstates it by whatever the therapist
  // is already holding.
  netOwedPaise: number;
};

// One row's worth of numbers for the Payouts table. `sharePercent === null`
// means the therapist's revenue share isn't set yet -- cutPaise/owedPaise/
// profitPaise are meaningless in that case (0, not "nothing owed") and the
// UI must check sharePercent itself before trusting them, same guard the
// existing therapist detail page already uses.
//
// homeVisitSharePercent is profiles.home_visit_revenue_share_percent,
// nullable -- when unset, a home-visit session falls back to `sharePercent`
// (the same "no separate rate configured" rule the column itself documents).
export function computeTherapistPayoutSummary(
  therapistId: string,
  sharePercent: number | null,
  therapistAppointments: PayoutAppointment[],
  nowMs: number,
  homeVisitSharePercent: number | null = null
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
  //
  // Deliberately does NOT add travel_fee_paise here: it is a reimbursement
  // passed straight through to the therapist, never the business's money
  // (see the column's own comment in schema.sql) -- so it belongs in cut/
  // owed but not in revenue. That has a side effect worth naming: profit
  // for a home visit is revenue minus (share + travel), so it comes out
  // correctly lower by exactly the travel amount without any special case
  // for profitPaise below.
  const paidAppointments = therapistAppointments.filter((a) => a.payment_status === "paid");
  const revenuePaise = paidAppointments.reduce((sum, a) => sum + (a.amount_paid_paise ?? 0), 0);

  const completedPaid = completed.filter((a) => a.payment_status === "paid");
  let cutPaise = 0;
  let paidOutPaise = 0;
  if (sharePercent !== null) {
    for (const a of completedPaid) {
      const isHomeVisit = a.visit_mode === "home_visit";
      const effectiveShare = isHomeVisit ? homeVisitSharePercent ?? sharePercent : sharePercent;
      const feePaise = a.amount_paid_paise ?? 0;
      const travelPaise = isHomeVisit ? Math.max(0, a.travel_fee_paise ?? 0) : 0;
      const isSettled = !!a.therapist_payout_paid_at;
      const thisCutPaise = isSettled
        ? a.therapist_payout_amount_paise ?? Math.round((feePaise * effectiveShare) / 100) + travelPaise
        : Math.round((feePaise * effectiveShare) / 100) + travelPaise;
      cutPaise += thisCutPaise;
      if (isSettled) paidOutPaise += thisCutPaise;
    }
  }
  const owedPaise = cutPaise - paidOutPaise;
  const profitPaise = revenuePaise - cutPaise;

  // Cash held is a live figure, not scoped to completed/settled sessions --
  // a therapist can be holding cash for a visit that hasn't even happened
  // yet (collected in advance) or one still working through the pipeline,
  // and that money reduces what the business owes them right now regardless
  // of where any single visit's own status sits.
  const cashHeldPaise = therapistAppointments
    .filter((a) => a.cash_collected_at && !a.cash_remitted_at)
    .reduce((sum, a) => sum + (a.cash_collected_amount_paise ?? 0), 0);
  const netOwedPaise = Math.max(0, owedPaise - cashHeldPaise);

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
    cashHeldPaise,
    netOwedPaise,
  };
}
