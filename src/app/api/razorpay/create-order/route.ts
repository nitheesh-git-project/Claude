import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Session fee is fixed here, server-side — never trust an amount sent
// from the browser, or anyone could pay whatever they want.
const SESSION_FEE_PAISE = 199900; // ₹1,999.00

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
    .select("id, patient_id, payment_status")
    .eq("id", appointmentId)
    .eq("patient_id", user.id)
    .single();

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.payment_status === "paid") {
    return NextResponse.json({ error: "This booking is already paid" }, { status: 400 });
  }

  const razorpay = new Razorpay({
    key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });

  const order = await razorpay.orders.create({
    amount: SESSION_FEE_PAISE,
    currency: "INR",
    receipt: appointmentId,
  });

  const admin = createAdminClient();
  await admin
    .from("appointments")
    .update({ razorpay_order_id: order.id })
    .eq("id", appointmentId);

  return NextResponse.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
  });
}
