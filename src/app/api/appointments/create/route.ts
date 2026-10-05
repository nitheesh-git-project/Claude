import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import {
  readPatientCheckoutStanding,
  profileCheckUnavailable,
  approvePatientForGenuinePaymentAttempt,
} from "@/lib/supabase/requireActiveProfile";
import { mintAppointmentOrder } from "@/lib/appointmentOrderServer";
import { isReplaceableDraft, overlapsSlot } from "@/lib/bookingDraft";
import { cancelAppointmentAndRefund } from "@/lib/cancelAppointment";
import { razorpayOrderIsPaid } from "@/lib/razorpayOrderStatus";
import { buildCheckoutQuoteBody } from "@/lib/checkoutQuoteServer";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";
import {
  leadTimeMsFromHours,
  isWholeHourSlot,
  NOT_WHOLE_HOUR_ERROR,
} from "@/lib/bookingSlots";
import { guardCommunication } from "@/lib/communicationFlags";
import { enforceRateLimit } from "@/lib/rateLimitServer";

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
  /** When present, the response carries the payment screen's quote for the
   *  new booking (see checkoutQuoteServer), so the wizard need not make a
   *  second round trip to /api/appointments/quote before opening Razorpay.
   *  An identifier, never an amount. */
  quotePromoCode?: string | null;
  withQuote?: boolean;
  /** With `withQuote`: also mint the Razorpay order for the new booking when
   *  the quote says the gateway is how it settles, so the wizard opens the
   *  sheet straight from this response. `"pay_now"` is a patient on terms
   *  who would rather pay -- the same intent the wizard has always passed. */
  startPayment?: "default" | "pay_now";
  // The unpaid draft this same wizard created earlier (Back, then a changed
  // detail). Replaced by this booking when it is still only a draft; any
  // other id, or a real booking, is ignored.
  replacesAppointmentId?: string | null;
};

export async function POST(request: NextRequest) {
  // Who is asking, before anything the caller sent is looked at. An
  // anonymous request is refused here rather than after body validation,
  // so an unauthenticated caller never drives this route's parsing and is
  // never told what shape the request should have been.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Keyed on the account, which is the one identifier the person being
  // limited cannot change -- an IP can be rotated, and this is the limit
  // standing in front of money. It falls back to the IP for an anonymous
  // caller, which `/api/appointments/quote` and the promo preview both
  // answer on purpose (a self-signup patient has no account at step 3).
  // Placed after the session is read rather than at the top of the handler
  // for that reason, and still before the body is parsed.
  const limited = await enforceRateLimit(request, "checkout", {
    identifier: user?.id ?? null,
  });
  if (limited) return limited;

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = await parseJsonBody<Body>(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  // isProfileActive, not isProfileActiveAndApproved: a patient who just
  // signed up in the wizard is unapproved by definition, and this row is
  // the thing they have to have before they can attempt the payment that
  // vets them (see approvePatientForGenuinePaymentAttempt). The row this
  // creates is always unpaid, unassigned and 'requested', so it grants
  // nothing on its own. Suspension is still enforced.
  // One read for both checks (see readPatientCheckoutStanding).
  const standing = await readPatientCheckoutStanding(user.id);
  if (standing === "unavailable") return profileCheckUnavailable();
  if (standing === "suspended") {
    return NextResponse.json({ error: "Your account has been suspended." }, { status: 403 });
  }
  if (standing === "not_patient") {
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

  const categoryId = body.categoryId?.trim() || null;
  const requestedTherapistId = body.preferredTherapistId?.trim() || null;

  // Every read below is independent of the others, so they go out together
  // rather than one after another -- this route sits between the patient's
  // tap on Pay and the Razorpay sheet, and each sequential query was a
  // visible slice of that wait. The rules applied to the answers, and the
  // order they are reported in, are unchanged.
  const [settingsRes, categoryRes, existingRes, therapistRes] = await Promise.all([
    admin.from("site_settings").select(SITE_SETTINGS_SELECT).maybeSingle(),
    categoryId
      ? admin
          .from("treatment_categories")
          .select("id, title, duration_minutes, active")
          .eq("id", categoryId)
          .maybeSingle()
      : Promise.resolve(null),
    admin
      .from("appointments")
      .select(
        "id, slot_time, duration_minutes, status, payment_status, therapist_id, visit_mode, payment_terms, package_purchase_id, home_visit_purchase_id, referral_id, pay_later_outcome, razorpay_order_id"
      )
      .eq("patient_id", user.id)
      .in("status", ["requested", "confirmed"]),
    requestedTherapistId
      ? admin
          .from("profiles")
          .select("id, role, active, approved")
          .eq("id", requestedTherapistId)
          .maybeSingle()
      : Promise.resolve(null),
  ]);
  const settings = parseAdminSettings(settingsRes.data);

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
  let durationMinutes = BASE_DURATION_MINUTES;
  let concern = "General Consultation";
  if (categoryId) {
    const category = categoryRes?.data;
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
  //
  // The patient's own unpaid *draft* -- the booking this wizard created on an
  // earlier Pay tap that was then cancelled -- does not count: it is replaced
  // by this one (see src/lib/bookingDraft.ts). Only a real booking blocks.
  const { data: existing, error: existingError } = existingRes;
  if (existingError) {
    return NextResponse.json(
      { error: "We couldn't check your existing bookings just now. Please try again." },
      { status: 503 }
    );
  }
  const overlapping = (existing ?? []).filter(
    (a) =>
      !!a.slot_time &&
      overlapsSlot(
        slotMs,
        durationMinutes,
        new Date(a.slot_time).getTime(),
        a.duration_minutes ?? BASE_DURATION_MINUTES
      )
  );
  const replaceable = (existing ?? []).filter(
    (a) =>
      isReplaceableDraft(a) &&
      (overlapping.includes(a) || (!!body.replacesAppointmentId && a.id === body.replacesAppointmentId))
  );
  if (overlapping.some((a) => !replaceable.includes(a))) {
    return NextResponse.json(
      {
        error:
          "You already have a session scheduled around this time. Please pick a different slot, or check your dashboard for existing bookings.",
      },
      { status: 409 }
    );
  }

  // A draft with a Razorpay order is asked about first: a payment completed in
  // another tab must not be cancelled out from under the patient. A check
  // that could not run is "try again", never "not paid".
  for (const draft of replaceable) {
    if (!draft.razorpay_order_id) continue;
    const paid = await razorpayOrderIsPaid(draft.razorpay_order_id);
    if (paid === null) {
      return NextResponse.json(
        { error: "We couldn't check your earlier booking just now. Please try again." },
        { status: 503 }
      );
    }
    if (paid) {
      return NextResponse.json(
        {
          error:
            "Your earlier payment for this time has already gone through, so that session is booked. Check your dashboard, or pick a different slot.",
        },
        { status: 409 }
      );
    }
  }
  for (const draft of replaceable) {
    const result = await cancelAppointmentAndRefund(admin, {
      appointmentId: draft.id,
      cancelledBy: user.id,
      reason: "Replaced by a new booking before it was paid",
    });
    if ("error" in result) {
      console.error("Could not replace unpaid draft", draft.id, result.error);
      return NextResponse.json(
        { error: "We couldn't update your earlier booking just now. Please try again." },
        { status: 503 }
      );
    }
  }

  // A *preference*, not an assignment -- therapist_id stays null until an
  // admin assigns one, exactly as before. Still re-checked: the browser can
  // name any id, and an inactive or unapproved therapist must not show up
  // as a request an admin might honour.
  let preferredTherapistId: string | null = requestedTherapistId;
  if (preferredTherapistId) {
    const therapist = therapistRes?.data;
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
  // Record-only, so it decides nothing about the insert: it runs alongside
  // it rather than in front of it, and is still awaited before responding.
  const guarded = guardCommunication(admin, [{ surface: "appointment_notes", text: notes }], {
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
  await guarded;

  // The same overlap, caught where it binds: trg_appointments_patient_no_overlap
  // refuses the insert under a per-patient lock, which is what closes the
  // window between the check above and this write for two requests fired
  // together.
  if (error?.code === "23P01") {
    return NextResponse.json(
      {
        error:
          "You already have a session scheduled around this time. Please pick a different slot, or check your dashboard for existing bookings.",
      },
      { status: 409 }
    );
  }
  if (error || !created) {
    console.error("Failed to create booking for patient", user.id, error);
    return NextResponse.json(
      { error: "Could not save your booking. Please try again." },
      { status: 500 }
    );
  }

  // The payment screen's quote for this booking, in this response, so the
  // wizard goes straight to create-order. A failure here is not a failed
  // booking -- the row exists -- so the quote is simply left out and the
  // wizard falls back to asking /api/appointments/quote.
  let quote = null;
  if (body.withQuote === true) {
    try {
      quote = await buildCheckoutQuoteBody(admin, {
        appointment: {
          id: created.id,
          patient_id: user.id,
          category_id: categoryId,
          visit_mode: "online",
          travel_fee_paise: null,
        },
        userId: user.id,
        hasProgramme: false,
        promoCode: typeof body.quotePromoCode === "string" ? body.quotePromoCode : null,
      });
    } catch (err) {
      console.error("Quote after booking create failed", created.id, err);
    }
  }

  // The order, minted here when the quote says the gateway is how this
  // booking settles -- one round trip from the Pay tap to the sheet instead
  // of create, then create-order. Through `mintAppointmentOrder`, the same
  // function create-order uses, so nothing about claiming, free bookings or
  // what is written back differs between the two doors. Free and pay-later
  // bookings are never minted (Razorpay refuses nothing, and terms are not a
  // checkout); a failed quote is not guessed at -- the wizard falls back to
  // create-order, which decides for itself.
  //
  // `order` carries create-order's own body plus its status, so the wizard
  // handles it exactly as it handles that route's answer.
  let order: Record<string, unknown> | null = null;
  const wantsGateway =
    quote !== null &&
    (quote.settlement === "gateway" ||
      (quote.settlement === "pay_later" && body.startPayment === "pay_now" && quote.canPayNow));
  if (body.startPayment && wantsGateway) {
    // A genuine payment attempt: the same vetting create-order grants, and
    // scheduled the same way.
    after(() => approvePatientForGenuinePaymentAttempt(user.id));
    try {
      const minted = await mintAppointmentOrder({
        supabase,
        appointment: {
          id: created.id,
          patient_id: user.id,
          category_id: categoryId,
          razorpay_order_id: null,
          visit_mode: "online",
          travel_fee_paise: null,
        },
        appointmentId: created.id,
        promoCode: typeof body.quotePromoCode === "string" ? body.quotePromoCode : "",
      });
      order = { ...minted.body, status: minted.status };
    } catch (err) {
      // The booking exists either way; the wizard retries through
      // create-order, which re-attaches to anything that did get written.
      console.error("Order mint after booking create failed", created.id, err);
    }
  }

  return NextResponse.json({ success: true, appointmentId: created.id, quote, order });
}
