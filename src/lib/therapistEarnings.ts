// Pure aggregation for the therapist's own Earnings tab -- kept separate
// from the component so the math can be reasoned about without rendering,
// matching this codebase's established convention (paymentHistory.ts,
// receipts.ts). Deliberately accrual-based, not settlement-based: a session
// counts the moment it's delivered and paid for, whether or not an admin
// has settled a payout for it yet -- see settle-therapist-payout's own
// filter, reused verbatim here so the numbers always agree with what that
// route would actually pay out right now.

export type EarningsAppointment = {
  id: string;
  session_code?: string | null;
  patient_id: string;
  category_id: string | null;
  slot_time: string | null;
  status: string;
  payment_status: string;
  amount_paid_paise: number | null;
  therapist_payout_paid_at: string | null;
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

export function computeTherapistEarningRows(
  appointments: EarningsAppointment[],
  sharePercent: number | null,
  categoryTitleById: Map<string, string>,
  patientNameById: Map<string, string>,
  sessionFeePaiseFallback: number
): TherapistEarningRow[] {
  if (sharePercent === null) return [];
  return appointments
    .filter((a) => a.status === "completed" && a.payment_status === "paid")
    .map((a): TherapistEarningRow => {
      const feePaise = a.amount_paid_paise ?? sessionFeePaiseFallback;
      return {
        id: a.id,
        sessionCode: a.session_code ?? null,
        patientId: a.patient_id,
        patientName: patientNameById.get(a.patient_id) ?? "Unknown patient",
        date: a.slot_time ?? new Date(0).toISOString(),
        categoryId: a.category_id,
        categoryTitle: a.category_id ? categoryTitleById.get(a.category_id) ?? "—" : "—",
        feePaise,
        earningPaise: Math.round((feePaise * sharePercent) / 100),
        status: a.therapist_payout_paid_at ? "paid_out" : "pending",
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function computeTherapistPendingOwed(rows: TherapistEarningRow[]): number {
  return rows
    .filter((r) => r.status === "pending")
    .reduce((sum, r) => sum + r.earningPaise, 0);
}
