import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { findTherapistConflict } from "@/lib/checkTherapistConflict";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { leadTimeMsFromHours } from "@/lib/bookingSlots";
import { sessionsRemaining } from "@/lib/sessionSuggestions";

const MAX_NOTE_LENGTH = 500;

// A therapist proposing a time to one of their programme patients.
//
// This creates a suggestion, never an appointment: nothing is scheduled and
// no package session is consumed until the patient accepts (see the table's
// own comment in schema.sql for why that distinction is load-bearing). The
// therapist's slot is not held either -- availability is re-checked at
// acceptance instead, so there is nothing to release and no sweep to run.
//
// The checks here are advisory in the sense that acceptance re-runs them:
// what matters is that a therapist is not invited to suggest a time that is
// already impossible, and that they cannot suggest against a purchase that
// is not theirs.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{
    purchaseId?: string;
    slotTime?: string;
    timezone?: string;
    note?: string;
  }>(request);
  if (parseError) return parseError;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    return NextResponse.json({ error: "Your account is not active." }, { status: 403 });
  }

  const { data: settingsRow } = await admin
    .from("site_settings")
    .select(SITE_SETTINGS_SELECT)
    .maybeSingle();
  const settings = parseAdminSettings(settingsRow);
  // Read in its own call rather than through SITE_SETTINGS_SELECT so a
  // database that has not run the latest schema.sql fails closed (the
  // column is missing, the feature is off) instead of failing the whole
  // settings read.
  const { data: toggleRow } = await admin
    .from("site_settings")
    .select("therapist_suggestions_enabled")
    .maybeSingle();
  if (toggleRow?.therapist_suggestions_enabled !== true) {
    return NextResponse.json(
      { error: "Suggesting sessions is switched off." },
      { status: 403 }
    );
  }

  const purchaseId = body.purchaseId?.trim();
  const slotTime = body.slotTime?.trim();
  const note = body.note?.trim() ?? "";
  if (!purchaseId) {
    return NextResponse.json({ error: "Choose a programme." }, { status: 400 });
  }
  if (!slotTime) {
    return NextResponse.json({ error: "Choose a date and time." }, { status: 400 });
  }
  if (note.length > MAX_NOTE_LENGTH) {
    return NextResponse.json(
      { error: `Your note must be ${MAX_NOTE_LENGTH} characters or less.` },
      { status: 400 }
    );
  }

  const slotMs = new Date(slotTime).getTime();
  if (Number.isNaN(slotMs)) {
    return NextResponse.json({ error: "That date and time isn't valid." }, { status: 400 });
  }
  const leadMs = leadTimeMsFromHours(settings.onlineBookingLeadTimeHours);
  if (slotMs - leadMs <= Date.now()) {
    return NextResponse.json(
      { error: "That time is too soon to book. Pick a later slot." },
      { status: 400 }
    );
  }

  const { data: purchase } = await admin
    .from("patient_package_purchases")
    .select(
      "id, patient_id, locked_therapist_id, session_count, sessions_used, status, expires_at, payment_status"
    )
    .eq("id", purchaseId)
    .maybeSingle();
  if (!purchase) {
    return NextResponse.json({ error: "That programme no longer exists." }, { status: 404 });
  }
  // The whole authorization check: a therapist may only suggest against a
  // programme locked to them. Re-derived here, never taken from the client.
  if (purchase.locked_therapist_id !== user.id) {
    return NextResponse.json({ error: "That isn't your programme." }, { status: 403 });
  }
  if (purchase.payment_status !== "paid" || purchase.status !== "active") {
    return NextResponse.json(
      { error: "That programme isn't active." },
      { status: 400 }
    );
  }
  if (purchase.expires_at && new Date(purchase.expires_at).getTime() <= slotMs) {
    return NextResponse.json(
      { error: "That time is after the programme expires." },
      { status: 400 }
    );
  }
  if (sessionsRemaining(purchase) <= 0) {
    return NextResponse.json(
      { error: "Every session in this programme is already used." },
      { status: 400 }
    );
  }

  // Advisory: acceptance re-checks this against the therapist's calendar as
  // it stands then. Suggesting a slot they are already busy for would just
  // waste the patient's answer.
  const conflict = await findTherapistConflict(
    admin,
    user.id,
    new Date(slotMs).toISOString(),
    60
  );
  if (conflict) {
    return NextResponse.json(
      { error: "You already have a session at that time." },
      { status: 409 }
    );
  }

  const { data: created, error: insertError } = await admin
    .from("session_suggestions")
    .insert({
      purchase_id: purchase.id,
      patient_id: purchase.patient_id,
      therapist_id: user.id,
      slot_time: new Date(slotMs).toISOString(),
      timezone: body.timezone?.trim() || null,
      note: note || null,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError) {
    // 23505 is the one-pending-per-purchase unique index. Reached by a
    // double tap, an impatient retry on a slow connection, or two open
    // tabs -- all of which are the same request arriving twice, so this is
    // reported as success-shaped ("there is already one waiting") rather
    // than an error the therapist has to interpret.
    if (insertError.code === "23505") {
      return NextResponse.json(
        {
          error:
            "You already have a suggestion waiting for this patient. Withdraw it before suggesting another time.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, suggestionId: created.id });
}
