import { describeRefundForPatient, type RefundDescription } from "@/lib/refundState";
import { describeDiscount, type DiscountSource } from "@/lib/discounts";
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
  /** What came back, when and why. Migration-dependent (refunded_at is the
   *  newest of the three), so a caller reading a database without them
   *  hands through undefined and the receipt states the refund without a
   *  date rather than inventing one. */
  refund_amount_paise?: number | null;
  refund_reason?: string | null;
  refunded_at?: string | null;
  /** What the session listed at and what came off it, when a discount
   *  applied. Migration-dependent, so a caller reading a database without
   *  the columns hands through undefined and the receipt simply shows the
   *  amount charged, as it always did. */
  list_price_paise?: number | null;
  discount_paise?: number | null;
  discount_source?: string | null;
  /** Which settlement closed this session, when the patient is one who pays
   *  after their treatment. Migration-dependent, so a caller reading a
   *  database without it hands through undefined and every session keeps its
   *  own receipt exactly as it always had. */
  pay_later_payment_id?: string | null;
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

function refundOrNull(a: PatientReceiptAppointment): RefundDescription | null {
  const refund = describeRefundForPatient(a);
  return refund.state === "none" ? null : refund;
}

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
  /**
   * What it would have cost, and what came off - shown as its own line
   * rather than folded into the amount.
   *
   * A receipt that silently prints a lower number tells the patient nothing
   * about the fact that they were given something. The whole value of an
   * acquisition offer is that the person knows they received it.
   */
  listPricePaise: number | null;
  discountPaise: number;
  discountLabel: string | null;
  transactionId: string | null;
  date: string; // paid_at, used for sorting/display
  /**
   * The refund on this booking, in the patient's own words, or null where
   * there is nothing to say.
   *
   * Separate from `stage` because the two answer different questions and a
   * refund is no longer only something that happens to a cancelled session:
   * an admin can return part of what was paid for a session that went ahead
   * and was completed, which `stage` has no honest value for. Folding that
   * into the stage would have a delivered session reading "Refunded".
   */
  refund: RefundDescription | null;
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

/**
 * One payment that settled several delivered sessions.
 *
 * **One receipt per payment, not one per session**, and that is the whole
 * reason this kind exists. Four sessions closed by one ₹4,800 transfer would
 * otherwise produce four `booking` receipts, each reading as its own payment
 * -- so a patient who paid once would look at their Payments screen and see
 * four payments. The receipt is the transaction they made and would show
 * somebody, which is one.
 *
 * `sessions` carries the ones this payment **closed**, each at the price
 * agreed on the day it was delivered. Those amounts do not always sum to
 * `amountPaise`, and that is correct rather than sloppy: the pool is
 * fungible, so a session can be closed by money from two payments and is
 * stamped with the one that completed it. A part payment therefore shows the
 * amount received and no sessions yet; the next one shows a smaller amount
 * and the session it finished off. Claiming the two figures tie would be the
 * lie -- what is true is that this is the payment, and these are the sessions
 * it closed.
 */
export type SettlementReceipt = {
  kind: "settlement";
  id: string;
  title: string;
  amountPaise: number;
  method: string;
  reference: string | null;
  /** When the money was confirmed, not when it was declared. */
  date: string;
  sessions: {
    appointmentId: string;
    title: string;
    slotTime: string | null;
    slotTimezone: string | null;
    amountPaise: number;
  }[];
};

export type PatientReceipt = BookingReceipt | PaymentFailedReceipt | SettlementReceipt;

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
export type ReceiptSettlement = {
  id: string;
  amount_paise: number;
  method: string;
  reference: string | null;
  confirmed_at: string | null;
  declared_at: string | null;
};

export function buildPatientReceipts(
  appointments: PatientReceiptAppointment[],
  packagePurchases: ReceiptPackagePurchase[],
  paymentFailures: PaymentFailureRow[],
  categoryTitleById: Map<string, string>,
  /** Confirmed payments this patient made against what they owed. Optional,
   *  so every existing caller is unchanged and a database without the table
   *  simply has none. */
  settlements: ReceiptSettlement[] = []
): PatientReceipt[] {
  const settlementById = new Map(settlements.map((s) => [s.id, s]));

  const bookingReceipts: BookingReceipt[] = appointments
    .filter((a) => a.payment_status === "paid" && a.paid_at)
    // A session closed by a settlement is listed **inside** that settlement's
    // own receipt rather than getting one of its own. Without this a patient
    // who paid once for four sessions reads four payments on this screen.
    // Only when the settlement is actually in hand: a session whose payment
    // row could not be read keeps its own receipt rather than vanishing from
    // the list, since a missing receipt is worse than a duplicated one.
    .filter((a) => !(a.pay_later_payment_id && settlementById.has(a.pay_later_payment_id)))
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
      // Only where something actually came off, and never on a
      // package-covered session - that row charges nothing, so "₹700 off"
      // beside a zero would be nonsense.
      listPricePaise: a.package_purchase_id ? null : a.list_price_paise ?? null,
      discountPaise: a.package_purchase_id ? 0 : a.discount_paise ?? 0,
      discountLabel: a.package_purchase_id
        ? null
        : describeDiscount(
            (a.discount_source as DiscountSource | null) ?? null,
            a.discount_paise ?? 0
          ),
      transactionId: a.razorpay_payment_id,
      date: a.paid_at as string,
      refund: refundOrNull(a),
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
      title: `${p.session_count}-session programme${
        p.category_id && categoryTitleById.has(p.category_id)
          ? `: ${categoryTitleById.get(p.category_id)}`
          : ""
      }`,
      slotTime: null,
      slotTimezone: null,
      amountPaise: p.amount_paid_paise ?? 0,
      listPricePaise: null,
      discountPaise: 0,
      discountLabel: null,
      transactionId: p.razorpay_payment_id,
      date: p.paid_at as string,
      // A package's own refund is recorded against its purchase row and
      // surfaced on the programme, not here. Stated as null rather than
      // guessed from a session's columns it does not have.
      refund: null,
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

  const sessionsBySettlement = new Map<string, SettlementReceipt["sessions"]>();
  for (const a of appointments) {
    const settlementId = a.pay_later_payment_id;
    if (!settlementId || !settlementById.has(settlementId)) continue;
    const list = sessionsBySettlement.get(settlementId) ?? [];
    list.push({
      appointmentId: a.id,
      title: a.concern ?? "General Consultation",
      slotTime: a.slot_time,
      slotTimezone: a.timezone,
      // The price agreed on the day it was delivered, never today's -- the
      // same figure the owed list showed, so a patient settling an old
      // session can see it was not re-priced. Not this payment's share of
      // it: see the note on SettlementReceipt.
      amountPaise: a.amount_paid_paise ?? 0,
    });
    sessionsBySettlement.set(settlementId, list);
  }

  const settlementReceipts: SettlementReceipt[] = settlements.map((s) => {
    const sessions = (sessionsBySettlement.get(s.id) ?? []).sort((a, b) => {
      const at = a.slotTime ? Date.parse(a.slotTime) : 0;
      const bt = b.slotTime ? Date.parse(b.slotTime) : 0;
      return at - bt;
    });
    return {
      kind: "settlement",
      id: s.id,
      title:
        sessions.length === 0
          ? "Payment received"
          : `Payment for ${sessions.length} session${sessions.length === 1 ? "" : "s"}`,
      amountPaise: s.amount_paise,
      method: s.method,
      reference: s.reference,
      // Confirmed rather than declared: the receipt is for money that
      // arrived, and the two dates can be days apart.
      date: s.confirmed_at ?? s.declared_at ?? new Date(0).toISOString(),
      sessions,
    };
  });

  return [
    ...bookingReceipts,
    ...packageReceipts,
    ...failureReceipts,
    ...settlementReceipts,
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
