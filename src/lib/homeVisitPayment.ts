import { loadRazorpayScript } from "@/lib/razorpay";
import type { HomeVisitAddressInput } from "@/lib/bookHomeVisitSession";

export type HomeVisitPaymentResult = {
  visitBooked: boolean;
  appointmentId?: string;
  visitBookingError?: string;
};

// What the wizard collects and hands over. Deliberately camelCase and
// separate from bookHomeVisitSession's snake_case shape -- this is the wire
// format the routes parse, not the column names.
export type HomeVisitAddressForm = {
  id?: string | null;
  label?: string | null;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city?: string | null;
  state?: string | null;
  pincode: string;
  latitude?: number | null;
  longitude?: number | null;
  mapPlaceId?: string | null;
  contactPhone?: string | null;
  accessNotes?: string | null;
  saveToAddressBook?: boolean;
};

type PayForHomeVisitArgs = {
  packageId: string;
  address: HomeVisitAddressForm;
  name: string;
  email: string;
  description: string;
  slotDateTime?: string;
  timezone?: string;
  notes?: string;
  concern?: string;
  onSuccess: (result: HomeVisitPaymentResult) => void;
  onError: (message: string) => void;
  onDismiss: () => void;
};

/**
 * Creates a Razorpay order for a home visit package and opens Checkout.
 *
 * Mirrors payForPackage() in packagePayment.ts. The one meaningful
 * difference is the address: it goes up with the order rather than only
 * with the verify call, because the server needs it to resolve the pincode's
 * travel fee -- which is part of the amount charged, and therefore has to be
 * decided before Checkout opens, never after.
 */
export async function payForHomeVisit({
  packageId,
  address,
  name,
  email,
  description,
  slotDateTime,
  timezone,
  notes,
  concern,
  onSuccess,
  onError,
  onDismiss,
}: PayForHomeVisitArgs) {
  try {
    await loadRazorpayScript();

    const res = await fetch("/api/home-visit/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageId, address }),
    });
    const orderData = await res.json();

    if (!res.ok) {
      onError(orderData.error ?? "Could not start payment. Please try again.");
      return;
    }

    const razorpay = new window.Razorpay({
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      amount: orderData.amount,
      currency: orderData.currency,
      order_id: orderData.orderId,
      name: "Dr. Pooja's Physio",
      description,
      prefill: { name, email },
      theme: { color: "#0f766e" },
      handler: async (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        const verifyRes = await fetch("/api/home-visit/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            homeVisitPurchaseId: orderData.homeVisitPurchaseId,
            slotDateTime,
            timezone,
            notes,
            concern,
            // The id create-order just wrote, so verify re-reads the copy
            // that actually passed the serviceability check rather than
            // trusting this payload again.
            address: { ...address, id: orderData.addressId ?? address.id ?? null },
            ...response,
          }),
        });
        const verifyData = await verifyRes.json().catch(() => ({}));
        if (verifyRes.ok) {
          onSuccess({
            visitBooked: !!verifyData.visitBooked,
            appointmentId: verifyData.appointmentId,
            visitBookingError: verifyData.visitBookingError,
          });
        } else {
          onError(
            verifyData.error
              ? `Payment received but verification failed: ${verifyData.error}`
              : `Payment received but verification failed. Please contact us with payment ID ${response.razorpay_payment_id}.`
          );
        }
      },
      modal: {
        ondismiss: () => {
          onDismiss();
        },
      },
    });

    // Same reasoning as payForAppointment/payForPackage -- a failed payment
    // is logged against the purchase so the admin can reconcile it.
    razorpay.on("payment.failed", (response) => {
      const err = response?.error ?? {};
      fetch("/api/razorpay/log-payment-failure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeVisitPurchaseId: orderData.homeVisitPurchaseId,
          amountPaise: orderData.amount,
          razorpayOrderId: err.metadata && (err.metadata as Record<string, unknown>).order_id,
          razorpayPaymentId: err.metadata && (err.metadata as Record<string, unknown>).payment_id,
          errorCode: err.code,
          errorReason: err.reason,
          errorDescription: err.description,
        }),
      }).catch(() => {});
    });

    razorpay.open();
  } catch {
    onError("Could not load the payment gateway. Please check your connection and try again.");
  }
}

// Re-exported so the wizard imports one address shape, not two.
export type { HomeVisitAddressInput };
