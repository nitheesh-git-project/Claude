// The concurrency regression suite for Home Visit's money-moving CAS
// guards. Each test fires genuinely parallel requests (Promise.all against
// two independent fetches), not sequential ones, because the bugs these
// guard against are TOCTOU races that only manifest under real concurrency
// -- a sequential re-run would pass even against the unguarded code.
import { test, expect } from "@playwright/test";
import Razorpay from "razorpay";
import { adminClient, cookieHeaderFor, profileIdFor, QA_EMAILS, BASE } from "./helpers";

test.describe.configure({ mode: "serial" });

test("refund-home-visit-package: at most one concurrent request reaches Razorpay", async () => {
  const admin = adminClient();
  const adminCookie = await cookieHeaderFor(QA_EMAILS.admin);

  const { data: pkg } = await admin
    .from("home_visit_packages")
    .select("id, price_paise, visit_count")
    .eq("title", "Single Home Visit")
    .single();
  const patientId = await profileIdFor(admin, QA_EMAILS.patientB);
  const { data: area } = await admin
    .from("home_visit_areas")
    .select("id, travel_fee_paise")
    .eq("pincode", "600017")
    .single();
  expect(pkg && area).toBeTruthy();

  // A real Razorpay test-mode order behind the purchase -- the refund route
  // genuinely calls razorpay.payments.refund(), so this needs a real
  // order id, not a stub, even though the "payment" itself can't be
  // captured through the actual Checkout widget from an automated run.
  const razorpay = new Razorpay({
    key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });
  const totalPaise = pkg!.price_paise + area!.travel_fee_paise * pkg!.visit_count;
  const order = await razorpay.orders.create({ amount: totalPaise, currency: "INR", receipt: `e2e-race-${Date.now()}` });
  const fakePaymentId = `pay_e2erace${Date.now()}`;

  const { data: purchase } = await admin
    .from("home_visit_package_purchases")
    .insert({
      patient_id: patientId,
      package_id: pkg!.id,
      visit_count: pkg!.visit_count,
      amount_paid_paise: pkg!.price_paise,
      travel_fee_paise: area!.travel_fee_paise,
      payment_mode: "prepaid",
      payment_status: "paid",
      status: "active",
      paid_at: new Date().toISOString(),
      razorpay_order_id: order.id,
      razorpay_payment_id: fakePaymentId,
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    })
    .select("id")
    .single();

  const fire = () =>
    fetch(`${BASE}/api/admin/refund-home-visit-package`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ purchaseId: purchase!.id, reason: "e2e concurrency test" }),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

  const [r1, r2] = await Promise.all([fire(), fire()]);

  // The uncapturable fake payment always fails Razorpay's own refund call
  // (502), regardless of the concurrency guard. What this test actually
  // proves is narrower and is the property that matters: the CAS claim
  // lets AT MOST ONE request past it to ever call Razorpay at all. 409 =
  // blocked by the claim, never reached Razorpay. Non-409 = won the claim,
  // called Razorpay, Razorpay said no on its own merits -- a properly
  // guarded attempt, not a double-refund.
  const winners = [r1, r2].filter((r) => r.status !== 409);
  const losers = [r1, r2].filter((r) => r.status === 409);
  expect(winners, JSON.stringify([r1, r2])).toHaveLength(1);
  expect(losers, JSON.stringify([r1, r2])).toHaveLength(1);

  const { data: finalPurchase } = await admin
    .from("home_visit_package_purchases")
    .select("status, refund_id")
    .eq("id", purchase!.id)
    .single();
  // The winner's Razorpay call was always going to fail -- confirm the
  // revert-on-failure path ran, leaving the purchase refundable again
  // rather than stuck permanently claimed with no refund issued.
  expect(finalPurchase!.status).toBe("active");
  expect(finalPurchase!.refund_id).toBeFalsy();
});

test("reassign-home-visit-therapist: concurrent reassigns to different therapists don't double-assign", async () => {
  const admin = adminClient();
  const adminCookie = await cookieHeaderFor(QA_EMAILS.admin);

  const { data: pkg } = await admin
    .from("home_visit_packages")
    .select("id")
    .eq("title", "4-Visit Home Recovery Programme")
    .single();
  const patientId = await profileIdFor(admin, QA_EMAILS.patientA);
  const therapistAId = await profileIdFor(admin, QA_EMAILS.therapistA);
  const therapistBId = await profileIdFor(admin, QA_EMAILS.therapistB);
  const therapistCId = await profileIdFor(admin, QA_EMAILS.therapistC);
  const { data: area } = await admin
    .from("home_visit_areas")
    .select("id, travel_fee_paise")
    .eq("pincode", "600017")
    .single();

  // Clean up leftover appointments from a prior failed run so they can't
  // masquerade as real scheduling conflicts for therapists B/C.
  await admin.from("appointments").delete().eq("visit_address_line1", "E2E Race Test Road");

  const { data: purchase } = await admin
    .from("home_visit_package_purchases")
    .insert({
      patient_id: patientId,
      package_id: pkg!.id,
      visit_count: 4,
      travel_fee_paise: area!.travel_fee_paise,
      payment_mode: "prepaid",
      payment_status: "paid",
      status: "active",
      locked_therapist_id: therapistAId,
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    })
    .select("id")
    .single();

  const slot = new Date(Date.now() + (96 + Math.random() * 200) * 3600 * 1000).toISOString();
  await admin.from("appointments").insert({
    patient_id: patientId,
    therapist_id: therapistAId,
    slot_time: slot,
    status: "confirmed",
    visit_mode: "home_visit",
    home_visit_purchase_id: purchase!.id,
    duration_minutes: 60,
    visit_address_line1: "E2E Race Test Road",
    visit_pincode: "600017",
    travel_fee_paise: area!.travel_fee_paise,
  });

  const reassignTo = (therapistId: string) =>
    fetch(`${BASE}/api/admin/reassign-home-visit-therapist`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ purchaseId: purchase!.id, therapistId }),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

  // Race to B and C, deliberately not A (the appointment's current owner)
  // -- racing "reassign to the value it already has" is a no-op UPDATE
  // that trivially "succeeds" under the CAS guard regardless of real
  // concurrency, masking the exact race this test exists to catch.
  const [rB, rC] = await Promise.all([reassignTo(therapistBId), reassignTo(therapistCId)]);

  const reassignedCount = [rB, rC].filter((r) => r.body?.reassigned?.length > 0).length;
  const skippedCount = [rB, rC].filter((r) => r.body?.skipped?.length > 0).length;
  expect(
    { reassignedCount, skippedCount, rB, rC },
    "exactly one concurrent reassign should move the appointment, the other should report it skipped"
  ).toMatchObject({ reassignedCount: 1, skippedCount: 1 });
});

test("assign-referral: concurrent assignment of two referrals to the same therapist/slot doesn't double-book", async () => {
  const admin = adminClient();
  const adminCookie = await cookieHeaderFor(QA_EMAILS.admin);
  const hospitalId = await profileIdFor(admin, QA_EMAILS.hospital);
  const therapistId = await profileIdFor(admin, QA_EMAILS.therapistA);

  const slot = new Date(Date.now() + (500 + Math.random() * 2000) * 3600 * 1000).toISOString();
  const referralIds: string[] = [];
  for (let i = 0; i < 2; i++) {
    const { data } = await admin
      .from("patient_referrals")
      .insert({
        hospital_id: hospitalId,
        patient_name: `E2E Race Referral ${i}`,
        medical_issue: "e2e concurrency edge case",
        visit_mode: "online",
        status: "pending_review",
      })
      .select("id")
      .single();
    referralIds.push(data!.id);
  }

  const assign = (referralId: string) =>
    fetch(`${BASE}/api/admin/assign-referral`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ referralId, therapistId, slotDateTime: slot }),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

  const [r1, r2] = await Promise.all([assign(referralIds[0]), assign(referralIds[1])]);
  // The loser can be caught by either the pre-write check (400, if the
  // winner's write already landed by the time the loser's pre-check ran)
  // or the post-write tie-broken recheck (409, if both pre-checks passed
  // before either write landed) -- both are a correctly-rejected loser,
  // just at different points depending on exact timing. Either way,
  // exactly one request must succeed and exactly one must be rejected;
  // never both succeeding (a double-book) and never both rejected (the
  // symmetric-rollback bug this test exists to catch).
  const winners = [r1, r2].filter((r) => r.status === 200);
  const rejected = [r1, r2].filter((r) => r.status === 400 || r.status === 409);
  expect(winners, JSON.stringify([r1, r2])).toHaveLength(1);
  expect(rejected, JSON.stringify([r1, r2])).toHaveLength(1);
});
