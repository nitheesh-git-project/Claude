import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";

export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{
    packagePurchaseId?: string;
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  }>(request);
  if (parseError) return parseError;
  const { packagePurchaseId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

  if (!packagePurchaseId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ error: "Missing payment details" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: purchase } = await admin
    .from("patient_package_purchases")
    .select("id, patient_id, razorpay_order_id")
    .eq("id", packagePurchaseId)
    .single();

  if (!purchase || purchase.patient_id !== user.id) {
    return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  }
  if (purchase.razorpay_order_id !== razorpay_order_id) {
    return NextResponse.json({ error: "Order mismatch" }, { status: 400 });
  }

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  const signatureValid =
    expectedSignature.length === razorpay_signature.length &&
    crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(razorpay_signature)
    );

  if (!signatureValid) {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 });
  }

  const { error: updateError } = await admin
    .from("patient_package_purchases")
    .update({
      payment_status: "paid",
      razorpay_payment_id,
      paid_at: new Date().toISOString(),
    })
    .eq("id", packagePurchaseId);

  if (updateError) {
    console.error("Failed to record payment for package purchase", packagePurchaseId, updateError);
    return NextResponse.json(
      { error: "Could not record the payment. Please contact us." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
