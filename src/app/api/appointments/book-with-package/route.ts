import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";

const MAX_NOTES_LENGTH = 1000;

export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{
    packagePurchaseId?: string;
    slotDateTime?: string;
    timezone?: string;
    notes?: string;
  }>(request);
  if (parseError) return parseError;
  const { packagePurchaseId, slotDateTime, timezone, notes } = body;

  if (!packagePurchaseId || !slotDateTime) {
    return NextResponse.json(
      { error: "Missing packagePurchaseId or slotDateTime" },
      { status: 400 }
    );
  }
  if (notes && notes.length > MAX_NOTES_LENGTH) {
    return NextResponse.json(
      { error: `Notes must be ${MAX_NOTES_LENGTH} characters or less.` },
      { status: 400 }
    );
  }

  const slotTimestamp = new Date(slotDateTime).getTime();
  if (Number.isNaN(slotTimestamp)) {
    return NextResponse.json({ error: "Invalid slotDateTime" }, { status: 400 });
  }
  if (slotTimestamp <= Date.now()) {
    return NextResponse.json({ error: "The slot must be in the future" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: purchase } = await admin
    .from("patient_package_purchases")
    .select("id, patient_id, category_id, session_count, sessions_used, amount_paid_paise, payment_status")
    .eq("id", packagePurchaseId)
    .single();

  if (!purchase || purchase.patient_id !== user.id) {
    return NextResponse.json({ error: "Package not found" }, { status: 404 });
  }
  if (purchase.payment_status !== "paid") {
    return NextResponse.json({ error: "This package hasn't been paid for." }, { status: 400 });
  }
  if (purchase.sessions_used >= purchase.session_count) {
    return NextResponse.json({ error: "No sessions remaining on this package." }, { status: 400 });
  }

  // Atomically claim one session: only succeeds if sessions_used still
  // matches what was just read, closing the race where two concurrent
  // requests both read "1 remaining" and both try to book it.
  const { data: claimed, error: claimError } = await admin
    .from("patient_package_purchases")
    .update({ sessions_used: purchase.sessions_used + 1 })
    .eq("id", purchase.id)
    .eq("sessions_used", purchase.sessions_used)
    .select("id")
    .maybeSingle();

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json(
      { error: "Could not reserve a package session — please try again." },
      { status: 409 }
    );
  }

  const { data: category } = await admin
    .from("treatment_categories")
    .select("id, title, duration_minutes")
    .eq("id", purchase.category_id)
    .single();

  const durationMinutes = category?.duration_minutes ?? BASE_DURATION_MINUTES;
  const perSessionAmountPaise = purchase.amount_paid_paise
    ? Math.round(purchase.amount_paid_paise / purchase.session_count)
    : 0;

  const { data: appointment, error: insertError } = await admin
    .from("appointments")
    .insert({
      patient_id: user.id,
      slot_time: new Date(slotDateTime).toISOString(),
      timezone: timezone || null,
      concern: category?.title ?? "General Consultation",
      category_id: purchase.category_id,
      duration_minutes: durationMinutes,
      notes: notes || null,
      status: "requested",
      payment_status: "paid",
      amount_paid_paise: perSessionAmountPaise,
      paid_at: new Date().toISOString(),
      package_purchase_id: purchase.id,
    })
    .select("id")
    .single();

  if (insertError || !appointment) {
    // Give the claimed session back — the patient didn't actually get a
    // booking out of it. Re-read the current count and CAS-decrement it
    // (same pattern as the restore in cancelAppointment.ts) rather than
    // blindly overwriting with the pre-claim value, which could clobber
    // a concurrent cancellation/refund on this same package that landed
    // in between the claim above and this rollback.
    const { data: current } = await admin
      .from("patient_package_purchases")
      .select("sessions_used")
      .eq("id", purchase.id)
      .single();
    if (current && current.sessions_used > 0) {
      const { error: revertError } = await admin
        .from("patient_package_purchases")
        .update({ sessions_used: current.sessions_used - 1 })
        .eq("id", purchase.id)
        .eq("sessions_used", current.sessions_used);
      if (revertError) {
        console.error(
          "Failed to revert claimed package session for purchase",
          purchase.id,
          revertError
        );
      }
    }
    return NextResponse.json(
      { error: insertError?.message ?? "Could not book this session. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, appointmentId: appointment.id });
}
