import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { findTherapistConflict } from "@/lib/checkTherapistConflict";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import {
  leadTimeMsFromHours,
  isWholeHourSlot,
  NOT_WHOLE_HOUR_ERROR,
} from "@/lib/bookingSlots";
import { sessionsRemaining } from "@/lib/sessionSuggestions";
import { guardCommunication } from "@/lib/communicationFlags";
import { serverError } from "@/lib/apiError";
import { checkPackageSpacing, readPackageTerms } from "@/lib/packageTerms";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";

const MAX_NOTE_LENGTH = 500;

// What a read that failed answers -- never "Forbidden", "switched off" or
// "no longer exists", which are claims about the world the route could not
// check. Nothing was written, so trying again is always safe.
function couldNotCheck(what: string) {
  return NextResponse.json(
    { error: `We couldn't check ${what} just now. Nothing was sent - please try again.`, retryable: true },
    { status: 503 }
  );
}

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
    purchaseId?: string;
    slotTime?: string;
    timezone?: string;
    note?: string;
  }>(request);
  if (parseError) return parseError;

  const admin = createAdminClient();
  // Every read below answers 503 when it fails rather than falling through
  // to a refusal. Under load a dropped read used to tell a therapist
  // "Forbidden" (profile), "Suggesting sessions is switched off" (the
  // switch) or "That programme no longer exists" (the purchase) -- three
  // false statements, and the cause of the intermittent SS-003 failure: one
  // of six simultaneous taps came back as neither a suggestion nor a
  // duplicate.
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role, active, approved")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return couldNotCheck("your account");
  if (profile?.role !== "therapist") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (profile.active === false || profile.approved === false) {
    return NextResponse.json({ error: "Your account is not active." }, { status: 403 });
  }

  const { data: settingsRow, error: settingsError } = await admin
    .from("site_settings")
    .select(SITE_SETTINGS_SELECT)
    .maybeSingle();
  // The lead time comes from here; a default standing in for an unread
  // setting could accept a slot the clinic's rule refuses.
  if (settingsError) return couldNotCheck("the clinic's booking rules");
  const settings = parseAdminSettings(settingsRow);
  // Read in its own call rather than through SITE_SETTINGS_SELECT so a
  // database that has not run the latest schema.sql fails closed (the
  // column is missing, the feature is off) instead of failing the whole
  // settings read.
  const { data: toggleRow, error: toggleError } = await admin
    .from("site_settings")
    .select("therapist_suggestions_enabled")
    .maybeSingle();
  // A missing column (42703) is a database without the feature, which is
  // "switched off" honestly. Any other failure is "couldn't check".
  if (toggleError && toggleError.code !== "42703") return couldNotCheck("whether suggestions are on");
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
  // Slots start on the hour, everywhere. A therapist proposing 6:52 would
  // hand the patient a time their own acceptance screen cannot render --
  // checked in the zone the suggestion is recorded in.
  if (!isWholeHourSlot(new Date(slotMs).toISOString(), body.timezone)) {
    return NextResponse.json({ error: NOT_WHOLE_HOUR_ERROR }, { status: 400 });
  }

  const leadMs = leadTimeMsFromHours(settings.onlineBookingLeadTimeHours);
  if (slotMs - leadMs <= Date.now()) {
    return NextResponse.json(
      { error: "That time is too soon to book. Pick a later slot." },
      { status: 400 }
    );
  }

  const { data: purchase, error: purchaseError } = await admin
    .from("patient_package_purchases")
    .select(
      "id, patient_id, package_id, category_id, locked_therapist_id, session_count, sessions_used, status, expires_at, payment_status"
    )
    .eq("id", purchaseId)
    .maybeSingle();
  if (purchaseError) return couldNotCheck("this programme");
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

  // The session's real length, from the terms the patient bought -- this
  // assumed every session was 60 minutes, so a 90-minute programme could be
  // proposed over the tail of an existing booking, and the acceptance (which
  // books the real length) then failed to reserve the therapist and left the
  // session unassigned in the admin's queue.
  const terms = await readPackageTerms(admin, purchase.id, purchase.package_id);
  let durationMinutes = terms.sessionDurationMinutes;
  if (!durationMinutes && purchase.category_id) {
    const { data: category, error: categoryError } = await admin
      .from("treatment_categories")
      .select("duration_minutes")
      .eq("id", purchase.category_id)
      .maybeSingle();
    if (categoryError) return couldNotCheck("this programme's session length");
    durationMinutes = category?.duration_minutes ?? null;
  }

  // The programme's own spacing, checked now rather than only when the
  // patient accepts -- a suggestion they cannot accept wastes their answer.
  const spacing = await checkPackageSpacing(admin, { purchaseId: purchase.id, slotMs, terms });
  if (!spacing.ok) {
    return NextResponse.json(
      { error: spacing.error },
      { status: spacing.reason === "unavailable" ? 503 : 409 }
    );
  }

  // Advisory: acceptance re-checks this against the therapist's calendar as
  // it stands then. Suggesting a slot they are already busy for would just
  // waste the patient's answer.
  const conflict = await findTherapistConflict(
    admin,
    user.id,
    new Date(slotMs).toISOString(),
    durationMinutes ?? BASE_DURATION_MINUTES
  );
  if (conflict) {
    return NextResponse.json(
      { error: "You already have a session at that time." },
      { status: 409 }
    );
  }

  // The note goes straight to the patient's dashboard, which makes it the
  // oldest cross-role free-text channel in the app and the one that has been
  // unscanned longest.
  const leak = await guardCommunication(
    admin,
    [{ surface: "session_suggestion_note", text: note }],
    { authorId: user.id, authorRole: "therapist", patientId: purchase.patient_id }
  );
  if (leak.blockedMessage) {
    return NextResponse.json({ error: leak.blockedMessage }, { status: 400 });
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
    return serverError("therapist/suggest-session", insertError);
  }

  return NextResponse.json({ success: true, suggestionId: created.id });
}
