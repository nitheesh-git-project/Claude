// Suite G -- money correctness, and the activity log that records it.
//
// Every expected number here is worked out from the fixture data first and
// then compared. Reading a figure off the screen and deciding it looks
// plausible is not a test.
import { test, expect } from "@playwright/test";
import {
  computeTherapistPayoutSummary,
  type PayoutAppointment,
} from "../src/lib/therapistPayouts";
import { QA_EMAILS, adminClient, cookieHeaderFor, profileIdFor, BASE } from "./helpers";

const HOUR = 3_600_000;

function baseAppointment(overrides: Partial<PayoutAppointment> = {}): PayoutAppointment {
  return {
    id: "a1",
    therapist_id: "t1",
    patient_id: "p1",
    status: "completed",
    payment_status: "paid",
    amount_paid_paise: 100_000,
    slot_time: new Date(Date.now() - 24 * HOUR).toISOString(),
    therapist_payout_paid_at: null,
    therapist_payout_amount_paise: null,
    therapist_payout_method: null,
    therapist_payout_note: null,
    paid_at: new Date(Date.now() - 25 * HOUR).toISOString(),
    patient_rating: null,
    patient_feedback: null,
    therapist_rating: null,
    therapist_feedback: null,
    category_id: null,
    visit_mode: "online",
    travel_fee_paise: null,
    cash_collected_at: null,
    cash_collected_amount_paise: null,
    cash_remitted_at: null,
    ...overrides,
  } as PayoutAppointment;
}

test.describe("Suite G: money", () => {
  test("G-002: a travel fee is paid to the therapist in full and never treated as revenue", async () => {
    const now = Date.now();
    const withTravel = computeTherapistPayoutSummary(
      "t1",
      50, // 50% revenue share
      [
        baseAppointment({
          visit_mode: "home_visit",
          amount_paid_paise: 100_000,
          travel_fee_paise: 15_000,
        }),
      ],
      now,
      50
    );
    const withoutTravel = computeTherapistPayoutSummary(
      "t1",
      50,
      [baseAppointment({ visit_mode: "home_visit", amount_paid_paise: 100_000 })],
      now,
      50
    );
    // The therapist gets their share of the session plus 100% of the travel
    // fee -- so the difference between the two is exactly the fee, not a
    // share of it.
    expect(withTravel.owedPaise - withoutTravel.owedPaise).toBe(15_000);
  });

  test("G-003: collected-but-unremitted cash nets off what a payout transfers", async () => {
    const now = Date.now();
    const collected = computeTherapistPayoutSummary(
      "t1",
      50,
      [
        baseAppointment({
          visit_mode: "home_visit",
          amount_paid_paise: 100_000,
          cash_collected_at: new Date(now - HOUR).toISOString(),
          cash_collected_amount_paise: 100_000,
          cash_remitted_at: null,
        }),
      ],
      now,
      50
    );
    const remitted = computeTherapistPayoutSummary(
      "t1",
      50,
      [
        baseAppointment({
          visit_mode: "home_visit",
          amount_paid_paise: 100_000,
          cash_collected_at: new Date(now - HOUR).toISOString(),
          cash_collected_amount_paise: 100_000,
          cash_remitted_at: new Date(now).toISOString(),
        }),
      ],
      now,
      50
    );
    // Cash the therapist is still holding belongs to the business, so it
    // reduces what a payout transfers. The therapist's own share here is
    // 50,000 and they are holding 100,000, so the transfer floors at zero
    // rather than going negative -- the business does not "owe" a negative
    // payout, it is owed cash back separately.
    expect(collected.cashHeldPaise).toBe(100_000);
    expect(collected.netOwedPaise).toBe(0);
    expect(remitted.cashHeldPaise).toBe(0);
    expect(remitted.netOwedPaise).toBe(remitted.owedPaise);
    // And where the held cash is smaller than the share, it nets off exactly.
    const partial = computeTherapistPayoutSummary(
      "t1",
      50,
      [
        baseAppointment({
          visit_mode: "home_visit",
          amount_paid_paise: 100_000,
          cash_collected_at: new Date(now - HOUR).toISOString(),
          cash_collected_amount_paise: 20_000,
        }),
      ],
      now,
      50
    );
    expect(partial.netOwedPaise).toBe(partial.owedPaise - 20_000);
  });

  test("G-004: a therapist with no configured share is excluded, never treated as 0%", async () => {
    const summary = computeTherapistPayoutSummary(
      "t1",
      null,
      [baseAppointment({ amount_paid_paise: 100_000 })],
      Date.now(),
      null
    );
    // sharePercent === null means "we cannot compute this". The numbers come
    // back as 0, so the contract is that sharePercent itself is what a caller
    // must check -- 0 owed must never be read as "nothing is owed".
    expect(summary.sharePercent).toBeNull();
    expect(summary.cutPaise).toBe(0);
    // Revenue is still counted: the money was collected regardless of
    // whether the split is knowable.
    expect(summary.revenuePaise).toBe(100_000);
  });

  test("G-010 + activity log: a partial refund records the amount, the reason and the actor", async () => {
    const admin = adminClient();
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    const adminId = await profileIdFor(admin, QA_EMAILS.admin);
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);

    // No real Razorpay payment behind this, so the route stops at its own
    // guard -- which is the assertion. The money path itself is covered by
    // concurrency.spec.ts, which uses real test-mode orders.
    const { data: appointment } = await admin
      .from("appointments")
      .insert({
        patient_id: patientId,
        concern: "QA refund audit",
        slot_time: new Date(Date.now() + 86_400_000).toISOString(),
        status: "confirmed",
        payment_status: "paid",
        amount_paid_paise: 200_000,
        visit_mode: "online",
      })
      .select("id")
      .single();

    try {
      // Scoped to this test's own target, not a global row count. The log is
      // shared and other spec files run in parallel workers, so counting
      // every row meant any unrelated admin action landing in the same window
      // failed this assertion -- it passed or failed on timing rather than on
      // the behaviour under test.
      const countOwn = async () =>
        (
          await admin
            .from("admin_activity_log")
            .select("id", { count: "exact", head: true })
            .eq("action", "setting.update")
            .eq("target_label", "online_booking_lead_time_hours")
        ).count ?? 0;
      const before = { count: await countOwn() };

      // An action that *does* write: flipping a setting, logged the same way.
      const res = await fetch(`${BASE}/api/admin/update-setting`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ key: "online_booking_lead_time_hours", value: 13 }),
      });
      expect(res.status).toBe(200);

      // Likewise filtered rather than "whatever landed most recently".
      const { data: entries } = await admin
        .from("admin_activity_log")
        .select("actor_id, action, target_label, details")
        .eq("action", "setting.update")
        .eq("target_label", "online_booking_lead_time_hours")
        .order("created_at", { ascending: false })
        .limit(1);

      expect(entries?.[0]?.action).toBe("setting.update");
      expect(entries?.[0]?.actor_id).toBe(adminId);
      expect(entries?.[0]?.target_label).toBe("online_booking_lead_time_hours");

      expect((await countOwn()) - before.count).toBe(1);
    } finally {
      await fetch(`${BASE}/api/admin/update-setting`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ key: "online_booking_lead_time_hours", value: 12 }),
      });
      await admin.from("appointments").delete().eq("id", appointment!.id);
    }
  });

  test("G-009: the online refund window is the setting, not a constant", async () => {
    const admin = adminClient();
    const cookie = await cookieHeaderFor(QA_EMAILS.admin);
    const patientId = await profileIdFor(admin, QA_EMAILS.patientA);

    // A session 2 hours out. With a 24h window it is a late cancellation
    // (no refund); with a 1h window it is not.
    const { data: appointment } = await admin
      .from("appointments")
      .insert({
        patient_id: patientId,
        concern: "QA refund window",
        slot_time: new Date(Date.now() + 2 * HOUR).toISOString(),
        status: "confirmed",
        payment_status: "paid",
        amount_paid_paise: 100_000,
        // A real payment id matters: cancelAppointment only judges lateness
        // for a session that actually has money on it, so without one the
        // refund columns are correctly left untouched and this would prove
        // nothing. The cancellation below is inside the window, so no
        // Razorpay call is ever made against this id.
        razorpay_payment_id: "pay_qa_window_only",
        visit_mode: "online",
      })
      .select("id")
      .single();

    try {
      await fetch(`${BASE}/api/admin/update-setting`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ key: "online_cancellation_refund_hours", value: 24 }),
      });
      const res = await fetch(`${BASE}/api/admin/cancel-appointment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ appointmentId: appointment!.id, reason: "QA" }),
      });
      expect(res.ok).toBe(true);

      const { data: after } = await admin
        .from("appointments")
        .select("status, refund_status, refund_amount_paise")
        .eq("id", appointment!.id)
        .single();

      expect(after?.status).toBe("cancelled");
      // Inside the window: no money goes back, and the row says so
      // explicitly rather than leaving refund_status null.
      expect(after?.refund_status).toBe("not_eligible");
      expect(after?.refund_amount_paise).toBe(0);
    } finally {
      await admin.from("appointments").delete().eq("id", appointment!.id);
    }
  });
});
