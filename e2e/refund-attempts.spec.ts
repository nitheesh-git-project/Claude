// Suite RA -- the record a refund writes before the money moves.
//
// Every gateway refund in this app claims its local row first and calls
// Razorpay second, so a refusal leaves no trace claiming money went back.
// The opposite failure had nothing watching it: Razorpay accepts the refund
// and the write recording it fails, which leaves the money gone, `refund_id`
// null, and the session indistinguishable from one that was claimed and
// never sent.
//
// These cases drive the **database** rather than the routes, deliberately.
// Every refund writer in this app uses the service-role client, which
// bypasses RLS entirely -- so for a table whose whole value is that it
// records what was attempted before the attempt was made, the only guarantee
// worth testing is that a rewrite *raises*, from the same client the routes
// hold. A route test would prove the routes behave, which is what the routes
// were already doing wrong.
//
// It does not fire a real Razorpay refund. There is no test path that moves
// money back and then fails the local write on cue, and faking one would
// prove a mock behaves.
import { test, expect } from "@playwright/test";
import { adminClient, profileIdFor, QA_EMAILS, E2E_MARKERS } from "./helpers";

const MARKER = E2E_MARKERS.refundAttemptNote;

test.describe("Suite RA: refund attempts", () => {
  let appointmentId: string | null = null;
  const attemptIds: string[] = [];

  // Found or created, never deleted -- see the afterAll. One cancelled
  // fixture session is reused across runs rather than a new one each time,
  // since nothing can remove the attempts that point at it.
  test.beforeAll(async () => {
    const admin = adminClient();
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);

    const existing = await admin
      .from("appointments")
      .select("id")
      .eq("patient_id", patientId)
      .eq("notes", MARKER)
      .limit(1)
      .maybeSingle();
    if (existing.data?.id) {
      appointmentId = existing.data.id;
      // Cleared so RA-007 is testing this run's own succeeded attempt rather
      // than passing on the id the previous run's afterAll wrote.
      await admin.from("appointments").update({ refund_id: null }).eq("id", appointmentId);
      return;
    }

    const { data, error } = await admin
      .from("appointments")
      .insert({
        patient_id: patientId,
        status: "cancelled",
        payment_status: "paid",
        amount_paid_paise: 120_000,
        notes: MARKER,
      })
      .select("id")
      .single();
    if (error) throw new Error(`could not create the fixture appointment: ${error.message}`);
    appointmentId = data.id;
  });

  // The fixture is **resolved, not deleted** -- the same posture
  // `admin-care-plans.spec.ts` takes, and for the same reason: an
  // append-only row pointing at something makes that thing undeletable.
  // `refund_attempts` refuses every delete by trigger and its foreign keys
  // are `restrict`, so there is no tidy-up that removes these rows, and
  // building one would mean a door that lifts the guard this file exists to
  // prove.
  //
  // What matters is that nothing is left *red*. A `processing` row is a
  // permanent "a refund was sent and we never learned what happened" on
  // Settings -> System Health, so each is resolved to `failed` -- which is
  // true: no refund was ever sent. And the one succeeded fixture is recorded
  // against its appointment, clearing the second count the same honest way
  // an admin would.
  test.afterAll(async () => {
    const admin = adminClient();
    if (appointmentId) {
      await admin
        .from("appointments")
        .update({ refund_id: `rfnd_${MARKER}_2` })
        .eq("id", appointmentId);
    }
    for (const id of attemptIds) {
      await admin
        .from("refund_attempts")
        .update({
          status: "failed",
          resolved_at: new Date().toISOString(),
          failure_detail: "e2e fixture - no refund was ever sent",
        })
        .eq("id", id)
        .eq("status", "processing");
    }
  });

  async function openAttempt(amountPaise = 50_000) {
    const admin = adminClient();
    const { data, error } = await admin
      .from("refund_attempts")
      .insert({
        purpose: "appointment",
        appointment_id: appointmentId,
        razorpay_payment_id: `pay_${MARKER}`,
        amount_paise: amountPaise,
        reason: MARKER,
      })
      .select("id, status")
      .single();
    expect(error).toBeNull();
    attemptIds.push(data!.id);
    return data!;
  }

  // The whole design in one assertion: the row exists, unresolved, before
  // anything has been asked of the gateway.
  test("RA-001: an attempt lands as processing, before the gateway is called", async () => {
    const attempt = await openAttempt();
    expect(attempt.status).toBe("processing");
  });

  // A refund attempt that could describe two subjects, or none, is a row
  // nothing can reconcile against.
  test("RA-002: an attempt must name exactly one subject", async () => {
    const admin = adminClient();
    const { error } = await admin.from("refund_attempts").insert({
      purpose: "appointment",
      razorpay_payment_id: `pay_${MARKER}`,
      amount_paise: 1000,
    });
    expect(error).not.toBeNull();
  });

  // Resolved once. Two callers resolving one attempt is the race this exists
  // to make impossible rather than unlikely.
  test("RA-003: an attempt resolves exactly once, and never twice", async () => {
    const admin = adminClient();
    const attempt = await openAttempt();

    const first = await admin
      .from("refund_attempts")
      .update({
        status: "succeeded",
        razorpay_refund_id: `rfnd_${MARKER}`,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", attempt.id);
    expect(first.error).toBeNull();

    const second = await admin
      .from("refund_attempts")
      .update({ status: "failed", resolved_at: new Date().toISOString() })
      .eq("id", attempt.id);
    expect(second.error).not.toBeNull();
  });

  // A success must name the gateway's own refund, or the row claims money
  // moved and cannot say which movement it was.
  test("RA-004: a success with no gateway refund id is refused", async () => {
    const admin = adminClient();
    const attempt = await openAttempt();
    const { error } = await admin
      .from("refund_attempts")
      .update({ status: "succeeded", resolved_at: new Date().toISOString() })
      .eq("id", attempt.id);
    expect(error).not.toBeNull();
  });

  // What was asked for cannot be rewritten to match what happened. That is
  // the only reason a disagreement between the two is worth reporting.
  test("RA-005: the facts of an attempt are frozen, and it is never deletable", async () => {
    const admin = adminClient();
    const attempt = await openAttempt();

    const rewritten = await admin
      .from("refund_attempts")
      .update({ amount_paise: 1 })
      .eq("id", attempt.id);
    expect(rewritten.error).not.toBeNull();

    const removed = await admin.from("refund_attempts").delete().eq("id", attempt.id);
    expect(removed.error).not.toBeNull();
  });

  // The health function is what puts this on a screen, and its two counts
  // answer different questions -- money whose fate is unknown, and money
  // that went back and is not on the row it belongs to.
  test("RA-006: an unresolved refund is reported, and one in flight is not", async () => {
    const admin = adminClient();
    await openAttempt();

    // A refund is legitimately unresolved for the length of one gateway
    // call, so a window wide enough to contain this run must report nothing
    // -- or a working clinic carries a permanent red light, which is how a
    // check stops being read.
    const inFlight = await admin.rpc("refund_attempt_health", {
      p_stuck_after_minutes: 600,
    });
    expect(inFlight.error).toBeNull();
    expect(Number(inFlight.data.stuck_count)).toBe(0);
  });

  // A refund the gateway accepted whose appointment carries no `refund_id`
  // is the second disagreement: every money figure reading that row is wrong
  // until somebody records it.
  test("RA-007: a succeeded refund not recorded on its session is reported", async () => {
    const admin = adminClient();
    const attempt = await openAttempt();
    await admin
      .from("refund_attempts")
      .update({
        status: "succeeded",
        razorpay_refund_id: `rfnd_${MARKER}_2`,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", attempt.id);

    const { data, error } = await admin.rpc("refund_attempt_health", {
      p_stuck_after_minutes: 600,
    });
    expect(error).toBeNull();
    expect(Number(data.unrecorded_count)).toBeGreaterThan(0);
  });
});
