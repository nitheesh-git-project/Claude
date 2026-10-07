import Razorpay from "razorpay";

/**
 * Whether Razorpay holds a completed payment for an order: `true` / `false`,
 * or `null` when the question could not be asked (keys missing, network,
 * Razorpay down). A caller must treat `null` as "could not check", never as
 * "not paid" -- cancelling a booking somebody paid for is the outcome this
 * exists to prevent.
 */
export async function razorpayOrderIsPaid(orderId: string): Promise<boolean | null> {
  try {
    const razorpay = new Razorpay({
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });
    const order = await razorpay.orders.fetch(orderId);
    if (order.status === "paid") return true;
    // An "attempted" order can still hold a captured or authorized payment
    // whose webhook has not landed yet.
    if (order.status === "attempted") {
      const payments = await razorpay.orders.fetchPayments(orderId);
      return payments.items.some((p) => p.status === "captured" || p.status === "authorized");
    }
    return false;
  } catch (err) {
    console.error("Could not read Razorpay order", orderId, err);
    return null;
  }
}
