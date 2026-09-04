import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isPatientProfile, isProfileActive } from "@/lib/supabase/requireActiveProfile";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";
import {
  leadTimeMsFromHours,
  isWholeHourSlot,
  NOT_WHOLE_HOUR_ERROR,
} from "@/lib/bookingSlots";
import { guardCommunication } from "@/lib/communicationFlags";

// Creates the pre-payment appointment row for a single online session --
// the row /api/razorpay/create-order then mints a Razorpay order against.
//
// This used to be a direct `supabase.from("appointments").insert(...)` from
// the booking wizard in the browser, with appointments_insert_own's WITH
// CHECK as the only thing validating it. That made the live database's copy
// of one RLS policy the single point of failure for the entire booking
// funnel: any clause of it being even slightly out of step with the wizard
// (a schema.sql change not yet applied to the project, a category whose
// duration was edited after /book's ISR-cached copy was rendered) failed the
// insert, and what the patient saw at the last step of checkout was the raw
// Postgres string `new row violates row-level security policy for table
// "appointments"`. That is exactly what happened in production: schema.sql's
// policy had already dropped the `approved = true` requirement so a
// self-signup patient could pay on their first visit, but the live database
// still had the older policy, so every new patient's first booking died
// here.
//
// Every clause that policy enforced is re-derived here instead, server-side,
// from the patient's session and the category row -- not from anything the
// browser sent. Same shape as /api/admin/create-booking, and the same reason
// home visits are never inserted by the browser either (see schema.sql).

type Body = {
  categoryId?: string | null;
  slotTime?: string;
  timezone?: string | null;
  notes?: string | null;
  preferredTherapistId?: string | null;
  preferredLanguage?: string | null;
};

export async function POST(request: NextRequest) {
  const parsed = await parseJsonBody<Body>(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // isProfileActive, not isProfileActiveAndApproved: a patient who just
  // signed up in the wizard is unapproved by definition, and this row is
  // the thing they have to have before they can attempt the payment that
  // vets them (see approvePatientForGenuinePaymentAttempt). The row this
  // creates is always unpaid, unassigned and 'requested', so it grants
  // nothing on its own. Suspension is still enforced.
  if (!(await isProfileActive(user.id))) {
    return NextResponse.json({ error: "Your account has been suspended." }, { status: 403 });
  }

  // Sessions are delivered to patients, and one account carries one role --
  // see isPatientProfile. This clause used to live on
  // appointments_insert_own, which was the only enforcement point for the
  // wizard's direct insert; that insert is now this route, so the check
  // comes with it. Without it a therapist/hospital/admin session could
  // still create a booking their own dashboard can never list again --
  // which is the bug the RLS clause was added for, after money had moved
  // for one. The wizards say so in the UI and the purchase routes check it
  // too; this is the same check for a session cookie calling directly.
  if (!(await isPatientProfile(user.id))) {
    return NextResponse.json(
      { error: "This account can't book sessions. Sessions are booked under a patient account." },
      { status: 403 }
    );
  }

  const slotTime = body.slotTime?.trim();
  if (!slotTime) {
    return NextResponse.json({ error: "Please pick a date and time." }, { status: 400 });
  }
  const slotMs = new Date(slotTime).getTime();
  if (Number.isNaN(slotMs)) {
    return NextResponse.json({ error: "That date and time isn't valid." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: settingsRow } = await admin
    .from("site_settings")
    .select(SITE_SETTINGS_SELECT)
    .maybeSingle();
  const settings = parseAdminSettings(settingsRow);

  // The same lead time the wizard's own picker applies, read from the same
  // setting so the picker and this validator can't drift apart -- the whole
  // point of bookingSlots.ts. Unlike the admin route there is no override:
  // nobody is on the phone to arrange the exception.
  if (slotMs < Date.now() + leadTimeMsFromHours(settings.onlineBookingLeadTimeHours)) {
    return NextResponse.json(
      {
        error: `Please pick a slot at least ${settings.onlineBookingLeadTimeHours} hours from now.`,
      },
      { status: 409 }
    );
  }

  // Slots start on the hour, everywhere. The pickers only offer whole hours,
  // so this is the same rule stated where a request cannot get round it --
  // checked in the booking's own timezone, since 6 PM IST is 12:30 UTC and
  // reading the minute off the instant would refuse every correct booking.
  if (!isWholeHourSlot(new Date(slotMs).toISOString(), body.timezone)) {
    return NextResponse.json({ error: NOT_WHOLE_HOUR_ERROR }, { status: 400 });
  }

  // Duration and concern come from the category row, never from the
  // browser: /book is ISR-cached, so the copy of the catalogue the patient
  // filled the form against can legitimately be older than the one being
  // charged and scheduled against.
  const categoryId = body.categoryId?.trim() || null;
  let durationMinutes = BASE_DURATION_MINUTES;
  let concern = "General Consultation";
  if (categoryId) {
    const { data: category } = await admin
      .from("treatment_categories")
      .select("id, title, duration_minutes, active")
      .eq("id", categoryId)
      .maybeSingle();
    if (!category || category.active === false) {
      return NextResponse.json(
        { error: "That concern isn't available any more. Please pick another one." },
        { status: 409 }
      );
    }
    durationMinutes = category.duration_minutes ?? BASE_DURATION_MINUTES;
    concern = category.title;
  }

  // A patient double-booking *themselves* is checked in the wizard too, for
  // immediate feedback before the last step; this is the copy that actually
  // binds, since the wizard's is a browser check like any other.
  const newEndMs = slotMs + durationMinutes * 60_000;
  const { data: existing } = await admin
    .from("appointments")
    .select("slot_time, duration_minutes")
    .eq("patient_id", user.id)
    .in("status", ["requested", "confirmed"]);
  const overlaps = (existing ?? []).some((a) => {
    if (!a.slot_time) return false;
    const startMs = new Date(a.slot_time).getTime();
    const endMs = startMs + (a.duration_minutes ?? BASE_DURATION_MINUTES) * 60_000;
    return startMs < newEndMs && slotMs < endMs;
  });
  if (overlaps) {
    return NextResponse.json(
      {
        error:
          "You already have a session scheduled around this time. Please pick a different slot, or check your dashboard for existing bookings.",
      },
      { status: 409 }
    );
  }

  // A *preference*, not an assignment -- therapist_id stays null until an
  // admin assigns one, exactly as before. Still re-checked: the browser can
  // name any id, and an inactive or unapproved therapist must not show up
  // as a request an admin might honour.
  let preferredTherapistId: string | null = body.preferredTherapistId?.trim() || null;
  if (preferredTherapistId) {
    const { data: therapist } = await admin
      .from("profiles")
      .select("id, role, active, approved")
      .eq("id", preferredTherapistId)
      .maybeSingle();
    if (!therapist || therapist.role !== "therapist" || !therapist.approved || therapist.active === false) {
      preferredTherapistId = null;
    }
  }

  // Only one of the languages the admin actually offers for booking; any
  // other string is dropped rather than stored as a preference no therapist
  // is matched on.
  const requestedLanguage = body.preferredLanguage?.trim() || null;
  const preferredLanguage =
    requestedLanguage && settings.bookingLanguages.includes(requestedLanguage)
      ? requestedLanguage
      : null;

  // The patient's own note reaches the therapist, so it is scanned in the
  // same way the therapist's text is -- but recorded rather than refused.
  // A patient is not the party this control exists to catch, and a 400 at
  // the last step of checkout costs a real booking.
  const notes = body.notes?.trim() || null;
  await guardCommunication(admin, [{ surface: "appointment_notes", text: notes }], {
    authorId: user.id,
    authorRole: "patient",
    patientId: user.id,
    enforcement: "record_only",
  });

  const { data: created, error } = await admin
    .from("appointments")
    .insert({
      patient_id: user.id,
      slot_time: new Date(slotMs).toISOString(),
      timezone: body.timezone?.trim() || "Asia/Kolkata",
      concern,
      category_id: categoryId,
      duration_minutes: durationMinutes,
      notes,
      preferred_therapist_id: preferredTherapistId,
      preferred_language: preferredLanguage,
      status: "requested",
      payment_status: "unpaid",
      visit_mode: "online",
      therapist_id: null,
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("Failed to create booking for patient", user.id, error);
    return NextResponse.json(
      { error: "Could not save your booking. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, appointmentId: created.id });
}
