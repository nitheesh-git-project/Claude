import { loadRazorpayScript } from "@/lib/razorpay";

export type PackagePaymentResult = {
  sessionBooked: boolean;
  appointmentId?: string;
  sessionBookingError?: string;
};

type PayForPackageArgs = {
  packageId: string;
  name: string;
  email: string;
  description: string;
  // Present only in the booking wizard's package-purchase flow, where
  // Step 1 already picked session 1's slot before checkout opened. Omit
  // entirely for a plain "buy now, schedule later" purchase (the dashboard's
  // BuyPackageButton) -- verify then just marks the purchase paid.
  slotDateTime?: string;
  timezone?: string;
  notes?: string;
  preferredTherapistId?: string;
  onSuccess: (result: PackagePaymentResult) => void;
  onError: (message: string) => void;
  onDismiss: () => void;
};

/** Creates a Razorpay order for a session package and opens Checkout. */
export async function payForPackage({
  packageId,
  name,
  email,
  description,
  slotDateTime,
  timezone,
  notes,
  preferredTherapistId,
  onSuccess,
  onError,
  onDismiss,
}: PayForPackageArgs) {
  try {
    await loadRazorpayScript();

    const res = await fetch("/api/packages/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageId }),
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
        // This runs after Razorpay has already taken the patient's money,
        // outside the outer try/catch above -- a raw network failure on
        // this fetch (not just a non-2xx response) would otherwise throw
        // as an unhandled rejection, leaving the caller's loading state
        // stuck forever with no error shown to someone who just paid.
        try {
          const verifyRes = await fetch("/api/packages/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              packagePurchaseId: orderData.packagePurchaseId,
              slotDateTime,
              timezone,
              notes,
              preferredTherapistId,
              ...response,
            }),
          });
          const verifyData = await verifyRes.json().catch(() => ({}));
          if (verifyRes.ok) {
            onSuccess({
              sessionBooked: !!verifyData.sessionBooked,
              appointmentId: verifyData.appointmentId,
              sessionBookingError: verifyData.sessionBookingError,
            });
          } else {
            onError(
              verifyData.error
                ? `Payment received but verification failed: ${verifyData.error}`
                : `Payment received but verification failed. Please contact us with payment ID ${response.razorpay_payment_id}.`
            );
          }
        } catch {
          onError(
            `Payment received but we couldn't verify it — please check your connection and contact us with payment ID ${response.razorpay_payment_id} if this doesn't resolve.`
          );
        }
      },
      modal: {
        ondismiss: () => {
          onDismiss();
        },
      },
    });

    // See payForAppointment's matching comment in src/lib/razorpay.ts --
    // same reasoning, just logged against the package purchase instead of
    // an appointment.
    razorpay.on("payment.failed", (response) => {
      const err = response?.error ?? {};
      fetch("/api/razorpay/log-payment-failure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packagePurchaseId: orderData.packagePurchaseId,
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
    onError(
      "Could not load the payment gateway. Please check your connection and try again."
    );
  }
}
