import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordPaymentCapture } from "@/lib/recordPaymentCapture";
import { createMeetEventForConfirmedAppointment } from "@/lib/googleCalendarSync";

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

  if (insertError) {
    if (insertError.code === "23505") {
      // Already seen. Razorpay retries until it gets a 2xx, so this must be
      // a success -- answering an error would have it retry forever.
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("Failed to record Razorpay webhook event", eventId, insertError);
    // A 500 asks Razorpay to retry, which is right: we have not processed
    // it and have no record that we saw it.
    return NextResponse.json({ error: "Could not record event" }, { status: 500 });
  }

  const eventRowId = recorded?.id;
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

  // Only captures create or repair anything. The others are recorded above
  // for the audit trail and deliberately do nothing else: a 'payment.failed'
  // needs no repair, and an 'order.paid' carries the same capture this
  // already handles via payment.captured.
  if (eventType !== "payment.captured" && eventType !== "payment.authorized") {
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
    await markProcessed("record_payment_capture failed");
    // Retryable: nothing was applied, and the next delivery collides on the
    // event id... which would then be answered as a duplicate and never
    // retried. So the event row is removed here, deliberately, so a retry
    // gets a real second attempt. This is the one case where dropping the
    // dedup row is correct -- it records an attempt that did nothing.
    if (eventRowId) {
      await admin.from("payment_webhook_events").delete().eq("id", eventRowId);
    }
    return NextResponse.json({ error: "Could not apply capture" }, { status: 500 });
  }

  // The one thing record_payment_capture deliberately does not do, because
  // it needs an outbound Google call: confirm a session that was only
  // waiting on payment, and give it its Meet link. Same rule the verify
  // route follows -- only when a therapist is already assigned, since
  // otherwise the session still needs an admin.
  if (result.applied && result.targetUpdated && result.targetAppointmentId) {
    const { data: appointment } = await admin
      .from("appointments")
      .select("id, patient_id, therapist_id, slot_time, duration_minutes, timezone, status, google_event_id")
      .eq("id", result.targetAppointmentId)
      .maybeSingle();

    if (
      appointment?.therapist_id &&
      appointment.slot_time &&
      appointment.status === "requested"
    ) {
      const { data: confirmed } = await admin
        .from("appointments")
        .update({ status: "confirmed" })
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
          therapistId: appointment.therapist_id,
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
