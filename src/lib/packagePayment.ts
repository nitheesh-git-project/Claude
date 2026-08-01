import { loadRazorpayScript } from "@/lib/razorpay";

type PayForPackageArgs = {
  packageId: string;
  name: string;
  email: string;
  description: string;
  onSuccess: () => void;
  onError: (message: string) => void;
  onDismiss: () => void;
};

/** Creates a Razorpay order for a session package and opens Checkout. */
export async function payForPackage({
  packageId,
  name,
  email,
  description,
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
        const verifyRes = await fetch("/api/packages/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packagePurchaseId: orderData.packagePurchaseId,
            ...response,
          }),
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
