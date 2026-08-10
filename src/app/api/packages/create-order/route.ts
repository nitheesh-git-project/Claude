import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActiveAndApproved } from "@/lib/supabase/requireActiveProfile";

// Unlike a regular appointment (created client-side, then paid for),
// there's no meaningful "unpaid" state for a package purchase — so this
// route creates both the purchase row and the Razorpay order together,
// entirely server-side, the moment checkout starts.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{ packageId?: string }>(
    request
  );
  if (parseError) return parseError;
  const { packageId } = body;
  if (!packageId) {
    return NextResponse.json({ error: "Missing packageId" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!(await isProfileActiveAndApproved(user.id))) {
    return NextResponse.json({ error: "Your account is not active — it is either awaiting admin approval or has been suspended." }, { status: 403 });
  }

  const admin = createAdminClient();
  const [{ data: pkg }, { data: settingsRow }] = await Promise.all([
    admin
      .from("treatment_category_packages")
      .select("id, category_id, session_count, price_paise, active")
      .eq("id", packageId)
      .single(),
    admin.from("site_settings").select("session_packages_visible").maybeSingle(),
  ]);

  // The admin's global kill switch (Session Manager → Settings) wasn't
  // enforced here before -- it only hid the UI, so a direct POST could
  // still buy a package while packages were supposedly "Hidden". Now it's
  // the same hard gate the UI already implies.
  if (settingsRow?.session_packages_visible === false) {
    return NextResponse.json({ error: "Session packages aren't available right now." }, { status: 403 });
  }
  if (!pkg || !pkg.active) {
    return NextResponse.json({ error: "That package isn't available." }, { status: 400 });
  }

  const { data: purchase, error: insertError } = await admin
    .from("patient_package_purchases")
    .insert({
      patient_id: user.id,
      package_id: pkg.id,
      category_id: pkg.category_id,
      session_count: pkg.session_count,
      amount_paid_paise: pkg.price_paise,
    })
    .select("id")
    .single();

  if (insertError || !purchase) {
    console.error("Failed to create package purchase row", insertError);
    return NextResponse.json(
      { error: "Could not start payment. Please try again." },
      { status: 500 }
    );
  }

  const razorpay = new Razorpay({
    key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });

  const order = await razorpay.orders.create({
    amount: pkg.price_paise,
    currency: "INR",
    receipt: purchase.id,
  });

  const { error: updateError } = await admin
    .from("patient_package_purchases")
    .update({ razorpay_order_id: order.id })
    .eq("id", purchase.id);

  if (updateError) {
    console.error(
      "Failed to save razorpay_order_id for package purchase",
      purchase.id,
      updateError
    );
    return NextResponse.json(
      { error: "Could not start payment. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    packagePurchaseId: purchase.id,
  });
}
