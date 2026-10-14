// An admin refunding money, end to end through the gateway: a partial refund
// on a session and a programme refund each reach the gateway for the figure
// the route worked out, against the payment that took the money, and are
// recorded against the right row with the gateway's own refund id. When the
// gateway says no, the refusal is what gets recorded -- the session or the
// purchase is left exactly as refundable as it was, the attempt is `failed`
// with the gateway's reason, and the admin is told that reason. A refusal
// recorded as a success is the one outcome a refund screen must never have.
//
// The arithmetic and the attempt record's storage rules are proven elsewhere
// (admin-money, refund-attempts, refund-attempt-sql-checks.sql); this is the
// part that needed a gateway. That gateway is the loopback fake
// (e2e/fake-razorpay.mjs), which can be told to refuse the next refund the
// way Razorpay does; this file skips, with the reason, where it is not
// configured, and never reaches a real Razorpay.
//
// Writes append-only refund-attempt, payment and care-plan rows, so it runs
// on a disposable project only.
import { test, expect, type APIRequestContext } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BASE, QA_EMAILS, adminClient, profileIdFor } from "./helpers";
import { fakeGatewaySkipReason, gateway } from "./fakeGateway";
import {
  apiAs,
  createFixtureAccount,
  createProgrammeOrder,
  creditsFor,
  insertBooking,
  payForSession,
  recommendProgramme,
  refundAttemptsFor,
  verifyProgramme,
  type FixtureAccount,
  type PaidSession,
} from "./moneyFixtures";

test.describe.configure({ mode: "serial" });

test.skip(
  process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
  "writes append-only refund-attempt and payment rows; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);

let db: SupabaseClient;
let skipReason: string | null = null;
let patient: FixtureAccount;
let patientCtx: APIRequestContext;
let adminCtx: APIRequestContext;
let adminId = "";
let session: PaidSession;

test.beforeAll(async () => {
  skipReason = await fakeGatewaySkipReason();
  if (skipReason) return;
  db = adminClient();
  patient = await createFixtureAccount(db, "patient", "adminrefund");
  patientCtx = await apiAs(patient.email);
  adminCtx = await apiAs(QA_EMAILS.admin);
  adminId = await profileIdFor(db, QA_EMAILS.admin);
});

test.beforeEach(() => {
  test.skip(!!skipReason, skipReason ?? "");
});

test.afterAll(async () => {
  // The partly refunded session would otherwise sit paid in the future.
  if (session) {
    await patientCtx?.post(`${BASE}/api/appointments/cancel`, {
      data: { appointmentId: session.appointmentId, reason: "E2E tidy-up" },
    });
  }
  await patientCtx?.dispose();
  await adminCtx?.dispose();
});

async function refundPartial(appointmentId: string, amountPaise: number) {
  const res = await adminCtx.post(`${BASE}/api/admin/refund-session-partial`, {
    data: { appointmentId, amountPaise, reason: "Goodwill: the call dropped twice" },
  });
  return { status: res.status(), body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

async function sessionRefund(appointmentId: string) {
  const { data } = await db
    .from("appointments")
    .select("refund_status, refund_amount_paise, refund_id, refund_is_manual, refunded_by, refunded_at, refund_reason")
    .eq("id", appointmentId)
    .single();
  return data!;
}

test("AR-001: a partial refund on a session reaches the gateway and is recorded against that session", async () => {
  test.setTimeout(90_000);
  const { id } = await insertBooking(db, { patient_id: patient.id }, { daysAhead: 55 });
  session = await payForSession(patientCtx, id);
  const partPaise = 20_000;
  expect(session.amount).toBeGreaterThan(partPaise * 2);

  // More than was paid is refused before anything is sent.
  const since = await gateway.seq();
  const tooMuch = await refundPartial(id, session.amount + 1);
  expect(tooMuch.status).toBe(400);
  expect((await gateway.callsSince(since)).filter((c) => c.path.endsWith("/refund"))).toHaveLength(0);

  const res = await refundPartial(id, partPaise);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  expect(res.body).toMatchObject({ success: true, refundedPaise: partPaise, totalRefundedPaise: partPaise });

  const refunds = await gateway.refundsFor(session.payment.id);
  expect(refunds).toHaveLength(1);
  expect(refunds[0]).toMatchObject({ amount: partPaise, payment_id: session.payment.id, status: "processed" });
  const row = await sessionRefund(id);
  expect(row).toMatchObject({
    refund_status: "processed",
    refund_amount_paise: partPaise,
    refund_id: refunds[0].id,
    refund_is_manual: true,
    refunded_by: adminId,
    refund_reason: "Goodwill: the call dropped twice",
  });
  expect(row.refunded_at).toBeTruthy();
  const attempts = await refundAttemptsFor(db, "appointment_id", id);
  expect(attempts).toHaveLength(1);
  expect(attempts[0]).toMatchObject({
    status: "succeeded",
    amount_paise: partPaise,
    razorpay_payment_id: session.payment.id,
    razorpay_refund_id: refunds[0].id,
  });
});

test("AR-002: a refund the gateway refuses is recorded as refused, and the session stays refundable", async () => {
  test.setTimeout(90_000);
  const id = session.appointmentId;
  const before = await sessionRefund(id);
  await gateway.failNextRefund({
    description: "Your account does not have enough balance to carry out the refund operation.",
  });

  const refused = await refundPartial(id, 10_000);
  expect(refused.status).toBe(502);
  // The admin is told what the gateway said, not "check Razorpay".
  expect(String(refused.body.error)).toMatch(/enough balance/);
  expect(String(refused.body.error)).toMatch(/Nothing was refunded/);

  // Nothing claims money went back: the running total, the status, the
  // gateway id and when (and by whom) the last refund was made are exactly
  // what they were, and the gateway holds no new refund.
  expect(await sessionRefund(id)).toEqual(before);
  expect(await gateway.refundsFor(session.payment.id)).toHaveLength(1);
  const attempts = await refundAttemptsFor(db, "appointment_id", id);
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toMatchObject({ status: "failed", amount_paise: 10_000, razorpay_refund_id: null });
  expect(attempts[1].failure_detail).toMatch(/enough balance/);

  // The retry goes through, on top of the first refund.
  const retry = await refundPartial(id, 10_000);
  expect(retry.status, JSON.stringify(retry.body)).toBe(200);
  expect(retry.body).toMatchObject({ totalRefundedPaise: 30_000 });
  const refunds = await gateway.refundsFor(session.payment.id);
  expect(refunds.map((r) => r.amount)).toEqual([20_000, 10_000]);
  expect((await sessionRefund(id)).refund_amount_paise).toBe(30_000);
});

async function buyProgramme(sessionCount: number) {
  const plan = await recommendProgramme(db, patient.id, { sessionCount });
  const order = await createProgrammeOrder(patientCtx, plan.carePlanVersionId);
  const payment = await gateway.pay(order.orderId);
  const verified = await verifyProgramme(patientCtx, order, payment.id);
  expect(verified.status, JSON.stringify(verified.body)).toBe(200);
  return { plan, order, payment };
}

async function refundProgramme(purchaseId: string) {
  const res = await adminCtx.post(`${BASE}/api/admin/refund-package`, {
    data: { purchaseId, reason: "Patient moved abroad" },
  });
  return { status: res.status(), body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

async function purchaseRefund(purchaseId: string) {
  const { data } = await db
    .from("patient_package_purchases")
    .select("status, refund_amount_paise, refund_id, refunded_at")
    .eq("id", purchaseId)
    .single();
  return data!;
}

test("AR-003: a programme refund the gateway refuses leaves the programme active, then goes through on retry", async () => {
  test.setTimeout(150_000);
  const { plan, order, payment } = await buyProgramme(2);
  // Nothing delivered yet, so every session is refundable at the price paid.
  const perSession = Math.round(order.amount / plan.sessionCount);
  const expected = Math.min(perSession * plan.sessionCount, order.amount);

  await gateway.failNextRefund();
  const refused = await refundProgramme(order.purchaseId);
  expect(refused.status).toBe(502);
  expect(String(refused.body.error)).toMatch(/Razorpay refused the refund/);
  expect(await purchaseRefund(order.purchaseId)).toEqual({
    status: "active",
    refund_amount_paise: null,
    refund_id: null,
    refunded_at: null,
  });
  expect(await gateway.refundsFor(payment.id)).toHaveLength(0);
  const failed = await refundAttemptsFor(db, "package_purchase_id", order.purchaseId);
  expect(failed).toHaveLength(1);
  expect(failed[0]).toMatchObject({ status: "failed", amount_paise: expected, razorpay_refund_id: null });
  // The credits are untouched: nothing was voided for a refund that never happened.
  const { ledger: unvoided } = await creditsFor(db, order.purchaseId);
  expect(unvoided.filter((l) => l.entry_type === "refund_void")).toHaveLength(0);

  const since = await gateway.seq();
  const res = await refundProgramme(order.purchaseId);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  expect(res.body).toMatchObject({ success: true, refundAmountPaise: expected });

  const calls = (await gateway.callsSince(since)).filter((c) => c.path.endsWith("/refund"));
  expect(calls).toHaveLength(1);
  expect(calls[0].path).toBe(`/v1/payments/${payment.id}/refund`);
  expect(calls[0].body).toMatchObject({ amount: expected });
  const refunds = await gateway.refundsFor(payment.id);
  expect(refunds).toHaveLength(1);

  const row = await purchaseRefund(order.purchaseId);
  expect(row).toMatchObject({ status: "refunded", refund_amount_paise: expected, refund_id: refunds[0].id });
  expect(row.refunded_at).toBeTruthy();
  const attempts = await refundAttemptsFor(db, "package_purchase_id", order.purchaseId);
  expect(attempts.map((a) => a.status)).toEqual(["failed", "succeeded"]);
  expect(attempts[1]).toMatchObject({ amount_paise: expected, razorpay_refund_id: refunds[0].id });
  // The unspent credits are voided with the money.
  const { ledger } = await creditsFor(db, order.purchaseId);
  expect(ledger.filter((l) => l.entry_type === "refund_void")).toHaveLength(1);

  // A second refund is refused and sends nothing.
  const sinceAgain = await gateway.seq();
  const twice = await refundProgramme(order.purchaseId);
  expect(twice.status).toBe(400);
  expect((await gateway.callsSince(sinceAgain)).filter((c) => c.path.endsWith("/refund"))).toHaveLength(0);
});
