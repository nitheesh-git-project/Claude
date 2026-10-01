import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  pickAutoAssignTherapist,
  readAutoAssignSettings,
} from "@/lib/autoAssignTherapist";
import { recordPaymentCapture } from "@/lib/recordPaymentCapture";
import { settleInvitesOnCapture } from "@/lib/inviteRewardsServer";
import { createMeetEventForConfirmedAppointment } from "@/lib/googleCalendarSync";
import { claimTherapistSlot } from "@/lib/claimTherapistSlot";
import { WEBHOOK_RETRYABLE_PREFIX, webhookRetryVerdict } from "@/lib/webhookRetry";

// Razorpay's server-to-server notification that a payment happened.
//
// Before this existed, payment confirmation depended entirely on the
// patient's browser reaching /api/razorpay/verify after checkout. A patient
// who paid and closed the tab -- or whose phone lost signal on the way back
// from their UPI app, which is the normal case on the payment method this
// clinic's patients actually use -- left a paid Razorpay order sitting
// against an unpaid appointment. The only recovery was for them to come
// back and press Pay a second time, which /api/razorpay/create-order would
// then notice and repair. Nobody does that; they contact support, or they
// don't.
//
// This is the other half of that. Whichever arrives first, the browser or
// the webhook, does the work; the second is a no-op. See
// record_payment_capture in schema.sql for why that is a database function
// rather than TypeScript.
//
// Unauthenticated by necessity -- Razorpay has no session. The signature is
// the authentication, and it is checked against the RAW body: JSON.parse
// followed by JSON.stringify does not round-trip byte-for-byte (key order,
// number formatting, unicode escapes), so verifying a re-serialised body
// rejects legitimate webhooks and, worse, would tempt someone to "fix" it
// by skipping the check.
export async function POST(request: NextRequest) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    // Not configured for this deployment. 503 rather than 500 so it reads
    // as "not set up" in Razorpay's delivery log rather than as a bug, and
    // so Razorpay keeps retrying once it is.
    console.error("Razorpay webhook received but RAZORPAY_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  // Length-checked before timingSafeEqual, which throws on a length
  // mismatch rather than returning false -- the same shape the three verify
  // routes already use.
  const signatureValid =
    expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));

  if (!signatureValid) {
    // Deliberately terse. A forged webhook should learn nothing about
    // whether the order it named exists.
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: {
    event?: string;
    payload?: {
      payment?: { entity?: { id?: string; order_id?: string; amount?: number; status?: string } };
    };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  const eventType = event.event ?? "unknown";
  const payment = event.payload?.payment?.entity;
  const orderId = payment?.order_id ?? null;
  const paymentId = payment?.id ?? null;

  // Razorpay's own event id, from the header. This is the dedup key: the
  // same delivery retried carries the same id, and the unique index on it
  // is what makes "process each event once" a database guarantee instead of
  // a routine that has to remember.
  const eventId =
    request.headers.get("x-razorpay-event-id") ??
    // Fall back to something stable for this event when the header is
    // absent, rather than generating a random id -- a random id would make
    // every retry look like a new event, which is exactly the bug the
    // dedup exists to prevent.
    (paymentId ? `${eventType}:${paymentId}` : null);

  if (!eventId) {
    // Nothing stable to dedup on. Accepted (so Razorpay stops retrying) but
    // not processed, and logged so it is visible if it ever happens.
    console.error("Razorpay webhook with no event id and no payment id", eventType);
    return NextResponse.json({ received: true, processed: false });
  }

  const admin = createAdminClient();

  // Insert FIRST, before doing any work. A replay collides on the unique
  // index and is answered 200 having changed nothing -- that ordering is
  // the whole dedup, and inverting it (process, then record) would let a
  // retry that arrives during processing do the work twice.
  const { data: recorded, error: insertError } = await admin
    .from("payment_webhook_events")
    .insert({
      razorpay_event_id: eventId,
      event_type: eventType,
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      payload: event,
    })
    .select("id")
    .maybeSingle();

  let eventRowId = recorded?.id;

  if (insertError) {
    if (insertError.code !== "23505") {
      console.error("Failed to record Razorpay webhook event", eventId, insertError);
      // A 500 asks Razorpay to retry, which is right: we have not processed
      // it and have no record that we saw it.
      return NextResponse.json({ error: "Could not record event" }, { status: 500 });
    }

    // Already seen. Whether that makes this a duplicate depends on how the
    // first attempt ended -- the row cannot be deleted to make room for a
    // retry (trg_payment_webhook_events_identity forbids it, because the row
    // IS the dedup), so a failed attempt is recorded on the row instead and
    // read back here. Acknowledging a retry of a failed capture as a
    // duplicate is how a paid booking stayed unpaid for good.
    const { data: prior, error: priorError } = await admin
      .from("payment_webhook_events")
      .select("id, processed_at, processing_error, received_at")
      .eq("razorpay_event_id", eventId)
      .maybeSingle();
    if (priorError || !prior) {
      console.error("Could not read prior webhook attempt", eventId, priorError?.message);
      return NextResponse.json({ error: "Could not read event" }, { status: 500 });
    }
    const verdict = webhookRetryVerdict(prior, Date.now());
    if (verdict === "duplicate") {
      // Razorpay retries until it gets a 2xx, so a genuine duplicate must
      // be a success -- answering an error would have it retry forever.
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (verdict === "in_flight") {
      // Another delivery is working on it right now. Not a 2xx: if that one
      // dies, this retry is the only way the capture lands.
      return NextResponse.json({ error: "Event in progress" }, { status: 409 });
    }
    // "retry": the earlier attempt failed, or died before recording an
    // outcome. Run it again on the same row; record_payment_capture is
    // idempotent, so a capture that did land is a no-op the second time.
    eventRowId = prior.id;
  }

  const markProcessed = async (processingError?: string) => {
    if (!eventRowId) return;
    const { error } = await admin
      .from("payment_webhook_events")
      .update({
        processed_at: new Date().toISOString(),
        processing_error: processingError ?? null,
      })
      .eq("id", eventRowId);
    if (error) {
      console.error("Failed to mark webhook event processed", eventRowId, error.message);
    }
  };

  // Only a capture creates or repairs anything. The others are recorded above
  // for the audit trail and deliberately do nothing else: a 'payment.failed'
  // needs no repair, and an 'order.paid' carries the same capture this
  // already handles via payment.captured.
  //
  // `payment.authorized` used to be treated as a capture too, and it is not
  // one: an authorized payment is money the gateway has put a hold on and
  // not taken. Razorpay voids an authorization that is never captured
  // (auto-refunding it after a few days), so applying it here marked a
  // booking paid, confirmed the session, created the Calendar event and
  // settled an invite half against money that could still evaporate -- and
  // nothing in the app would ever walk that back. Under auto-capture,
  // which is what this account runs, `payment.captured` follows an
  // authorization within seconds and does all of it correctly; under manual
  // capture the authorization genuinely is not a payment yet. Either way the
  // event is still recorded above, so the trail keeps it.
  if (eventType !== "payment.captured") {
    await markProcessed();
    return NextResponse.json({ received: true, processed: false, eventType });
  }

  if (!orderId || !paymentId) {
    await markProcessed("capture event carried no order id or payment id");
    return NextResponse.json({ received: true, processed: false });
  }

  const result = await recordPaymentCapture(admin, {
    orderId,
    paymentId,
    amountPaise: typeof payment?.amount === "number" ? payment.amount : null,
    raw: event,
  });

  if (!result) {
    // Retryable: nothing was applied. The row stays (it cannot be deleted)
    // and carries the retryable marker, which is what tells the next
    // delivery of this event id to try again rather than call it a
    // duplicate. See webhookRetryVerdict.
    await markProcessed(`${WEBHOOK_RETRYABLE_PREFIX}record_payment_capture failed`);
    return NextResponse.json({ error: "Could not apply capture" }, { status: 500 });
  }

  // Same invite settlement the browser callback applies, for the case the
  // callback never lands -- a patient who pays and closes the tab. Both are
  // idempotent, so whichever arrives first does the work and the second
  // finds it done.
  if (result.applied && result.targetAppointmentId) {
    await settleInvitesOnCapture(admin, result.targetAppointmentId);
  }

  // The one thing record_payment_capture deliberately does not do, because
  // it needs an outbound Google call: confirm a session that was only
  // waiting on payment, and give it its Meet link. Same rule the verify
  // route follows -- only when a therapist is already assigned, since
  // otherwise the session still needs an admin.
  if (result.applied && result.targetUpdated && result.targetAppointmentId) {
    const { data: appointment } = await admin
      .from("appointments")
      .select(
        "id, patient_id, therapist_id, slot_time, duration_minutes, timezone, status, google_event_id, visit_mode, preferred_therapist_id"
      )
      .eq("id", result.targetAppointmentId)
      .maybeSingle();

    // Same auto-assign the browser callback applies, for the case the
    // callback never lands -- a patient who pays and closes the tab. Both
    // paths go through pickAutoAssignTherapist so the webhook cannot
    // develop a different idea of who is free from the one the callback
    // has; whichever arrives first assigns, and the second finds the
    // session already confirmed and does nothing.
    let therapistId = appointment?.therapist_id ?? null;
    if (appointment && !therapistId && appointment.slot_time && appointment.status === "requested") {
      const settings = await readAutoAssignSettings(admin);
      const picked = await pickAutoAssignTherapist(admin, {
        appointmentId: appointment.id,
        slotTime: appointment.slot_time,
        durationMinutes: appointment.duration_minutes,
        preferredTherapistId: appointment.preferred_therapist_id,
        visitMode: appointment.visit_mode,
        travelBufferMinutes: settings.travelBufferMinutes,
      });
      if (picked) {
        // Reserved atomically, exactly as the browser-callback path does.
        // The confirmation write below compare-and-sets on `status` and
        // never on `therapist_id`, and an admin assigning by hand leaves
        // the status at `requested` -- so without this the webhook would
        // overwrite a therapist an admin had just chosen. `expectUnassigned`
        // refuses the reservation in that case and leaves their choice
        // standing.
        const claim = await claimTherapistSlot(admin, {
          appointmentId: appointment.id,
          therapistId: picked.therapistId,
          expectUnassigned: true,
          bufferMinutes: settings.travelBufferMinutes,
        });
        if (claim.ok) {
          therapistId = picked.therapistId;
        } else if (claim.reason === "reassigned") {
          // An admin got there first. Confirm with their therapist rather
          // than leaving the session unassigned.
          therapistId = claim.currentTherapistId ?? null;
        }
        // Any other refusal leaves the session in the admin's queue, which
        // is what happened before auto-assignment existed. A webhook is
        // never failed for it.
      }
    }

    if (
      appointment &&
      therapistId &&
      appointment.slot_time &&
      appointment.status === "requested"
    ) {
      const { data: confirmed } = await admin
        .from("appointments")
        .update({
          // `therapist_id` is not written here any more -- the reservation
          // above already wrote it under a lock, and an admin's own
          // assignment must not be overwritten by this confirmation.
          status: "confirmed",
        })
        .eq("id", appointment.id)
        .eq("status", "requested")
        .select("id")
        .maybeSingle();

      // Only after the status change actually stuck, and only when no event
      // exists yet -- createSessionCalendarEvent only ever creates, so a
      // second attempt would orphan an event on the calendar under a link
      // the appointment no longer points at.
      if (confirmed && !appointment.google_event_id) {
        await createMeetEventForConfirmedAppointment(admin, {
          appointmentId: appointment.id,
          patientId: appointment.patient_id,
          therapistId,
          slotTime: appointment.slot_time,
          durationMinutes: appointment.duration_minutes,
          timezone: appointment.timezone,
        });
      }
    }
  }

  await markProcessed();

  return NextResponse.json({
    received: true,
    processed: true,
    applied: result.applied,
    alreadyCaptured: result.alreadyCaptured,
  });
}
