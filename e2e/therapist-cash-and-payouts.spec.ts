// What a therapist is owed, read from both sides of the table, and the two
// money writes a therapist makes themselves.
//
// TCP-001: the therapist's own Earnings screen and the admin's Money ->
// Payouts row quote the same figure for the same sessions -- a delivered,
// paid session earns its share, an already-settled one is not owed twice, and
// an upcoming one earns nothing yet.
// TCP-002: cash taken at the door is recorded by the therapist who ran the
// visit and nobody else, once, at the price the system owns; the admin's row
// then nets it off what the clinic owes.
// TCP-003: a payout request asks for exactly that net figure, a second one is
// refused while the first is open, and settling it from Payouts closes it,
// leaving both screens at nothing owed and the receipt on the therapist's.
//
// Its own therapist and patient, made per run: the QA therapists carry every
// other spec's sessions, and an open payout request is one per therapist.
// Settling writes payout batches, so it runs on a disposable project only.
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  clinicSlot,
  insertPastFixtureAppointment,
  pageUntilVisible,
  waitForSplashToClear,
} from "./helpers";
import { apiAs, createFixtureAccount, insertBooking, type FixtureAccount } from "./moneyFixtures";
import { formatInr } from "../src/lib/formatMoney";

test.describe.configure({ mode: "serial" });

test.skip(
  process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
  "settles a payout batch; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);

const SHARE = 60;
const DELIVERED_PAISE = 400_000; // completed, paid, not yet settled -> earns 60%
const SETTLED_PAISE = 80_000; // completed, paid, settled before this run
const UPCOMING_PAISE = 300_000; // paid, not yet delivered -> earns nothing yet
const VISIT_PRICE_PAISE = 150_000;
const TRAVEL_PAISE = 15_000;

const owed = Math.round((DELIVERED_PAISE * SHARE) / 100); // 240,000
const settledCut = Math.round((SETTLED_PAISE * SHARE) / 100);
const cashAtDoor = VISIT_PRICE_PAISE + TRAVEL_PAISE; // per-visit fee + travel, one visit
const net = owed - cashAtDoor;

let db: SupabaseClient;
let therapist: FixtureAccount;
let patient: FixtureAccount;
let therapistCtx: APIRequestContext;
let visitId = "";

test.beforeAll(async () => {
  test.setTimeout(90_000);
  db = adminClient();
  therapist = await createFixtureAccount(db, "therapist", "payouts", {
    revenue_share_percent: SHARE,
    home_visit_revenue_share_percent: SHARE,
  });
  patient = await createFixtureAccount(db, "patient", "payouts");
  therapistCtx = await apiAs(therapist.email);

  const base = {
    patient_id: patient.id,
    therapist_id: therapist.id,
    concern: "E2E money flows",
    duration_minutes: 45,
    visit_mode: "online",
    payment_status: "paid",
  };
  await insertPastFixtureAppointment(db, { ...base, status: "completed", amount_paid_paise: DELIVERED_PAISE }, { daysAgo: 6 });
  const settledId = await insertPastFixtureAppointment(
    db,
    { ...base, status: "completed", amount_paid_paise: SETTLED_PAISE },
    { daysAgo: 12 }
  );
  const { error: settleError } = await db
    .from("appointments")
    .update({
      therapist_payout_paid_at: new Date(Date.now() - 10 * 86_400_000).toISOString(),
      therapist_payout_amount_paise: settledCut,
      therapist_payout_method: "cash",
    })
    .eq("id", settledId);
  expect(settleError, settleError?.message).toBeNull();
  await insertBooking(db, { ...base, status: "confirmed", amount_paid_paise: UPCOMING_PAISE }, { daysAhead: 30 });

  // A cash-on-visit home visit, under way now (the hour it started in), on
  // the clinic-wide single-visit rate global setup seeds.
  const { data: pkg } = await db.from("home_visit_packages").select("id").eq("title", "Single Home Visit").single();
  const { data: purchase, error: purchaseError } = await db
    .from("home_visit_package_purchases")
    .insert({
      patient_id: patient.id,
      package_id: pkg!.id,
      visit_count: 1,
      visits_used: 1,
      amount_paid_paise: VISIT_PRICE_PAISE,
      travel_fee_paise: TRAVEL_PAISE,
      payment_mode: "cash_on_visit",
      payment_status: "unpaid",
      status: "active",
      locked_therapist_id: therapist.id,
      expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    })
    .select("id")
    .single();
  expect(purchaseError, purchaseError?.message).toBeNull();
  const istHour = new Date(Date.now() + 5.5 * 3_600_000).getUTCHours();
  const visit = await insertBooking(
    db,
    {
      ...base,
      payment_status: "unpaid",
      status: "confirmed",
      visit_mode: "home_visit",
      payment_method: "cash",
      home_visit_purchase_id: purchase!.id,
      travel_fee_paise: TRAVEL_PAISE,
      duration_minutes: 60,
      visit_address_line1: "E2E Money Flows Road",
      visit_pincode: "600017",
    },
    { slotTime: clinicSlot(0, istHour) }
  );
  visitId = visit.id;
});

test.afterAll(async () => {
  await therapistCtx?.dispose();
});

async function earningsScreen(page: Page) {
  await page.context().addCookies(await browserCookiesFor(therapist.email));
  await page.goto(`${BASE}/therapist/dashboard/earnings`);
  await waitForSplashToClear(page);
  const card = page.locator("#earnings");
  await expect(card.getByText("Pending Payout")).toBeVisible();
  return card;
}

/** The figure printed under "Pending Payout" on the therapist's screen. */
function pendingPayout(card: ReturnType<Page["locator"]>) {
  return card.getByText("Pending Payout", { exact: true }).locator("xpath=following-sibling::p[1]");
}

/** The therapist's row on Money -> Payouts, found across the list's pages. */
async function payoutsRow(page: Page) {
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.admin));
  await page.goto(`${BASE}/admin/dashboard?section=money&tab=payouts`);
  await waitForSplashToClear(page);
  await expect(page.getByRole("heading", { name: /Therapist Payouts/ }).filter({ visible: true })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: therapist.name }).filter({ visible: true });
  expect(await pageUntilVisible(page, "therapists", row), `${therapist.name} on Payouts`).toBe(true);
  return row;
}

test("TCP-001: the therapist's earnings screen and the admin's Payouts row owe the same amount", async ({ browser }) => {
  test.setTimeout(120_000);
  const therapistPage = await browser.newPage();
  const adminPage = await browser.newPage();
  try {
    const card = await earningsScreen(therapistPage);
    await expect(pendingPayout(card)).toHaveText(formatInr(owed));
    // The two delivered sessions, the settled one marked as paid out.
    await expect(card.getByText("2 sessions", { exact: true })).toBeVisible();
    await expect(card.getByText(formatInr(owed), { exact: true }).nth(1)).toBeVisible();
    await expect(card.getByText(formatInr(settledCut), { exact: true }).first()).toBeVisible();

    const row = await payoutsRow(adminPage);
    const cells = row.getByRole("cell");
    await expect(cells.nth(1)).toHaveText("2"); // completed
    await expect(cells.nth(2)).toHaveText("1"); // upcoming
    await expect(cells.nth(3)).toHaveText(formatInr(DELIVERED_PAISE + SETTLED_PAISE + UPCOMING_PAISE)); // revenue billed
    await expect(cells.nth(4)).toHaveText(formatInr(owed + settledCut)); // therapist's share
    await expect(cells.nth(6)).toHaveText(`${formatInr(owed)} owed`);
  } finally {
    await therapistPage.close();
    await adminPage.close();
  }
});

test("TCP-002: cash at the door is recorded once, by the visit's own therapist, at the system's price", async ({ browser }) => {
  test.setTimeout(120_000);
  const record = (ctx: APIRequestContext) =>
    ctx.post(`${BASE}/api/therapist/record-cash-collection`, { data: { appointmentId: visitId } });

  const otherTherapist = await apiAs(QA_EMAILS.therapistA);
  const patientCtx = await apiAs(patient.email);
  try {
    const wrong = await record(otherTherapist);
    expect(wrong.status(), "another therapist cannot record this visit's cash").toBe(404);
    expect((await record(patientCtx)).status(), "nor can the patient").toBe(403);
  } finally {
    await otherTherapist.dispose();
    await patientCtx.dispose();
  }
  const { data: untouched } = await db.from("appointments").select("cash_collected_at, payment_status").eq("id", visitId).single();
  expect(untouched).toEqual({ cash_collected_at: null, payment_status: "unpaid" });

  // The body carries the visit and nothing about money.
  const res = await therapistCtx.post(`${BASE}/api/therapist/record-cash-collection`, {
    data: { appointmentId: visitId, amountPaise: 1 },
  });
  expect(res.status(), await res.text()).toBe(200);
  expect((await res.json()).amountPaise).toBe(cashAtDoor);
  const again = await record(therapistCtx);
  expect(again.status(), "a second tap records nothing").toBe(409);

  const { data: visit } = await db
    .from("appointments")
    .select("cash_collected_amount_paise, cash_collected_by, payment_status, amount_paid_paise")
    .eq("id", visitId)
    .single();
  expect(visit).toEqual({
    cash_collected_amount_paise: cashAtDoor,
    cash_collected_by: therapist.id,
    payment_status: "paid",
    amount_paid_paise: VISIT_PRICE_PAISE,
  });

  // The admin's row nets the cash the therapist is holding off what is owed.
  const adminPage = await browser.newPage();
  try {
    const row = await payoutsRow(adminPage);
    await expect(row.getByRole("cell").nth(6)).toHaveText(
      `${formatInr(net)} net (${formatInr(owed)} owed − ${formatInr(cashAtDoor)} held)`
    );
  } finally {
    await adminPage.close();
  }
});

test("TCP-003: a payout request asks for the net figure once, and settling it clears both screens", async ({ browser }) => {
  test.setTimeout(150_000);
  const patientCtx = await apiAs(patient.email);
  try {
    expect((await patientCtx.post(`${BASE}/api/therapist/request-payout`)).status(), "a patient cannot ask").toBe(403);
  } finally {
    await patientCtx.dispose();
  }

  const res = await therapistCtx.post(`${BASE}/api/therapist/request-payout`);
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  expect(body.requestedAmountPaise, "what settling would transfer: owed less cash held").toBe(net);
  const twice = await therapistCtx.post(`${BASE}/api/therapist/request-payout`);
  expect(twice.status()).toBe(409);
  expect((await twice.json()).error).toMatch(/already have a pending payout request/);
  const { data: open } = await db
    .from("therapist_payout_requests")
    .select("id, status, requested_amount_paise")
    .eq("therapist_id", therapist.id);
  expect(open).toEqual([{ id: body.requestId, status: "pending", requested_amount_paise: net }]);

  const therapistPage = await browser.newPage();
  try {
    const card = await earningsScreen(therapistPage);
    await expect(card.getByRole("button", { name: "Request Pending" })).toBeVisible();
  } finally {
    await therapistPage.close();
  }

  // The admin pays it from Payouts: the batch is the net figure and it
  // answers the request.
  const adminCtx = await apiAs(QA_EMAILS.admin);
  try {
    const settle = await adminCtx.post(`${BASE}/api/admin/settle-therapist-payout`, {
      data: { therapistId: therapist.id, method: "online", note: "E2E bank transfer" },
    });
    expect(settle.status(), await settle.text()).toBe(200);
  } finally {
    await adminCtx.dispose();
  }
  const { data: batches } = await db
    .from("therapist_payout_batches")
    .select("id, amount_paise")
    .eq("therapist_id", therapist.id);
  expect(batches).toHaveLength(1);
  expect(batches![0].amount_paise).toBe(net);
  const { data: closed } = await db
    .from("therapist_payout_requests")
    .select("status")
    .eq("id", body.requestId)
    .single();
  expect(closed!.status).toBe("completed");

  const afterTherapist = await browser.newPage();
  const afterAdmin = await browser.newPage();
  try {
    const card = await earningsScreen(afterTherapist);
    await expect(pendingPayout(card)).toHaveText(formatInr(0));
    await expect(afterTherapist.locator("#receipts").getByText(formatInr(net), { exact: true }).first()).toBeVisible();
    const row = await payoutsRow(afterAdmin);
    await expect(row.getByRole("cell").nth(6)).toHaveText("Paid");
  } finally {
    await afterTherapist.close();
    await afterAdmin.close();
  }
});
