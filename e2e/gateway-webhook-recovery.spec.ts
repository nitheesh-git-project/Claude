// A patient pays and closes the tab: the gateway has the money, the browser
// never reaches /api/razorpay/verify, and the booking would sit unpaid for
// ever. Razorpay's signed webhook is the recovery, and it must apply the
// capture exactly once however many times it is delivered -- Razorpay
// delivers at least once, and retries until it gets a 2xx.
//
// Every webhook here is signed over the exact bytes posted, with the
// RAZORPAY_WEBHOOK_SECRET the dev server holds (generated per run in the
// quality gate). The payments themselves are captured by the loopback fake
// gateway (e2e/fake-razorpay.mjs); this file skips, with the reason, where it
// is not configured, and never reaches a real Razorpay.
//
// Writes append-only webhook, payment and care-plan rows, so it runs on a
// disposable project only.
import { test, expect, type APIRequestContext } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BASE, adminClient } from "./helpers";
import { capturedEvent, fakeGatewaySkipReason, gateway, postWebhook } from "./fakeGateway";
import {
  apiAs,
  createFixtureAccount,
  createProgrammeOrder,
  createSessionOrder,
  creditsFor,
  insertBooking,
  paymentsForOrder,
  recommendProgramme,
  verifyProgramme,
  verifySession,
  type FixtureAccount,
} from "./moneyFixtures";

test.describe.configure({ mode: "serial" });

test.skip(
  process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
  "writes append-only webhook and payment rows; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);

let db: SupabaseClient;
let skipReason: string | null = null;
let patient: FixtureAccount;
let patientCtx: APIRequestContext;
const runTag = `e2e${Date.now()}`;
const liveBookings: string[] = [];

test.beforeAll(async () => {
  skipReason = await fakeGatewaySkipReason({ webhook: true });
  if (skipReason) return;
  db = adminClient();
  patient = await createFixtureAccount(db, "patient", "webhook");
  patientCtx = await apiAs(patient.email);
});

test.beforeEach(() => {
  test.skip(!!skipReason, skipReason ?? "");
});

test.afterAll(async () => {
  // A paid future session would sit in the admin's queue on a long-lived
  // project; cancelling it as the patient refunds it through the fake.
  for (const id of liveBookings) {
    await patientCtx?.post(`${BASE}/api/appointments/cancel`, { data: { appointmentId: id, reason: "E2E tidy-up" } });
  }
  await patientCtx?.dispose();
});

async function eventRows(eventId: string) {
  const { data, error } = await db
    .from("payment_webhook_events")
    .select("id, event_type, processed_at, processing_error, razorpay_payment_id")
    .eq("razorpay_event_id", eventId);
  expect(error, error?.message).toBeNull();
  return data ?? [];
}

async function bookingPayment(appointmentId: string) {
  const { data } = await db
    .from("appointments")
    .select("payment_status, razorpay_payment_id, paid_at")
    .eq("id", appointmentId)
    .single();
  return data!;
}

test("WH-001: a capture the browser never reported is recovered by the signed webhook, exactly once", async () => {
  test.setTimeout(90_000);
  const { id: appointmentId } = await insertBooking(db, { patient_id: patient.id }, { daysAhead: 50 });
  liveBookings.push(appointmentId);
  const { orderId } = await createSessionOrder(patientCtx, appointmentId);
  // Paid at the gateway; the tab closed before the callback.
  const payment = await gateway.pay(orderId);
  expect((await bookingPayment(appointmentId)).payment_status).toBe("unpaid");

  const event = capturedEvent(payment);
  const eventId = `evt_${runTag}_cap`;

  // A forged delivery is refused before anything is recorded -- including
  // the dedup row, so it cannot spend the event id a genuine one needs.
  const forged = await postWebhook(event, { eventId, secret: "not-the-webhook-secret" });
  expect(forged.status).toBe(400);
  expect(forged.body.error).toBe("Invalid signature");
  const unsigned = await postWebhook(event, { eventId, signature: "" });
  expect(unsigned.status).toBe(400);
  expect(await eventRows(eventId)).toHaveLength(0);
  expect((await bookingPayment(appointmentId)).payment_status).toBe("unpaid");
  expect(await paymentsForOrder(db, orderId)).toHaveLength(0);

  // The genuine delivery applies the capture.
  const first = await postWebhook(event, { eventId });
  expect(first.status, JSON.stringify(first.body)).toBe(200);
  expect(first.body).toMatchObject({ received: true, processed: true, applied: true, alreadyCaptured: false });
  const paid = await bookingPayment(appointmentId);
  expect(paid).toMatchObject({ payment_status: "paid", razorpay_payment_id: payment.id });
  expect(paid.paid_at).toBeTruthy();
  const recorded = await paymentsForOrder(db, orderId);
  expect(recorded).toHaveLength(1);
  expect(recorded[0]).toMatchObject({
    status: "captured",
    razorpay_payment_id: payment.id,
    captured_amount_paise: payment.amount,
    target_appointment_id: appointmentId,
  });
  const [row] = await eventRows(eventId);
  expect(row).toMatchObject({ event_type: "payment.captured", processing_error: null, razorpay_payment_id: payment.id });
  expect(row.processed_at).toBeTruthy();

  // Razorpay's retry of the same delivery is a duplicate: acknowledged, so
  // it stops retrying, and nothing changes.
  const retry = await postWebhook(event, { eventId });
  expect(retry.status).toBe(200);
  expect(retry.body).toMatchObject({ received: true, duplicate: true });
  expect(await eventRows(eventId)).toHaveLength(1);

  // A second event for the same capture (a new event id) finds it captured.
  const second = await postWebhook(event, { eventId: `evt_${runTag}_cap2` });
  expect(second.status).toBe(200);
  expect(second.body).toMatchObject({ processed: true, applied: false, alreadyCaptured: true });

  // And the browser callback, arriving late after all, is a no-op success.
  const late = await verifySession(patientCtx, appointmentId, orderId, payment.id);
  expect(late.status, JSON.stringify(late.body)).toBe(200);

  expect(await bookingPayment(appointmentId), "paid once, at the first delivery").toEqual(paid);
  expect(await paymentsForOrder(db, orderId)).toHaveLength(1);
});

test("WH-002: an authorization is recorded and applies nothing", async () => {
  test.setTimeout(90_000);
  const { id: appointmentId } = await insertBooking(db, { patient_id: patient.id }, { daysAhead: 52 });
  const { orderId } = await createSessionOrder(patientCtx, appointmentId);
  const payment = await gateway.pay(orderId, { status: "authorized" });
  const eventId = `evt_${runTag}_auth`;
  const authorized = capturedEvent(payment) as Record<string, unknown> & {
    payload: { payment: { entity: { status: string; captured: boolean } } };
  };
  authorized.event = "payment.authorized";
  authorized.payload.payment.entity.status = "authorized";
  authorized.payload.payment.entity.captured = false;

  const res = await postWebhook(authorized, { eventId });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ received: true, processed: false, eventType: "payment.authorized" });
  const [row] = await eventRows(eventId);
  expect(row.event_type).toBe("payment.authorized");
  expect(row.processed_at).toBeTruthy();
  // A hold is not money taken: the booking stays unpaid and nothing is recorded as captured.
  expect((await bookingPayment(appointmentId)).payment_status).toBe("unpaid");
  expect(await paymentsForOrder(db, orderId)).toHaveLength(0);
  await db.from("appointments").update({ status: "cancelled", cancellation_reason: "E2E tidy-up" }).eq("id", appointmentId);
});

test("WH-003: a programme paid with the tab closed gets its credits from the webhook, once", async () => {
  test.setTimeout(120_000);
  const plan = await recommendProgramme(db, patient.id, { sessionCount: 2 });
  const order = await createProgrammeOrder(patientCtx, plan.carePlanVersionId);
  const payment = await gateway.pay(order.orderId);
  expect((await creditsFor(db, order.purchaseId)).entitlements).toHaveLength(0);

  const eventId = `evt_${runTag}_pkg`;
  const res = await postWebhook(capturedEvent(payment), { eventId });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  expect(res.body).toMatchObject({ processed: true, applied: true });

  const { data: purchase } = await db
    .from("patient_package_purchases")
    .select("payment_status, razorpay_payment_id, expires_at, paid_at")
    .eq("id", order.purchaseId)
    .single();
  expect(purchase).toMatchObject({ payment_status: "paid", razorpay_payment_id: payment.id });
  expect(purchase!.expires_at, "the webhook path sets validity too, not only the browser's").toBeTruthy();

  const assertOnce = async () => {
    const { entitlements, ledger } = await creditsFor(db, order.purchaseId);
    expect(entitlements).toHaveLength(1);
    expect(entitlements[0]).toMatchObject({ sessions_granted: plan.sessionCount, granted_count: plan.sessionCount });
    expect(ledger.filter((l) => l.entry_type === "grant")).toHaveLength(1);
    expect(await paymentsForOrder(db, order.orderId)).toHaveLength(1);
  };
  await assertOnce();

  // The retry, and then the browser callback after all: still once.
  expect((await postWebhook(capturedEvent(payment), { eventId })).body).toMatchObject({ duplicate: true });
  const late = await verifyProgramme(patientCtx, order, payment.id);
  expect(late.status, JSON.stringify(late.body)).toBe(200);
  await assertOnce();
  const { data: after } = await db.from("patient_package_purchases").select("paid_at").eq("id", order.purchaseId).single();
  expect(after!.paid_at).toBe(purchase!.paid_at);
});
