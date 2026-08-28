import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * The result `record_payment_capture` returns. `applied: false` with
 * `alreadyCaptured: true` is the ordinary duplicate answer, not an error --
 * it means some other caller (the webhook, or the browser callback, or a
 * retry of either) already did this work.
 */
export type PaymentCaptureResult = {
  applied: boolean;
  alreadyCaptured: boolean;
  targetUpdated?: boolean;
  appointmentStatus?: string | null;
  paymentId?: string;
  purpose?: string;
  targetAppointmentId?: string | null;
  targetPackagePurchaseId?: string | null;
  targetHomeVisitPurchaseId?: string | null;
};

/**
 * Records a captured Razorpay payment, exactly once.
 *
 * Every path that learns a payment succeeded goes through here: the three
 * browser-callback verify routes, and the webhook. The work itself is a
 * database function (`record_payment_capture` in schema.sql) because it has
 * to move a `payments` row and the row it paid for together, under a real
 * `select ... for update`. supabase-js cannot express a transaction, which
 * is why the existing routes could only ever compare-and-swap one column.
 *
 * Idempotent by construction: the second caller for a given order finds the
 * payment already captured and changes nothing. That covers a duplicate
 * webhook, Razorpay's at-least-once retries, a webhook racing the browser
 * callback, and a double-clicked Pay button, without any of them knowing
 * about each other.
 *
 * Never throws. A caller in a verify route has already taken the patient's
 * money by the time it reaches this, so a failure to write the payments row
 * must be loud in the server log and invisible to the patient -- the money
 * itself is recorded on the appointment/purchase by that route's own write,
 * exactly as it was before this table existed.
 */
export async function recordPaymentCapture(
  admin: AdminClient,
  {
    orderId,
    paymentId,
    amountPaise,
    raw,
  }: {
    orderId: string;
    paymentId: string;
    amountPaise?: number | null;
    raw?: unknown;
  }
): Promise<PaymentCaptureResult | null> {
  try {
    const { data, error } = await admin.rpc("record_payment_capture", {
      p_order_id: orderId,
      p_payment_id: paymentId,
      p_amount_paise: amountPaise ?? null,
      p_raw: raw ?? null,
    });

    if (error) {
      console.error("record_payment_capture failed", orderId, paymentId, error.message);
      return null;
    }

    const row = data as Record<string, unknown> | null;
    if (!row) return null;

    return {
      applied: row.applied === true,
      alreadyCaptured: row.already_captured === true,
      targetUpdated: row.target_updated === true,
      appointmentStatus: (row.appointment_status as string | null) ?? null,
      paymentId: row.payment_id as string | undefined,
      purpose: row.purpose as string | undefined,
      targetAppointmentId: (row.target_appointment_id as string | null) ?? null,
      targetPackagePurchaseId: (row.target_package_purchase_id as string | null) ?? null,
      targetHomeVisitPurchaseId: (row.target_home_visit_purchase_id as string | null) ?? null,
    };
  } catch (err) {
    console.error("record_payment_capture threw", orderId, paymentId, err);
    return null;
  }
}
