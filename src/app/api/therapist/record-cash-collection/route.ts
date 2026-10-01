import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { computePerVisitFeePaise } from "@/lib/homeVisitPricing";
import { serverError } from "@/lib/apiError";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { profileCheckUnavailable } from "@/lib/supabase/requireActiveProfile";

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
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role, active, approved")
    .eq("id", user.id)
    .single();
  if (profileError && profileError.code !== "PGRST116") return profileCheckUnavailable();
  if (profile?.role !== "therapist") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (profile.active === false || profile.approved === false) {
    return NextResponse.json(
      { error: "Your account is not active." },
      { status: 403 }
    );
  }

  const { data: appointment, error: appointmentError } = await admin
    .from("appointments")
    .select(
      "id, therapist_id, visit_mode, payment_method, payment_status, cash_collected_at, home_visit_purchase_id, travel_fee_paise, status, slot_time"
    )
    .eq("id", appointmentId)
    .maybeSingle();
  if (appointmentError) {
    return NextResponse.json(
      { error: "We couldn't read this visit just now. Nothing was recorded -- please try again." },
      { status: 503 }
    );
  }

  if (!appointment || appointment.therapist_id !== user.id) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }
  if (appointment.visit_mode !== "home_visit" || appointment.payment_method !== "cash") {
    return NextResponse.json(
      { error: "This session isn't a cash-on-visit home visit." },
      { status: 400 }
    );
  }
  // Cash changes hands at the visit. A requested visit has not been
  // confirmed, and one that has not reached its join window has not
  // happened -- recording cash for either marked an undelivered visit paid
  // (and made it look ready to close). A completed visit is still allowed:
  // closing one needs the cash recorded first, so a completed, unrecorded
  // cash visit is an admin's correction finishing what the therapist began.
  if (appointment.status !== "confirmed" && appointment.status !== "completed") {
    return NextResponse.json(
      {
        error:
          appointment.status === "cancelled"
            ? "This visit has been cancelled."
            : "This visit hasn't been confirmed yet, so there's no payment to record.",
      },
      { status: 400 }
    );
  }
  if (appointment.status === "confirmed") {
    const { data: settingsRow } = await admin
      .from("site_settings")
      .select(SITE_SETTINGS_SELECT)
      .maybeSingle();
    const joinWindowMinutes = parseAdminSettings(settingsRow).joinWindowMinutes;
    const opensAt = new Date(appointment.slot_time).getTime() - joinWindowMinutes * 60_000;
    if (!appointment.slot_time || Date.now() < opensAt) {
      return NextResponse.json(
        { error: "You can record the payment once the visit is under way." },
        { status: 409 }
      );
    }
  }

  // Reconstructed from the purchase, the same per-visit math
  // bookHomeVisitSession used when the appointment was created. This is the
  // only place the figure comes from -- so if it cannot be read, nothing is
  // recorded. It used to fall back to a fee of zero and still mark the visit
  // paid, for the travel fee alone or for nothing at all.
  if (!appointment.home_visit_purchase_id) {
    return NextResponse.json(
      { error: "This visit has no price on record. Ask the clinic to record the payment." },
      { status: 409 }
    );
  }
  const { data: purchase, error: purchaseError } = await admin
    .from("home_visit_package_purchases")
    .select("amount_paid_paise, visit_count")
    .eq("id", appointment.home_visit_purchase_id)
    .maybeSingle();
  if (purchaseError) {
    return NextResponse.json(
      { error: "We couldn't read this visit's price just now. Nothing was recorded -- please try again." },
      { status: 503 }
    );
  }
  if (!purchase) {
    return NextResponse.json(
      { error: "This visit has no price on record. Ask the clinic to record the payment." },
      { status: 409 }
    );
  }
  const perVisitFeePaise = computePerVisitFeePaise(purchase.amount_paid_paise, purchase.visit_count);
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
    // Re-checked in the write itself: a visit cancelled between the read
    // above and this claim must not be marked paid.
    .in("status", ["confirmed", "completed"])
    .select("id")
    .maybeSingle();

  if (error) {
    return serverError("therapist/record-cash-collection", error);
  }
  if (!claimed) {
    return NextResponse.json(
      { error: "This visit changed a moment ago -- its payment is already recorded or it was cancelled. Refresh to see it." },
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
