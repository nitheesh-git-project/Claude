import { partnerCutFor } from "@/lib/adminMetrics";
import { sessionAmountPaise } from "@/lib/sessionAmount";
import { SESSION_FEE_PAISE } from "@/lib/pricing";

/**
 * One delivered session as a referring partner sees it: what the clinic kept
 * (net of processed refunds) and the partner's commission on it.
 *
 * Dependency-free so it is tested without a database. The commission comes
 * from `partnerCutFor`, the same function the admin Money screens use, so the
 * two screens agree by construction rather than by two copies of the rule.
 */
export type HospitalSessionInput = {
  id: string;
  patient_id: string;
  slot_time: string | null;
  timezone: string | null;
  status: string;
  payment_status: string;
  amount_paid_paise: number | null;
  refund_status: string | null;
  refund_amount_paise: number | null;
  payment_terms?: string | null;
  amount_due_paise?: number | null;
  hospital_share_percent_at_completion?: number | null;
  hospital_id_at_completion?: string | null;
  session_code?: string | null;
};

export type HospitalSessionLine = {
  id: string;
  patientId: string;
  slotTime: string | null;
  timezone: string | null;
  sessionCode: string | null;
  netPaise: number;
  partnerCutPaise: number;
  /** The rate this session's commission was taken at, or null when unknown. */
  sharePercent: number | null;
};

/**
 * Null when the session is not one this partner earned on: not completed,
 * not yet earned (unpaid and not on pay-later terms), or a completion
 * snapshot that names no partner or a different one.
 */
export function hospitalSessionLine(
  s: HospitalSessionInput,
  hospitalId: string,
  liveSharePercent: number
): HospitalSessionLine | null {
  if (s.status !== "completed") return null;
  // Pay later is earned at completion, exactly as moneyLineFor recognises it.
  const earned = s.payment_status === "paid" || s.payment_terms === "pay_later";
  if (!earned) return null;

  const hasSnapshot =
    s.hospital_id_at_completion !== undefined || s.hospital_share_percent_at_completion !== undefined;
  if (hasSnapshot && s.hospital_id_at_completion !== hospitalId) return null;

  const grossPaise = sessionAmountPaise(s, SESSION_FEE_PAISE);
  const refundPaise = s.refund_status === "processed" ? Math.max(0, s.refund_amount_paise ?? 0) : 0;
  const netPaise = Math.max(0, grossPaise - refundPaise);
  const cut = partnerCutFor(s, liveSharePercent, netPaise, { referredByProfile: true });

  return {
    id: s.id,
    patientId: s.patient_id,
    slotTime: s.slot_time,
    timezone: s.timezone,
    sessionCode: s.session_code ?? null,
    netPaise,
    partnerCutPaise: cut.cutPaise,
    sharePercent: cut.unknown ? null : cut.sharePercent,
  };
}
