// A patient cancelling a session they paid for. Outside the refund window the
// money goes back on its own: the refund reaches the gateway for exactly what
// was charged, against the payment that charged it, and the session records
// the gateway's refund id. Inside the window nothing is refunded, nothing is
// sent to the gateway, and the session says why.
//
// The rule (src/lib/cancelAppointment.ts) reads the window from
// site_settings.online_cancellation_refund_hours, so this file reads it too
// rather than quoting the 24-hour fallback. The gateway is the loopback fake
// (e2e/fake-razorpay.mjs); this file skips, with the reason, where it is not
// configured, and never reaches a real Razorpay.
//
// Writes append-only payment and refund-attempt rows, so it runs on a
// disposable project only.
import { test, expect, type APIRequestContext } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BASE, QA_EMAILS, adminClient, wholeHourFromNow } from "./helpers";
import { fakeGatewaySkipReason, gateway } from "./fakeGateway";
import {
  apiAs,
  createFixtureAccount,
  insertBooking,
  payForSession,
  refundAttemptsFor,
  type FixtureAccount,
} from "./moneyFixtures";
import { CANCELLATION_FULL_REFUND_HOURS } from "../src/lib/pricing";

test.describe.configure({ mode: "serial" });

test.skip(
  process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
  "writes append-only payment and refund-attempt rows; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);

let db: SupabaseClient;
let skipReason: string | null = null;
let patient: FixtureAccount;
let patientCtx: APIRequestContext;
let windowHours = CANCELLATION_FULL_REFUND_HOURS;

test.beforeAll(async () => {
  skipReason = await fakeGatewaySkipReason();
  if (skipReason) return;
  db = adminClient();
  patient = await createFixtureAccount(db, "patient", "cancelrefund");
  patientCtx = await apiAs(patient.email);
  const { data } = await db.from("site_settings").select("online_cancellation_refund_hours").maybeSingle();
  windowHours = data?.online_cancellation_refund_hours ?? CANCELLATION_FULL_REFUND_HOURS;
});

test.beforeEach(() => {
  test.skip(!!skipReason, skipReason ?? "");
});

test.afterAll(async () => {
  await patientCtx?.dispose();
});

async function cancel(appointmentId: string) {
  const res = await patientCtx.post(`${BASE}/api/appointments/cancel`, {
    data: { appointmentId, reason: "Plans changed" },
  });
  return { status: res.status(), body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

async function refundColumns(appointmentId: string) {
  const { data } = await db
    .from("appointments")
    .select("status, refund_status, refund_id, refund_amount_paise, refunded_at, refund_reason")
    .eq("id", appointmentId)
    .single();
  return data!;
}

test("CR-001: cancelled outside the window, the whole charge is refunded at the gateway and recorded", async () => {
  test.setTimeout(90_000);
  const { id: appointmentId } = await insertBooking(db, { patient_id: patient.id }, { daysAhead: 40 });
  const paid = await payForSession(patientCtx, appointmentId);
  const since = await gateway.seq();

  const res = await cancel(appointmentId);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  expect(res.body).toMatchObject({ success: true, refunded: true });

  // What reached the gateway: one refund, for what was charged, on the payment that charged it.
  const refundCalls = (await gateway.callsSince(since)).filter((c) => c.method === "POST" && c.path.endsWith("/refund"));
  expect(refundCalls).toHaveLength(1);
  expect(refundCalls[0].path).toBe(`/v1/payments/${paid.payment.id}/refund`);
  expect(refundCalls[0].body).toMatchObject({ amount: paid.amount });
  const refunds = await gateway.refundsFor(paid.payment.id);
  expect(refunds).toHaveLength(1);
  expect(refunds[0]).toMatchObject({ amount: paid.amount, status: "processed" });

  // What the clinic recorded: the gateway's own refund id, against this session.
  const row = await refundColumns(appointmentId);
  expect(row).toMatchObject({
    status: "cancelled",
    refund_status: "processed",
    refund_id: refunds[0].id,
    refund_amount_paise: paid.amount,
    refund_reason: "Plans changed",
  });
  expect(row.refunded_at).toBeTruthy();
  const attempts = await refundAttemptsFor(db, "appointment_id", appointmentId);
  expect(attempts).toHaveLength(1);
  expect(attempts[0]).toMatchObject({
    status: "succeeded",
    amount_paise: paid.amount,
    razorpay_payment_id: paid.payment.id,
    razorpay_refund_id: refunds[0].id,
  });

  // A second cancel is refused and sends nothing.
  const sinceAgain = await gateway.seq();
  const again = await cancel(appointmentId);
  expect(again.status).toBeGreaterThanOrEqual(400);
  expect((await gateway.callsSince(sinceAgain)).filter((c) => c.path.endsWith("/refund"))).toHaveLength(0);
  expect(await gateway.refundsFor(paid.payment.id)).toHaveLength(1);
});

test("CR-002: cancelled inside the window, nothing reaches the gateway and the session says why", async () => {
  test.setTimeout(90_000);
  // Comfortably inside the window and outside the patient's own cancel
  // cut-off (minutes before the slot), on a whole hour.
  const hoursAhead = Math.max(3, windowHours - 3);
  test.skip(hoursAhead >= windowHours, `the refund window is only ${windowHours}h here; no slot fits inside it`);
  const { id: appointmentId } = await insertBooking(
    db,
    { patient_id: patient.id },
    { slotTime: new Date(wholeHourFromNow(hoursAhead)).toISOString() }
  );
  const paid = await payForSession(patientCtx, appointmentId);
  const since = await gateway.seq();

  const res = await cancel(appointmentId);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  expect(res.body).toMatchObject({ success: true, refunded: false });

  expect((await gateway.callsSince(since)).filter((c) => c.path.endsWith("/refund")), "no refund call").toHaveLength(0);
  expect(await gateway.refundsFor(paid.payment.id)).toHaveLength(0);
  const row = await refundColumns(appointmentId);
  expect(row).toMatchObject({
    status: "cancelled",
    refund_status: "not_eligible",
    refund_id: null,
    refund_amount_paise: 0,
  });
  // The window that withheld it, never the patient's own reason.
  expect(row.refund_reason).toBe(`Cancelled within ${windowHours} hours of the slot, so no refund was due`);
  expect(await refundAttemptsFor(db, "appointment_id", appointmentId)).toHaveLength(0);
});

test("CR-003: after partial refunds, cancelling refunds only what is left", async () => {
  // QA F-22: a ₹1,999 session refunded ₹200 and ₹100 asked the gateway for
  // the whole ₹1,999 on cancellation -- more than was left on the payment --
  // so it was refused and recorded as a failed refund.
  test.setTimeout(90_000);
  const adminCtx = await apiAs(QA_EMAILS.admin);
  try {
    const { id: appointmentId } = await insertBooking(db, { patient_id: patient.id }, { daysAhead: 42 });
    const paid = await payForSession(patientCtx, appointmentId);
    expect(paid.amount).toBeGreaterThan(30_000);
    for (const amountPaise of [20_000, 10_000]) {
      const res = await adminCtx.post(`${BASE}/api/admin/refund-session-partial`, {
        data: { appointmentId, amountPaise, reason: "E2E partial before cancelling" },
      });
      expect(res.status(), await res.text()).toBe(200);
    }
    const since = await gateway.seq();

    const res = await cancel(appointmentId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ success: true, refunded: true });

    const refundCalls = (await gateway.callsSince(since)).filter((c) => c.method === "POST" && c.path.endsWith("/refund"));
    expect(refundCalls).toHaveLength(1);
    expect(refundCalls[0].body).toMatchObject({ amount: paid.amount - 30_000 });
    const row = await refundColumns(appointmentId);
    // The running total: both partials plus the remainder, i.e. all of it.
    expect(row).toMatchObject({ status: "cancelled", refund_status: "processed", refund_amount_paise: paid.amount });
    const attempts = await refundAttemptsFor(db, "appointment_id", appointmentId);
    expect(attempts.map((a) => a.amount_paise).sort((x, y) => x - y)).toEqual(
      [10_000, 20_000, paid.amount - 30_000].sort((x, y) => x - y)
    );
    expect(attempts.every((a) => a.status === "succeeded")).toBe(true);
  } finally {
    await adminCtx.dispose();
  }
});
