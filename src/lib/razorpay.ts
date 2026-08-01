declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: "payment.failed", handler: (response: { error?: Record<string, unknown> }) => void) => void;
    };
  }
}

export function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the payment gateway."));
    document.body.appendChild(script);
  });
}

type PayForAppointmentArgs = {
  appointmentId: string;
  name: string;
  email: string;
  description: string;
  onSuccess: () => void;
  onError: (message: string) => void;
  onDismiss: () => void;
};

/** Creates a Razorpay order for an existing appointment and opens Checkout. */
export async function payForAppointment({
  appointmentId,
  name,
  email,
  description,
  onSuccess,
  onError,
  onDismiss,
}: PayForAppointmentArgs) {
  try {
    await loadRazorpayScript();

    const res = await fetch("/api/razorpay/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId }),
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
        const verifyRes = await fetch("/api/razorpay/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appointmentId, ...response }),
        });
        if (verifyRes.ok) {
          onSuccess();
        } else {
          const verifyData = await verifyRes.json().catch(() => ({}));
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

    // Razorpay's own `payment.failed` event -- a genuine failure (declined
    // card, bank timeout), not just the user closing the checkout modal
    // (that's `ondismiss`, handled separately, and isn't logged as a
    // failure since nothing was actually attempted). Razorpay's own
    // checkout UI already communicates the failure to the patient in the
    // moment, so this only needs to log it for the receipt -- not also
    // call onError. Best-effort: the log call's own failure is swallowed
    // rather than surfaced, since losing this notification should never
    // block or confuse the payment flow itself.
    razorpay.on("payment.failed", (response) => {
      const err = response?.error ?? {};
      fetch("/api/razorpay/log-payment-failure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId,
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
