// Pure aggregation for the admin Payment History tab -- kept separate from
// AdminPaymentHistoryTab.tsx so the math can reasoned about without
// rendering, matching therapistPayouts.ts's own convention.
//
// "Mode of Payment" is deliberately a fixed constant, not a per-transaction
// field: the only payment path in this codebase is Razorpay Checkout, and
// verify/route.ts never captures which instrument (UPI/card/etc) the
// patient actually used -- only a real razorpay_payment_id. Showing
// "UPI (GPay)" or "Card ending 4242" without that data would be fabricated,
// so every real transaction here is labeled with the true, generic fact
// instead: "Online via Razorpay".

export const MODE_OF_PAYMENT = "Online via Razorpay";

export type PaymentAppointment = {
  id: string;
  patient_id: string;
  therapist_id: string | null;
  concern: string | null;
  payment_status: string;
  amount_paid_paise: number | null;
  paid_at: string | null;
  razorpay_payment_id: string | null;
  package_purchase_id: string | null;
  therapist_payout_paid_at: string | null;
  therapist_payout_amount_paise: number | null;
  therapist_payout_method: string | null;
  therapist_payout_note: string | null;
  // Added for the admin Receipts section -- widened rather than given its
  // own narrower type, same reasoning as adminMetrics.ts's
  // MetricsAppointment: this is always the exact same `appointments` array
  // page.tsx already passes to every other admin-dashboard tab.
  status: string;
  slot_time: string | null;
  timezone: string | null;
  refund_status: string | null;
  therapist_payout_batch_id: string | null;
  // New/migration-dependent (see supabase/schema.sql's "Unique display IDs"
  // section) -- optional so this type keeps compiling for any caller that
  // hasn't started fetching it yet.
  session_code?: string | null;
  /** The confirmed pay-later payment that closed this session, if any. */
  pay_later_payment_id?: string | null;
};

/** A confirmed pay-later payment: money that arrived the day it was
 *  confirmed, whether or not a session has used it yet. */
export type SettlementPayment = {
  id: string;
  amount_paise: number;
  method: string;
  reference: string | null;
  confirmed_at: string | null;
  declared_at: string | null;
};

const SETTLEMENT_METHOD_LABEL: Record<string, string> = {
  online: MODE_OF_PAYMENT,
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank transfer",
  other: "Other",
};

export type PackagePurchase = {
  id: string;
  patient_id: string;
  category_id: string | null;
  session_count: number;
  payment_status: string;
  amount_paid_paise: number | null;
  paid_at: string | null;
  razorpay_payment_id: string | null;
};

export type PatientTransaction = {
  id: string;
  date: string; // paid_at, ISO
  transactionId: string | null;
  modeOfPayment: string;
  amountPaise: number;
  purpose: string;
  status: "Successful";
  // null for package-purchase transactions -- a package purchase isn't
  // itself a single session, so there's no one session_code that fits.
  sessionCode: string | null;
  /** The programme purchase this payment bought, so the row can name it by
   *  its programme ID (PED_PKG001-2/6). Null for a single session. */
  packagePurchaseId?: string | null;
};

export type PatientPaymentSummary = {
  patientId: string;
  totalSpentPaise: number;
  lastPaymentAt: string | null;
  transactionCount: number;
};

// A session covered by a package (package_purchase_id set) isn't its own
// payment event -- the real charge already happened when the package was
// bought. Including it as a second "transaction" would both fabricate a
// payment that never occurred for that session and double-count the money
// against the package purchase's own row.
//
// A confirmed pay-later payment is its own transaction, dated when it was
// confirmed. A session it closed is then left out: its money is the
// payment's, and counting both would put the same rupees in twice. (Before
// this, only the session was counted, so money paid ahead of a session was
// counted nowhere until the session was delivered.)
export function buildPatientTransactions(
  appointments: PaymentAppointment[],
  packagePurchases: PackagePurchase[],
  categoryTitleById: Map<string, string>,
  settlements: SettlementPayment[] = []
): PatientTransaction[] {
  const settlementIds = new Set(settlements.map((s) => s.id));
  const sessionTx: PatientTransaction[] = appointments
    .filter((a) => !(a.pay_later_payment_id && settlementIds.has(a.pay_later_payment_id)))
    .filter((a) => a.payment_status === "paid" && !a.package_purchase_id && a.paid_at)
    .map((a) => ({
      id: a.id,
      date: a.paid_at as string,
      transactionId: a.razorpay_payment_id,
      modeOfPayment: MODE_OF_PAYMENT,
      amountPaise: a.amount_paid_paise ?? 0,
      purpose: a.concern ?? "General Consultation",
      status: "Successful" as const,
      sessionCode: a.session_code ?? null,
    }));

  const packageTx: PatientTransaction[] = packagePurchases
    .filter((p) => p.payment_status === "paid" && p.paid_at)
    .map((p) => ({
      id: p.id,
      date: p.paid_at as string,
      transactionId: p.razorpay_payment_id,
      modeOfPayment: MODE_OF_PAYMENT,
      amountPaise: p.amount_paid_paise ?? 0,
      purpose: `${p.session_count}-session programme${
        p.category_id && categoryTitleById.has(p.category_id)
          ? `: ${categoryTitleById.get(p.category_id)}`
          : ""
      }`,
      status: "Successful" as const,
      sessionCode: null,
      packagePurchaseId: p.id,
    }));

  const settlementTx: PatientTransaction[] = settlements
    .filter((p) => p.confirmed_at || p.declared_at)
    .map((p) => ({
      id: p.id,
      date: (p.confirmed_at ?? p.declared_at) as string,
      transactionId: p.reference,
      modeOfPayment: SETTLEMENT_METHOD_LABEL[p.method] ?? "Other",
      amountPaise: Math.max(0, p.amount_paise),
      purpose: "Pay-later payment",
      status: "Successful" as const,
      sessionCode: null,
    }));

  return [...sessionTx, ...packageTx, ...settlementTx].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export function computePatientPaymentSummary(
  patientId: string,
  transactions: PatientTransaction[]
): PatientPaymentSummary {
  const totalSpentPaise = transactions.reduce((sum, t) => sum + t.amountPaise, 0);
  const lastPaymentAt = transactions.length > 0 ? transactions[0].date : null;
  return {
    patientId,
    totalSpentPaise,
    lastPaymentAt,
    transactionCount: transactions.length,
  };
}

export type TherapistPayoutTransaction = {
  id: string;
  date: string; // therapist_payout_paid_at, ISO
  amountPaise: number;
  method: string;
  note: string | null;
  purpose: string;
  status: "Paid";
  sessionCode: string | null;
};

export type TherapistPayoutHistorySummary = {
  therapistId: string;
  totalPaidOutPaise: number;
  lastPayoutAt: string | null;
  transactionCount: number;
};

// There's no processor-issued transaction ID on this side -- these are
// admin-recorded settlements (cash handed over, or an online transfer sent
// outside the platform), not a payment gateway charge. The settlement's own
// free-text note is the closest real equivalent, shown as-is rather than
// invented as a fake reference number.
export function buildTherapistPayoutTransactions(
  therapistAppointments: PaymentAppointment[],
  patientNameById: Map<string, string>
): TherapistPayoutTransaction[] {
  return therapistAppointments
    .filter((a) => a.therapist_payout_paid_at)
    .map((a) => ({
      id: a.id,
      date: a.therapist_payout_paid_at as string,
      amountPaise: a.therapist_payout_amount_paise ?? 0,
      method: a.therapist_payout_method === "online" ? "Online transfer" : "Cash",
      note: a.therapist_payout_note,
      purpose: `${a.concern ?? "Session"} - ${patientNameById.get(a.patient_id) ?? "Unknown patient"}`,
      status: "Paid" as const,
      sessionCode: a.session_code ?? null,
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function computeTherapistPayoutHistorySummary(
  therapistId: string,
  transactions: TherapistPayoutTransaction[]
): TherapistPayoutHistorySummary {
  const totalPaidOutPaise = transactions.reduce((sum, t) => sum + t.amountPaise, 0);
  const lastPayoutAt = transactions.length > 0 ? transactions[0].date : null;
  return {
    therapistId,
    totalPaidOutPaise,
    lastPayoutAt,
    transactionCount: transactions.length,
  };
}
