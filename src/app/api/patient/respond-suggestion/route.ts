import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActiveAndApproved } from "@/lib/supabase/requireActiveProfile";
import { bookPackageSession } from "@/lib/bookPackageSession";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { leadTimeMsFromHours } from "@/lib/bookingSlots";
import { isActionable } from "@/lib/sessionSuggestions";

// The patient answering a suggested session.
//
// Accepting is the moment a session is actually claimed: only here does an
// appointment come into existence and only here does sessions_used move. The
// booking itself goes through bookPackageSession -- the same function the
// patient's own scheduler and the admin use -- so the package's gap rules,
// expiry, conflicts and Meet link all behave identically no matter who
// started it. This route is the authorization and idempotency layer around
// that, not a second booking implementation.
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
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { data: body, error: parseError } = await parseJsonBody<{
    suggestionId?: string;
    answer?: string;
  }>(request);
  if (parseError) return parseError;

  const suggestionId = body.suggestionId?.trim();
  const answer = body.answer === "accept" ? "accept" : body.answer === "decline" ? "decline" : null;
  if (!suggestionId) {
    return NextResponse.json({ error: "Missing suggestionId" }, { status: 400 });
  }
  if (!answer) {
    return NextResponse.json({ error: "Answer must be accept or decline." }, { status: 400 });
  }

  if (!(await isProfileActiveAndApproved(user.id))) {
    return NextResponse.json({ error: "Your account is not active." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: suggestion } = await admin
    .from("session_suggestions")
    .select("id, purchase_id, patient_id, therapist_id, slot_time, timezone, status, appointment_id")
    .eq("id", suggestionId)
    .maybeSingle();
  if (!suggestion) {
    return NextResponse.json({ error: "That suggestion no longer exists." }, { status: 404 });
  }
  if (suggestion.patient_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Already answered. Returned as success, not an error: the second tap of a
  // double tap, and a retry after a request that actually succeeded but
  // whose response never arrived, are indistinguishable from here -- and in
  // both cases the patient's intent is already recorded. Handing back the
  // appointment id makes an accept safely repeatable.
  if (suggestion.status !== "pending") {
    return NextResponse.json({
      success: true,
      alreadyAnswered: true,
      status: suggestion.status,
      appointmentId: suggestion.appointment_id,
    });
  }

  if (answer === "decline") {
    // Guarded on status so two concurrent declines cannot both write.
    const { error } = await admin
      .from("session_suggestions")
      .update({ status: "declined", responded_at: new Date().toISOString() })
      .eq("id", suggestion.id)
      .eq("status", "pending");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, status: "declined" });
  }

  const { data: settingsRow } = await admin
    .from("site_settings")
    .select(SITE_SETTINGS_SELECT)
    .maybeSingle();
  const settings = parseAdminSettings(settingsRow);
  const leadMs = leadTimeMsFromHours(settings.onlineBookingLeadTimeHours);

  // A suggestion is never marked expired by a background job -- there is no
  // background job. It simply stops being acceptable once its slot is inside
  // the booking lead time, checked here the same way both dashboards check
  // it when deciding whether to offer the buttons at all.
  if (!isActionable(suggestion, Date.now(), leadMs)) {
    return NextResponse.json(
      {
        error:
          "This time is too close now to book. Ask your therapist to suggest another, or pick one yourself.",
      },
      { status: 409 }
    );
  }

  const { data: purchase } = await admin
    .from("patient_package_purchases")
    .select(
      "id, patient_id, package_id, category_id, session_count, sessions_used, amount_paid_paise, status, expires_at, payment_status, locked_therapist_id"
    )
    .eq("id", suggestion.purchase_id)
    .maybeSingle();
  if (!purchase || purchase.patient_id !== user.id) {
    return NextResponse.json({ error: "That programme no longer exists." }, { status: 404 });
  }

  const { data: packageRow } = await admin
    .from("treatment_category_packages")
    .select("session_duration_minutes")
    .eq("id", purchase.package_id)
    .maybeSingle();

  // Claims the suggestion *before* booking. If two accepts race, only one
  // moves the row out of 'pending', so only one goes on to create a session
  // -- the loser falls into the already-answered branch on its next read
  // rather than booking a duplicate.
  const { data: claimed } = await admin
    .from("session_suggestions")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", suggestion.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!claimed) {
    const { data: fresh } = await admin
      .from("session_suggestions")
      .select("status, appointment_id")
      .eq("id", suggestion.id)
      .maybeSingle();
    return NextResponse.json({
      success: true,
      alreadyAnswered: true,
      status: fresh?.status ?? "accepted",
      appointmentId: fresh?.appointment_id ?? null,
    });
  }

  const result = await bookPackageSession(admin, {
    purchase,
    slotDateTime: suggestion.slot_time,
    timezone: suggestion.timezone,
    notes: null,
    // The patient is the one claiming the session, even though their
    // therapist proposed the time -- they are who accepted it.
    actorId: user.id,
    sessionDurationMinutesOverride: packageRow?.session_duration_minutes ?? null,
  });

  if (!result.success) {
    // The booking failed after the claim, so put the suggestion back where
    // it was. Without this the patient is left with a suggestion marked
    // accepted and no session behind it -- the one state this design exists
    // to avoid.
    await admin
      .from("session_suggestions")
      .update({ status: "pending", responded_at: null })
      .eq("id", suggestion.id);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await admin
    .from("session_suggestions")
    .update({ appointment_id: result.appointmentId })
    .eq("id", suggestion.id);

  return NextResponse.json({
    success: true,
    status: "accepted",
    appointmentId: result.appointmentId,
  });
}
