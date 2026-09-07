import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";

const MAX_TEXT_LENGTH = 500;

function truncate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.slice(0, MAX_TEXT_LENGTH);
}

// Called from the browser the moment Razorpay Checkout's own
// `payment.failed` event fires (declined card, bank timeout, etc.) --
// this is the one path in the whole payment flow where the server never
// otherwise learns anything happened, since a failed checkout never
// reaches /api/razorpay/verify or /api/packages/verify at all. Best-effort
// by nature: a patient who abandons the browser mid-failure, or whose
// network drops before this call lands, won't get a logged receipt for
// that specific attempt -- accepted for a v1 that's informational only,
// not a payment-reconciliation system.
export async function POST(request: NextRequest) {
  // Who is asking, before anything the caller sent is looked at. An
  // anonymous request is refused here rather than after body validation,
  // so an unauthenticated caller never drives this route's parsing and is
  // never told what shape the request should have been.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    appointmentId?: string;
    packagePurchaseId?: string;
    homeVisitPurchaseId?: string;
    amountPaise?: number;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    errorCode?: string;
    errorReason?: string;
    errorDescription?: string;
  }>(request);
  if (parseError) return parseError;

  const { appointmentId, packagePurchaseId, homeVisitPurchaseId } = body;
  const provided = [appointmentId, packagePurchaseId, homeVisitPurchaseId].filter(Boolean);
  if (provided.length === 0) {
    return NextResponse.json(
      { error: "Missing appointmentId, packagePurchaseId or homeVisitPurchaseId" },
      { status: 400 }
    );
  }
  if (provided.length > 1) {
    return NextResponse.json(
      {
        error:
          "Only one of appointmentId, packagePurchaseId or homeVisitPurchaseId is expected",
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Verify ownership before logging anything against this id -- a patient
  // reporting a failure can only ever be reporting their own attempt.
  if (appointmentId) {
    const { data: appointment } = await admin
      .from("appointments")
      .select("id, patient_id")
      .eq("id", appointmentId)
      .single();
    if (!appointment || appointment.patient_id !== user.id) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }
  } else if (packagePurchaseId) {
    const { data: purchase } = await admin
      .from("patient_package_purchases")
      .select("id, patient_id")
      .eq("id", packagePurchaseId)
      .single();
    if (!purchase || purchase.patient_id !== user.id) {
      return NextResponse.json({ error: "Package purchase not found" }, { status: 404 });
    }
  } else if (homeVisitPurchaseId) {
    const { data: purchase } = await admin
      .from("home_visit_package_purchases")
      .select("id, patient_id")
      .eq("id", homeVisitPurchaseId)
      .single();
    if (!purchase || purchase.patient_id !== user.id) {
      return NextResponse.json({ error: "Home visit purchase not found" }, { status: 404 });
    }
  }

  const { error } = await admin.from("payment_failure_log").insert({
    patient_id: user.id,
    appointment_id: appointmentId ?? null,
    package_purchase_id: packagePurchaseId ?? null,
    home_visit_purchase_id: homeVisitPurchaseId ?? null,
    amount_paise:
      typeof body.amountPaise === "number" && Number.isFinite(body.amountPaise)
        ? body.amountPaise
        : null,
    razorpay_order_id: truncate(body.razorpayOrderId),
    razorpay_payment_id: truncate(body.razorpayPaymentId),
    error_code: truncate(body.errorCode),
    error_reason: truncate(body.errorReason),
    error_description: truncate(body.errorDescription),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
