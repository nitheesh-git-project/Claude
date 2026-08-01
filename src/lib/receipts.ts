// Pure aggregation for the Receipts feature -- kept separate from any
// rendering component so the logic can be reasoned about on its own,
// matching this codebase's established convention (see paymentHistory.ts,
// therapistPayouts.ts, adminMetrics.ts).
//
// A receipt is never its own stored row for the two "obvious" cases -- it's
// the existing appointments/patient_package_purchases row, rendered
// differently depending on its current status. Only payment-failure and
// payout-batch data are genuinely new state (see supabase/schema.sql's
// "Receipts feature" section for why).

// Split into two purpose-specific types rather than one shape covering
// every column either function might touch -- a patient-dashboard query has
// no reason to select therapist payout columns, and a therapist-payout
// query has no reason to select payment/refund columns.
export type PatientReceiptAppointment = {
  id: string;
  concern: string | null;
  slot_time: string | null;
  timezone: string | null;
  status: string;
  payment_status: string;
  amount_paid_paise: number | null;
  paid_at: string | null;
  razorpay_payment_id: string | null;
  package_purchase_id: string | null;
  refund_status: string | null;
};

export type PayoutReceiptAppointment = {
  id: string;
  patient_id: string;
  concern: string | null;
  slot_time: string | null;
  therapist_payout_batch_id: string | null;
  therapist_payout_amount_paise: number | null;
};

export type ReceiptPackagePurchase = {
  id: string;
  category_id: string | null;
  session_count: number;
  payment_status: string;
  amount_paid_paise: number | null;
  paid_at: string | null;
  razorpay_payment_id: string | null;
};

export type PaymentFailureRow = {
  id: string;
  // Unused by buildPatientReceipts itself (the caller already scopes the
  // array to one patient), but needed by the admin Payment History tab's
  // Receipts section, which fetches every patient's failures in one query
  // and groups them client-side.
  patient_id: string;
  appointment_id: string | null;
  package_purchase_id: string | null;
  amount_paise: number | null;
  error_code: string | null;
  error_reason: string | null;
  error_description: string | null;
  created_at: string;
};

export type PayoutBatchRow = {
  id: string;
  therapist_id: string;
  amount_paise: number;
  method: string;
  note: string | null;
  created_at: string;
};

export type BookingReceiptStage =
  | "payment_confirmed"
  | "service_completed"
  | "cancelled"
  | "refunded"
  | "refund_failed";

export type BookingReceipt = {
  kind: "booking";
  id: string; // appointment id or package purchase id
  appointmentId: string | null; // null when this row IS the package purchase itself
  packagePurchaseId: string | null;
  stage: BookingReceiptStage;
  isPackageCovered: boolean; // this specific row is a session drawn from a package, not a fresh charge
  title: string;
  slotTime: string | null;
  slotTimezone: string | null;
  amountPaise: number;
  transactionId: string | null;
  date: string; // paid_at, used for sorting/display
};

export type PaymentFailedReceipt = {
  kind: "payment_failed";
  id: string;
  appointmentId: string | null;
  packagePurchaseId: string | null;
  title: string;
  amountPaise: number | null;
  errorCode: string | null;
  errorReason: string | null;
  errorDescription: string | null;
  date: string;
};

export type PatientReceipt = BookingReceipt | PaymentFailedReceipt;

function deriveBookingStage(a: {
  status: string;
  refund_status: string | null;
}): BookingReceiptStage {
  if (a.status === "cancelled") {
    if (a.refund_status === "processed") return "refunded";
    if (a.refund_status === "failed") return "refund_failed";
    return "cancelled";
  }
  if (a.status === "completed") return "service_completed";
  return "payment_confirmed";
}

// Builds every receipt a patient should see: one evolving booking receipt
// per paid appointment (a session covered by a package still gets one, just
// flagged isPackageCovered so the UI shows "Covered by package" instead of
// an amount -- see book-with-package/route.ts, which does mark these
// payment_status: "paid" for internal bookkeeping even though no new charge
// happened), one per paid package purchase, and one per logged payment
// failure. Unpaid, non-package appointments with no failure logged simply
// have nothing to show yet -- they're still just a pending booking with a
// Pay Now button, not a receipt.
export function buildPatientReceipts(
  appointments: PatientReceiptAppointment[],
  packagePurchases: ReceiptPackagePurchase[],
  paymentFailures: PaymentFailureRow[],
  categoryTitleById: Map<string, string>
): PatientReceipt[] {
  const bookingReceipts: BookingReceipt[] = appointments
    .filter((a) => a.payment_status === "paid" && a.paid_at)
    .map((a) => ({
      kind: "booking",
      id: a.id,
      appointmentId: a.id,
      packagePurchaseId: null,
      stage: deriveBookingStage(a),
      isPackageCovered: !!a.package_purchase_id,
      title: a.concern ?? "General Consultation",
      slotTime: a.slot_time,
      slotTimezone: a.timezone,
      amountPaise: a.package_purchase_id ? 0 : a.amount_paid_paise ?? 0,
      transactionId: a.razorpay_payment_id,
      date: a.paid_at as string,
    }));

  const packageReceipts: BookingReceipt[] = packagePurchases
    .filter((p) => p.payment_status === "paid" && p.paid_at)
    .map((p) => ({
      kind: "booking",
      id: p.id,
      appointmentId: null,
      packagePurchaseId: p.id,
      stage: "payment_confirmed",
      isPackageCovered: false,
      title: `${p.session_count}-Session Package${
        p.category_id && categoryTitleById.has(p.category_id)
          ? `: ${categoryTitleById.get(p.category_id)}`
          : ""
      }`,
      slotTime: null,
      slotTimezone: null,
      amountPaise: p.amount_paid_paise ?? 0,
      transactionId: p.razorpay_payment_id,
      date: p.paid_at as string,
    }));

  const failureReceipts: PaymentFailedReceipt[] = paymentFailures.map((f) => ({
    kind: "payment_failed",
    id: f.id,
    appointmentId: f.appointment_id,
    packagePurchaseId: f.package_purchase_id,
    title: "Payment attempt",
    amountPaise: f.amount_paise,
    errorCode: f.error_code,
    errorReason: f.error_reason,
    errorDescription: f.error_description,
    date: f.created_at,
  }));

  return [...bookingReceipts, ...packageReceipts, ...failureReceipts].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export type PayoutReceiptSession = {
  appointmentId: string;
  title: string;
  slotTime: string | null;
  amountPaise: number;
  patientName: string;
};

export type PayoutReceipt = {
  kind: "payout";
  id: string; // batch id
  amountPaise: number;
  method: string;
  note: string | null;
  settledAt: string;
  sessionCount: number;
  sessions: PayoutReceiptSession[];
};

// One receipt per settlement batch, listing exactly the sessions that batch
// covered. Appointments settled before this feature existed (no
// therapist_payout_batch_id) have no batch to group under and are
// deliberately left out here -- they're still visible in the existing
// per-session Payout History list (see paymentHistory.ts), this is
// additive, not a replacement.
export function buildTherapistPayoutReceipts(
  payoutBatches: PayoutBatchRow[],
  settledAppointments: PayoutReceiptAppointment[],
  patientNameById: Map<string, string>
): PayoutReceipt[] {
  const appointmentsByBatch = new Map<string, PayoutReceiptAppointment[]>();
  for (const a of settledAppointments) {
    if (!a.therapist_payout_batch_id) continue;
    const list = appointmentsByBatch.get(a.therapist_payout_batch_id) ?? [];
    list.push(a);
    appointmentsByBatch.set(a.therapist_payout_batch_id, list);
  }

  return payoutBatches
    .map((batch) => {
      const sessions = (appointmentsByBatch.get(batch.id) ?? []).map((a) => ({
        appointmentId: a.id,
        title: a.concern ?? "General Consultation",
        slotTime: a.slot_time,
        amountPaise: a.therapist_payout_amount_paise ?? 0,
        patientName: patientNameById.get(a.patient_id) ?? "Unknown patient",
      }));
      return {
        kind: "payout" as const,
        id: batch.id,
        amountPaise: batch.amount_paise,
        method: batch.method === "online" ? "Online transfer" : "Cash",
        note: batch.note,
        settledAt: batch.created_at,
        sessionCount: sessions.length,
        sessions,
      };
    })
    .sort((a, b) => new Date(b.settledAt).getTime() - new Date(a.settledAt).getTime());
}
