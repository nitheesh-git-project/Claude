// A patient paying, end to end through the gateway: create-order prices the
// booking on the server, the gateway captures, and a correctly signed verify
// marks it paid -- exactly once. Then the same for a programme, whose capture
// also grants its session credits, exactly once.
//
// The gateway is the loopback fake (e2e/fake-razorpay.mjs): this file skips,
// with the reason, wherever it is not configured, and never reaches a real
// Razorpay. What it stands in for is only the hosted checkout sheet -- the
// signature the sheet hands the browser is computed here with the same
// RAZORPAY_KEY_SECRET the server checks it against, and every order, payment
// and amount comes from the app's own calls to the gateway.
//
// Writes payments, user-activity and care-plan rows that are append-only, so
// it runs on a disposable project only (the same opt-in recommendation-course
// uses).
import { test, expect, type APIRequestContext } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BASE, QA_EMAILS, adminClient } from "./helpers";
import { fakeGatewaySkipReason, gateway } from "./fakeGateway";
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
import { SESSION_FEE_PAISE } from "../src/lib/pricing";

test.describe.configure({ mode: "serial" });

test.skip(
  process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
  "writes append-only payment and care-plan rows; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);

let db: SupabaseClient;
let skipReason: string | null = null;
let patient: FixtureAccount;
let patientCtx: APIRequestContext;
const liveBookings: string[] = [];

test.beforeAll(async () => {
  skipReason = await fakeGatewaySkipReason();
  if (skipReason) return;
  db = adminClient();
  patient = await createFixtureAccount(db, "patient", "paycap");
  patientCtx = await apiAs(patient.email);
});

test.beforeEach(() => {
  test.skip(!!skipReason, skipReason ?? "");
});

test.afterAll(async () => {
  // A paid session left in the future would sit in the admin's queue on a
  // long-lived project. Cancelling it as the patient refunds it through the
  // fake gateway, which is the ordinary end of a booking nobody attends.
  for (const id of liveBookings) {
    await patientCtx?.post(`${BASE}/api/appointments/cancel`, { data: { appointmentId: id, reason: "E2E tidy-up" } });
  }
  await patientCtx?.dispose();
});

test("PAY-CAP-001: a session is priced by the server, paid through the gateway and verified once", async () => {
  test.setTimeout(90_000);
  const { id: appointmentId } = await insertBooking(db, { patient_id: patient.id });
  liveBookings.push(appointmentId);
  const since = await gateway.seq();

  // The order: the body names a booking and nothing about money, and the
  // gateway is asked for the price the server worked out.
  const { orderId, amount } = await createSessionOrder(patientCtx, appointmentId);
  expect(amount).toBe(SESSION_FEE_PAISE);
  const created = (await gateway.callsSince(since)).filter((c) => c.method === "POST" && c.path === "/v1/orders");
  expect(created, "one order reached the gateway").toHaveLength(1);
  expect(created[0].body).toMatchObject({ amount, currency: "INR", receipt: appointmentId });
  const { data: ordered } = await db
    .from("appointments")
    .select("razorpay_order_id, amount_paid_paise, payment_status")
    .eq("id", appointmentId)
    .single();
  expect(ordered).toEqual({ razorpay_order_id: orderId, amount_paid_paise: amount, payment_status: "unpaid" });

  // The patient completes the hosted checkout.
  const payment = await gateway.pay(orderId);
  expect(payment.amount).toBe(amount);

  // A callback with a signature the server did not issue changes nothing.
  const forged = await verifySession(patientCtx, appointmentId, orderId, payment.id, "0".repeat(64));
  expect(forged.status).toBe(400);
  expect(String(forged.body.error)).toMatch(/Signature verification failed/);
  const wrongOrder = await verifySession(patientCtx, appointmentId, "order_notthisone", payment.id);
  expect(wrongOrder.status).toBe(400);
  expect(String(wrongOrder.body.error)).toMatch(/Order mismatch/);
  // Another patient cannot verify this booking, signature or not.
  const stranger = await apiAs(QA_EMAILS.patientA);
  try {
    const res = await stranger.post(`${BASE}/api/razorpay/verify`, {
      data: { appointmentId, razorpay_order_id: orderId, razorpay_payment_id: payment.id, razorpay_signature: "x" },
    });
    expect(res.status()).toBe(404);
  } finally {
    await stranger.dispose();
  }
  expect((await db.from("appointments").select("payment_status").eq("id", appointmentId).single()).data).toEqual({
    payment_status: "unpaid",
  });
  expect(await paymentsForOrder(db, orderId)).toHaveLength(0);

  // The genuine callback.
  const verified = await verifySession(patientCtx, appointmentId, orderId, payment.id);
  expect(verified.status, JSON.stringify(verified.body)).toBe(200);
  expect(verified.body.success).toBe(true);
  const { data: paid } = await db
    .from("appointments")
    .select("payment_status, razorpay_payment_id, paid_at, amount_paid_paise")
    .eq("id", appointmentId)
    .single();
  expect(paid).toMatchObject({ payment_status: "paid", razorpay_payment_id: payment.id, amount_paid_paise: amount });
  expect(paid!.paid_at).toBeTruthy();
  const recorded = await paymentsForOrder(db, orderId);
  expect(recorded).toHaveLength(1);
  expect(recorded[0]).toMatchObject({
    status: "captured",
    razorpay_payment_id: payment.id,
    amount_paise: amount,
    target_appointment_id: appointmentId,
  });

  // A replayed callback -- a double-tapped button, a resent request -- is a
  // success that changes nothing: not the money record, not when it was paid.
  const replay = await verifySession(patientCtx, appointmentId, orderId, payment.id);
  expect(replay.status, JSON.stringify(replay.body)).toBe(200);
  const { data: after } = await db
    .from("appointments")
    .select("payment_status, razorpay_payment_id, paid_at")
    .eq("id", appointmentId)
    .single();
  expect(after).toEqual({ payment_status: "paid", razorpay_payment_id: payment.id, paid_at: paid!.paid_at });
  expect(await paymentsForOrder(db, orderId)).toHaveLength(1);

  // And the booking cannot be checked out a second time.
  const again = await patientCtx.post(`${BASE}/api/razorpay/create-order`, { data: { appointmentId } });
  expect(again.status()).toBe(400);
  expect((await again.json()).error).toMatch(/already paid/);
});

test("PAY-CAP-002: a programme bought through the gateway grants its credits exactly once", async () => {
  test.setTimeout(120_000);
  const plan = await recommendProgramme(db, patient.id, { sessionCount: 3 });
  const since = await gateway.seq();

  const order = await createProgrammeOrder(patientCtx, plan.carePlanVersionId);
  expect(order.amount, "the programme is charged at what the recommendation priced").toBe(plan.pricePaise);
  const created = (await gateway.callsSince(since)).filter((c) => c.method === "POST" && c.path === "/v1/orders");
  expect(created).toHaveLength(1);
  expect(created[0].body).toMatchObject({ amount: plan.pricePaise, receipt: order.purchaseId });

  const payment = await gateway.pay(order.orderId);

  const forged = await verifyProgramme(patientCtx, order, payment.id, "f".repeat(64));
  expect(forged.status).toBe(400);
  expect((await creditsFor(db, order.purchaseId)).entitlements).toHaveLength(0);

  const verified = await verifyProgramme(patientCtx, order, payment.id);
  expect(verified.status, JSON.stringify(verified.body)).toBe(200);
  expect(verified.body).toMatchObject({ success: true, purchaseId: order.purchaseId });

  const { data: purchase } = await db
    .from("patient_package_purchases")
    .select("payment_status, razorpay_payment_id, paid_at, expires_at, session_count, amount_paid_paise")
    .eq("id", order.purchaseId)
    .single();
  expect(purchase).toMatchObject({
    payment_status: "paid",
    razorpay_payment_id: payment.id,
    session_count: plan.sessionCount,
    amount_paid_paise: plan.pricePaise,
  });
  expect(purchase!.expires_at, "validity starts when the payment clears").toBeTruthy();

  const assertCreditsOnce = async () => {
    const { entitlements, ledger } = await creditsFor(db, order.purchaseId);
    expect(entitlements).toHaveLength(1);
    expect(entitlements[0]).toMatchObject({
      sessions_granted: plan.sessionCount,
      granted_count: plan.sessionCount,
      reserved_count: 0,
      consumed_count: 0,
      status: "active",
    });
    const grants = ledger.filter((l) => l.entry_type === "grant");
    expect(grants).toHaveLength(1);
    expect(grants[0].delta_granted).toBe(plan.sessionCount);
    const recorded = await paymentsForOrder(db, order.orderId);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ status: "captured", target_package_purchase_id: order.purchaseId });
  };
  await assertCreditsOnce();
  const { data: version } = await db.from("care_plan_versions").select("care_plan_id").eq("id", plan.carePlanVersionId).single();
  const { data: carePlan } = await db
    .from("care_plans")
    .select("status, accepted_version_id")
    .eq("id", version!.care_plan_id)
    .single();
  expect(carePlan, "the recommendation is closed as accepted").toEqual({
    status: "accepted",
    accepted_version_id: plan.carePlanVersionId,
  });

  // Replayed: still one entitlement, one grant, one payment, same paid_at.
  const replay = await verifyProgramme(patientCtx, order, payment.id);
  expect(replay.status, JSON.stringify(replay.body)).toBe(200);
  await assertCreditsOnce();
  const { data: afterReplay } = await db.from("patient_package_purchases").select("paid_at").eq("id", order.purchaseId).single();
  expect(afterReplay!.paid_at).toBe(purchase!.paid_at);

  // A paid plan is not ordered again.
  const again = await patientCtx.post(`${BASE}/api/care-plan/create-order`, { data: { carePlanVersionId: plan.carePlanVersionId } });
  expect(again.status()).toBe(409);
  expect((await again.json()).error).toMatch(/already bought/);
});
