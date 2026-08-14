declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: "payment.failed", handler: (response: { error?: Record<string, unknown> }) => void) => void;
    };
  }
}

function loadRazorpayScriptOnce(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error("Could not load the payment gateway."));
    };
    document.body.appendChild(script);
  });
}

const RAZORPAY_SCRIPT_LOAD_RETRIES = 2;

// Cached across calls so two payment attempts in flight at once (e.g. a
// fast double-click on "Pay Now") share one script load instead of racing
// to append multiple <script> tags. Cleared on failure (not left as a
// cached rejection) so a later retry gets a clean attempt rather than
// instantly failing forever on the first flaky load.
let razorpayScriptPromise: Promise<void> | null = null;

export function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) {
    return Promise.resolve();
  }
  if (razorpayScriptPromise) {
    return razorpayScriptPromise;
  }

  razorpayScriptPromise = (async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= RAZORPAY_SCRIPT_LOAD_RETRIES; attempt++) {
      try {
        await loadRazorpayScriptOnce();
        return;
      } catch (err) {
        lastError = err;
        if (attempt < RAZORPAY_SCRIPT_LOAD_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
    }
    throw lastError;
  })();

  razorpayScriptPromise.catch(() => {
    razorpayScriptPromise = null;
  });

  return razorpayScriptPromise;
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
    if (orderData.alreadyPaid) {
      // A prior checkout attempt for this same appointment already
      // succeeded with Razorpay (the browser likely closed before our own
      // /verify callback landed) — the server has just recorded that
      // payment, so there's nothing left to check out for.
      onSuccess();
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
        // This callback runs after Razorpay has already taken the
        // patient's money, outside the outer try/catch above (that only
        // covers the synchronous setup before razorpay.open()) -- a raw
        // network failure on this fetch (not just a non-2xx response)
        // would otherwise throw as an unhandled rejection, leaving the
        // caller's loading state stuck forever with no error shown to
        // someone who just paid. Never let that happen silently.
        try {
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
