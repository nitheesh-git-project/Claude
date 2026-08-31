import { loadRazorpayScript } from "@/lib/razorpay";

type PayForCarePlanArgs = {
  carePlanVersionId: string;
  name: string;
  email: string;
  description: string;
  onSuccess: () => void;
  onError: (message: string) => void;
  onDismiss: () => void;
};

/**
 * Buying the plan a therapist recommended.
 *
 * Deliberately the thinnest possible client: the body carries one id.
 * Price, session count and validity are all resolved server-side from the
 * catalog row the recommendation names, so there is nothing here worth
 * tampering with.
 *
 * Structured like payForPackage, including the inner try/catch around the
 * verify call: that handler runs after Razorpay has already taken the
 * patient's money, outside the outer catch, so a raw network failure there
 * would otherwise be an unhandled rejection leaving someone who has just
 * paid staring at a spinner.
 */
export async function payForCarePlan({
  carePlanVersionId,
  name,
  email,
  description,
  onSuccess,
  onError,
  onDismiss,
}: PayForCarePlanArgs) {
  try {
    await loadRazorpayScript();

    const res = await fetch("/api/care-plan/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carePlanVersionId }),
    });
    const orderData = await res.json().catch(() => ({}));

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
        try {
          const verifyRes = await fetch("/api/care-plan/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              purchaseId: orderData.purchaseId,
              offerKind: orderData.offerKind,
              ...response,
            }),
          });
          const verifyData = await verifyRes.json().catch(() => ({}));
          if (verifyRes.ok) {
            onSuccess();
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
      modal: { ondismiss: () => onDismiss() },
    });

    razorpay.open();
  } catch {
    onError("Could not open the payment window. Please try again.");
  }
}
