import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { computePerVisitFeePaise } from "@/lib/homeVisitPricing";

// The therapist confirming they took payment at the door. This is the one
// moment a cash-on-visit appointment actually becomes "paid" -- until now
// payment_status has legitimately sat at 'unpaid' with a real, confirmed
// visit attached, which is the whole point of the cash flow. Flipping it
// here (rather than leaving it unpaid forever) is what lets this session
// flow into the same completed+paid pipeline every earnings and payout
// calculation already reads.
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

  // The body carries an appointment id and nothing else.
  //
  // It used to accept `amountPaise` as an override, which meant the person
  // holding the cash also decided how much of it the clinic knew about --
  // and that figure nets directly off what therapistCashLedger says they
  // owe, so under-reporting was a one-field withdrawal. The therapist
  // asserts that money changed hands; the system owns the number. An amount
  // that genuinely differs from the quoted price is a correction, and a
  // correction is an admin's to make, with a reason, through
  // /api/admin/correct-cash-amount.
  const { data: body, error: parseError } = await parseJsonBody<{
    appointmentId?: string;
  }>(request);
  if (parseError) return parseError;

  const { appointmentId } = body;
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, active, approved")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "therapist") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (profile.active === false || profile.approved === false) {
    return NextResponse.json(
      { error: "Your account is not active." },
      { status: 403 }
    );
  }

  const { data: appointment } = await admin
    .from("appointments")
    .select(
      "id, therapist_id, visit_mode, payment_method, payment_status, cash_collected_at, home_visit_purchase_id, travel_fee_paise, status"
    )
    .eq("id", appointmentId)
    .single();

  if (!appointment || appointment.therapist_id !== user.id) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }
  if (appointment.visit_mode !== "home_visit" || appointment.payment_method !== "cash") {
    return NextResponse.json(
      { error: "This session isn't a cash-on-visit home visit." },
      { status: 400 }
    );
  }
  if (appointment.status === "cancelled") {
    return NextResponse.json(
      { error: "This visit has been cancelled." },
      { status: 400 }
    );
  }

  // Reconstructed from the purchase, the same per-visit math
  // bookHomeVisitSession used when the appointment was created. This is the
  // only place the figure comes from.
  let perVisitFeePaise = 0;
  if (appointment.home_visit_purchase_id) {
    const { data: purchase } = await admin
      .from("home_visit_package_purchases")
      .select("amount_paid_paise, visit_count")
      .eq("id", appointment.home_visit_purchase_id)
      .maybeSingle();
    if (purchase) {
      perVisitFeePaise = computePerVisitFeePaise(purchase.amount_paid_paise, purchase.visit_count);
    }
  }
  const amountPaise = perVisitFeePaise + Math.max(0, appointment.travel_fee_paise ?? 0);

  // Atomic claim: only the first collection sticks. Without this, a
  // therapist double-tapping the button (or the request retrying after a
  // dropped response) could overwrite an earlier, possibly different
  // amount with no trace of which figure was actually collected.
  const { data: claimed, error } = await admin
    .from("appointments")
    .update({
      cash_collected_at: new Date().toISOString(),
      cash_collected_amount_paise: amountPaise,
      cash_collected_by: user.id,
      payment_status: "paid",
      amount_paid_paise:
        amountPaise - Math.max(0, appointment.travel_fee_paise ?? 0) >= 0
          ? amountPaise - Math.max(0, appointment.travel_fee_paise ?? 0)
          : amountPaise,
      paid_at: new Date().toISOString(),
    })
    .eq("id", appointmentId)
    .is("cash_collected_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json(
      { error: "This visit's payment has already been recorded." },
      { status: 409 }
    );
  }

  if (appointment.home_visit_purchase_id) {
    try {
      await admin.from("home_visit_purchase_events").insert({
        purchase_id: appointment.home_visit_purchase_id,
        event_type: "cash_collected",
        actor_id: user.id,
        appointment_id: appointmentId,
        detail: { amountPaise },
      });
    } catch (eventError) {
      console.error("Failed to log cash_collected event", appointmentId, eventError);
    }
  }

  return NextResponse.json({ success: true, amountPaise });
}
