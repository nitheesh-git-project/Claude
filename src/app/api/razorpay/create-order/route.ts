import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SESSION_FEE_PAISE } from "@/lib/pricing";

// The amount is always resolved here, server-side, from the appointment's
// linked category price (or the flat base fee) — never trust an amount
// sent from the browser, or anyone could pay whatever they want.

export async function POST(request: NextRequest) {
  const { appointmentId } = await request.json();
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // RLS also enforces this (patients can only select their own rows), but
  // we check explicitly so a mismatched appointment gives a clear 404.
  const { data: appointment } = await supabase
    .from("appointments")
    .select("id, patient_id, payment_status, category_id")
    .eq("id", appointmentId)
    .eq("patient_id", user.id)
    .single();

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.payment_status === "paid") {
    return NextResponse.json({ error: "This booking is already paid" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Resolve the real price for what was actually booked. Looked up via the
  // admin client (not the active-only public policy) so that if a category
  // gets deactivated after this appointment was created, the patient is
  // still charged the price they originally saw — not silently bumped to
  // the flat fallback fee. No category (e.g. a hospital-referred booking)
  // charges the flat base fee.
  let amountPaise = SESSION_FEE_PAISE;
  if (appointment.category_id) {
    const { data: category } = await admin
      .from("treatment_categories")
      .select("price_paise")
      .eq("id", appointment.category_id)
      .single();
    if (category) {
      amountPaise = category.price_paise;
    }
  }

  const razorpay = new Razorpay({
    key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });

  const order = await razorpay.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: appointmentId,
  });

  const { error: updateError } = await admin
    .from("appointments")
    .update({ razorpay_order_id: order.id, amount_paid_paise: amountPaise })
    .eq("id", appointmentId);

  if (updateError) {
    // If this doesn't save, /api/razorpay/verify's order-id match check
    // would reject an otherwise-legitimate payment later — fail now,
    // before the patient is sent to checkout, rather than after they pay.
    console.error("Failed to save razorpay_order_id for appointment", appointmentId, updateError);
    return NextResponse.json(
      { error: "Could not start payment. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
  });
}
