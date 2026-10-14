// A partner hospital's commission, from the referral to the figure on both
// sides of the table. A patient the hospital referred pays for a session
// through the gateway; nothing is owed to the partner until the session is
// delivered; once it is, the commission is taken at the rate in force that day
// on what the clinic kept -- and the hospital's own Earnings screen and the
// admin's Partners card print the same figure at every step, including after
// part of the money is refunded.
//
// HRR-001 is also the regression for the admin card's old arithmetic, which
// counted every *paid* session at the *live* rate with no refunds netted off,
// so it quoted a commission the partner's own screen (correctly) did not.
//
// Its own hospital, referred patient and therapist, made per run, so no other
// spec's referrals move these figures. The payment and the refund go through
// the loopback fake gateway (e2e/fake-razorpay.mjs); this file skips, with the
// reason, where it is not configured, and never reaches a real Razorpay.
// Completing a session writes an append-only settlement row, so it runs on a
// disposable project only.
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BASE, QA_EMAILS, adminClient, browserCookiesFor, pageUntilVisible, waitForSplashToClear } from "./helpers";
import { fakeGatewaySkipReason } from "./fakeGateway";
import { apiAs, createFixtureAccount, insertBooking, payForSession, type FixtureAccount, type PaidSession } from "./moneyFixtures";
import { formatInr } from "../src/lib/formatMoney";

test.describe.configure({ mode: "serial" });

test.skip(
  process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
  "completes a session (an append-only settlement row); set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);

const PARTNER_SHARE = 10;
const REFUND_PAISE = 50_000;

let db: SupabaseClient;
let skipReason: string | null = null;
let hospital: FixtureAccount;
let organization = "";
let patient: FixtureAccount;
let patientCtx: APIRequestContext;
let adminCtx: APIRequestContext;
let paid: PaidSession;

test.beforeAll(async () => {
  test.setTimeout(90_000);
  skipReason = await fakeGatewaySkipReason();
  if (skipReason) return;
  db = adminClient();
  const stamp = String(Date.now()).slice(-7);
  organization = `QA Referral Partner ${stamp}`;
  hospital = await createFixtureAccount(db, "hospital", "partner", {
    organization_name: organization,
    referral_code: `QAR${stamp}`,
    revenue_share_percent: PARTNER_SHARE,
  });
  patient = await createFixtureAccount(db, "patient", "referred", { referred_by_hospital_id: hospital.id });
  const therapist = await createFixtureAccount(db, "therapist", "referralcare", { revenue_share_percent: 60 });
  patientCtx = await apiAs(patient.email);
  adminCtx = await apiAs(QA_EMAILS.admin);

  // A session with its therapist already arranged (the referral path), so
  // the payment is the only thing it is waiting on.
  const { id } = await insertBooking(db, { patient_id: patient.id, therapist_id: therapist.id }, { daysAhead: 20 });
  paid = await payForSession(patientCtx, id);
});

test.beforeEach(() => {
  test.skip(!!skipReason, skipReason ?? "");
});

test.afterAll(async () => {
  await patientCtx?.dispose();
  await adminCtx?.dispose();
});

/** The hospital's Earnings figures. */
async function partnerScreen(page: Page) {
  await page.context().addCookies(await browserCookiesFor(hospital.email));
  await page.goto(`${BASE}/hospital/dashboard/revenue`);
  await waitForSplashToClear(page);
  const card = page.locator("#revenue");
  await expect(card.getByText("Your share", { exact: true })).toBeVisible();
  const figure = (label: string) => card.getByText(label, { exact: true }).locator("xpath=following-sibling::p[1]");
  return { delivered: figure("Sessions delivered"), share: figure("Your share") };
}

/** The same partner's card on the admin's People -> Partners. */
async function adminCard(page: Page) {
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.admin));
  await page.goto(`${BASE}/admin/dashboard?section=people&tab=partners`);
  await waitForSplashToClear(page);
  const card = page
    .locator("div.rounded-xl")
    .filter({ has: page.getByText(organization, { exact: true }) })
    .filter({ visible: true })
    .last();
  expect(await pageUntilVisible(page, "partners", card), `${organization} on Partners`).toBe(true);
  const figure = (label: string) =>
    card.getByText(label, { exact: true }).locator("xpath=following-sibling::p[1]");
  return { delivered: figure("Sessions delivered"), share: figure("Partner's share") };
}

/** Both screens, side by side, for one expected state. */
async function expectBothScreens(page: Page, { delivered, sharePaise }: { delivered: number; sharePaise: number }) {
  const partner = await partnerScreen(page);
  await expect(partner.delivered).toHaveText(String(delivered));
  await expect(partner.share).toHaveText(formatInr(sharePaise));
  const admin = await adminCard(page);
  await expect(admin.delivered).toHaveText(String(delivered));
  // The admin card prints paise always (₹12.00); the partner's screen drops
  // a whole-rupee .00 -- the same amount either way.
  await expect(admin.share).toHaveText(`₹${(sharePaise / 100).toFixed(2)}`);
}

test("HRR-001: a paid session earns the partner nothing until it is delivered, on either screen", async ({ page }) => {
  test.setTimeout(120_000);
  const { data: row } = await db.from("appointments").select("status, payment_status").eq("id", paid.appointmentId).single();
  expect(row).toEqual({ status: "confirmed", payment_status: "paid" });
  await expectBothScreens(page, { delivered: 0, sharePaise: 0 });
});

test("HRR-002: once delivered, the partner's share is taken at that day's rate, and both screens agree", async ({ page }) => {
  test.setTimeout(120_000);
  const res = await adminCtx.post(`${BASE}/api/appointments/complete-session`, { data: { appointmentId: paid.appointmentId } });
  expect(res.status(), await res.text()).toBe(200);
  const { data: row } = await db
    .from("appointments")
    .select("status, hospital_id_at_completion, hospital_share_percent_at_completion")
    .eq("id", paid.appointmentId)
    .single();
  expect(row).toEqual({
    status: "completed",
    hospital_id_at_completion: hospital.id,
    hospital_share_percent_at_completion: PARTNER_SHARE,
  });

  // A renegotiated rate afterwards does not reach back into a delivered session.
  await db.from("profiles").update({ revenue_share_percent: PARTNER_SHARE * 2 }).eq("id", hospital.id);
  await expectBothScreens(page, { delivered: 1, sharePaise: Math.round((paid.amount * PARTNER_SHARE) / 100) });
});

test("HRR-003: money refunded through the gateway comes off the partner's share on both screens", async ({ page }) => {
  test.setTimeout(120_000);
  const res = await adminCtx.post(`${BASE}/api/admin/refund-session-partial`, {
    data: { appointmentId: paid.appointmentId, amountPaise: REFUND_PAISE, reason: "Part of the session was lost to a dropped call" },
  });
  expect(res.status(), await res.text()).toBe(200);
  await expectBothScreens(page, {
    delivered: 1,
    sharePaise: Math.round(((paid.amount - REFUND_PAISE) * PARTNER_SHARE) / 100),
  });
});
