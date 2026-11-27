// Booking from admin, end to end, with the goodwill and pay-later edges
// around it (src/lib/sessionPatientActions.ts, payLaterDue.ts):
//
// - an admin books an unpaid session with a therapist: it is confirmed, the
//   patient sees Pay now on the card and on Home, the video link is held,
//   and the therapist is told the patient has not paid
// - an admin books one paid offline: Paid, no Pay, nothing held
// - a goodwill discount on an admin booking keeps it payable, at less
// - a therapist cannot complete an unpaid session paid up front, and the
//   patient is not offered Pay once its time has passed
// - a pay-later balance with paise is pre-filled exactly in "I've paid"
//
// Patient B, therapist C. Nothing here moves real money.
import { test, expect, request, type APIRequestContext, type Page } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  clinicSlot,
  cookieHeaderFor,
  markDashboardTourSeen,
  openTherapistHour,
  profileIdFor,
  waitForSplashToClear,
} from "./helpers";

const db = adminClient();
const MARKER = "E2E admin-booking";
const HOUR = 3_600_000;

let patientId: string;
let therapistId: string;
let categoryId: string;
let admin: APIRequestContext;
let therapist: APIRequestContext;
const closeHours: Array<() => Promise<void>> = [];
const created: string[] = [];

async function book(dayOffset: number, hour: number, paymentMode: "unpaid" | "paid_offline") {
  const slotTime = clinicSlot(dayOffset, hour);
  closeHours.push(await openTherapistHour(db, therapistId, slotTime));
  const res = await admin.post(`${BASE}/api/admin/create-booking`, {
    data: { patientId, therapistId, categoryId, slotTime, timezone: "Asia/Kolkata", notes: MARKER, paymentMode },
  });
  const body = await res.json();
  expect(res.status(), JSON.stringify(body)).toBe(200);
  created.push(body.appointmentId);
  // A concern the cards can be found by.
  await db.from("appointments").update({ concern: `${MARKER} ${paymentMode} ${dayOffset}` }).eq("id", body.appointmentId);
  return { id: body.appointmentId as string, concern: `${MARKER} ${paymentMode} ${dayOffset}` };
}

async function open(page: Page, email: string, path: string) {
  await page.context().addCookies(await browserCookiesFor(email));
  await page.goto(`${BASE}${path}`);
  await waitForSplashToClear(page);
}

const card = (page: Page, text: string) => page.locator("div.rounded-xl", { hasText: text }).first();

test.beforeAll(async () => {
  patientId = await profileIdFor(db, QA_EMAILS.patientB);
  therapistId = await profileIdFor(db, QA_EMAILS.therapistC);
  await markDashboardTourSeen(QA_EMAILS.patientB);
  await markDashboardTourSeen(QA_EMAILS.therapistC);
  const { data: category } = await db
    .from("treatment_categories")
    .select("id")
    .eq("active", true)
    .not("price_paise", "is", null)
    .limit(1)
    .single();
  categoryId = category!.id as string;
  admin = await request.newContext({ extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.admin) } });
  therapist = await request.newContext({ extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.therapistC) } });
  await db.from("appointments").delete().like("concern", `${MARKER}%`);
});

// Each test books its own rows; a retry must not find the first attempt's.
test.beforeEach(async () => {
  await db.from("appointments").delete().like("concern", `${MARKER}%`);
});

test.afterAll(async () => {
  for (const close of closeHours.splice(0)) await close();
  await db.from("appointments").delete().like("concern", `${MARKER}%`);
  if (created.length) await db.from("appointments").delete().in("id", created);
  await admin?.dispose();
  await therapist?.dispose();
});

test("ABF-001: an unpaid admin booking is confirmed, payable, and held at Join", async ({ page }) => {
  const s = await book(11, 15, "unpaid");
  const { data: row } = await db.from("appointments").select("status, payment_status, therapist_id").eq("id", s.id).single();
  expect(row).toMatchObject({ status: "confirmed", payment_status: "unpaid", therapist_id: therapistId });

  await open(page, QA_EMAILS.patientB, "/patient/dashboard/sessions");
  const c = card(page, s.concern);
  await expect(c.getByTestId("resume-checkout")).toBeVisible();
  await expect(c.getByTestId("join-held-for-payment")).toBeVisible();
  await expect(c.getByRole("button", { name: "Tap to Join" })).toHaveCount(0);

  await page.goto(`${BASE}/patient/dashboard`);
  await expect(page.getByTestId("home-awaiting-payment-row").filter({ hasText: s.concern }).first()).toBeVisible();

  await page.context().clearCookies();
  await open(page, QA_EMAILS.therapistC, "/therapist/dashboard/sessions");
  await expect(page.getByTestId("therapist-patient-unpaid").first()).toBeVisible();
});

test("ABF-002: a paid-offline admin booking is Paid, with nothing to pay and nothing held", async ({ page }) => {
  const s = await book(12, 15, "paid_offline");
  await open(page, QA_EMAILS.patientB, "/patient/dashboard/sessions");
  const c = card(page, s.concern);
  await expect(c).toContainText("Paid");
  await expect(c.getByTestId("resume-checkout")).toHaveCount(0);
  await expect(c.getByTestId("join-held-for-payment")).toHaveCount(0);
});

test("ABF-003: goodwill on an admin booking keeps it payable, at less", async ({ page }) => {
  const s = await book(13, 15, "unpaid");
  const res = await admin.post(`${BASE}/api/admin/apply-goodwill-discount`, {
    data: { appointmentId: s.id, amountPaise: 10_000, reason: "Phoned in, waited a long time on hold" },
  });
  expect(res.status(), await res.text()).toBe(200);
  const { data: row } = await db
    .from("appointments")
    .select("discount_source, discount_paise, payment_status")
    .eq("id", s.id)
    .single();
  expect(row).toMatchObject({ discount_source: "goodwill", discount_paise: 10_000, payment_status: "unpaid" });

  await open(page, QA_EMAILS.patientB, "/patient/dashboard/sessions");
  await expect(card(page, s.concern).getByTestId("resume-checkout")).toBeVisible();
});

test("ABF-004: an unpaid session paid up front cannot be completed, and its past time offers no Pay", async ({ page }) => {
  const { data: seeded, error } = await db
    .from("appointments")
    .insert({
      patient_id: patientId,
      therapist_id: therapistId,
      // A day ago: a session still on the day it was due stays under
      // Upcoming (sessionBucket), and this test reads it in Past.
      slot_time: new Date(Date.now() - 26 * HOUR).toISOString(),
      status: "confirmed",
      payment_status: "unpaid",
      duration_minutes: 30,
      visit_mode: "online",
      concern: `${MARKER} unpaid-past`,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  const res = await therapist.post(`${BASE}/api/appointments/complete-session`, { data: { appointmentId: seeded!.id } });
  expect(res.status()).toBeGreaterThanOrEqual(400);
  expect(await res.text()).toMatch(/hasn't been paid for/);

  await open(page, QA_EMAILS.patientB, "/patient/dashboard/sessions");
  await page.getByRole("button", { name: /^Past/ }).first().click();
  const c = card(page, `${MARKER} unpaid-past`);
  await expect(c.getByTestId("session-payment-note")).toHaveText("Not paid");
  await expect(c.getByTestId("resume-checkout")).toHaveCount(0);
});

test("PL-PAISE: a pay-later balance with paise is pre-filled exactly, never rounded", async ({ page }) => {
  const { error } = await db.from("appointments").insert({
    patient_id: patientId,
    therapist_id: therapistId,
    slot_time: new Date(Date.now() - 30 * HOUR).toISOString(),
    status: "completed",
    payment_status: "unpaid",
    payment_terms: "pay_later",
    amount_due_paise: 49_918,
    duration_minutes: 30,
    visit_mode: "online",
    concern: `${MARKER} paise`,
  });
  expect(error).toBeNull();
  await open(page, QA_EMAILS.patientB, "/patient/dashboard");
  const total = (await page.getByText("You owe so far").locator("xpath=following-sibling::p[1]").innerText()).trim();
  const button = page.getByRole("button", { name: "I've already paid" });
  test.skip(
    (await button.count()) === 0 || (await button.isDisabled()),
    "a declaration is already waiting for this patient"
  );
  await button.click();
  const amount = page.getByLabel("How much (₹)");
  // The field holds exactly the balance shown, paise and all.
  expect(Number(await amount.inputValue())).toBe(Number(total.replace(/[₹,]/g, "")));
  expect(total).toMatch(/\.\d\d$/);
});

test("ABF-005: goodwill on a pay-later session lowers what is owed; a delivered one is refused", async () => {
  async function seedPayLater(status: string, hoursFromNow: number) {
    const { data, error } = await db
      .from("appointments")
      .insert({
        patient_id: patientId,
        therapist_id: therapistId,
        category_id: categoryId,
        slot_time: new Date(Date.now() + hoursFromNow * HOUR).toISOString(),
        status,
        payment_status: "unpaid",
        payment_terms: "pay_later",
        list_price_paise: 99_900,
        amount_due_paise: 99_900,
        duration_minutes: 30,
        visit_mode: "online",
        concern: `${MARKER} goodwill-pl ${status}`,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    return data!.id as string;
  }

  const upcoming = await seedPayLater("confirmed", 9 * 24);
  const ok = await admin.post(`${BASE}/api/admin/apply-goodwill-discount`, {
    data: { appointmentId: upcoming, amountPaise: 10_000, reason: "Therapist ran late last time" },
  });
  expect(ok.status(), await ok.text()).toBe(200);
  const { data: row } = await db.from("appointments").select("amount_due_paise, discount_paise").eq("id", upcoming).single();
  expect(row).toMatchObject({ amount_due_paise: 89_900, discount_paise: 10_000 });

  const delivered = await seedPayLater("completed", -40);
  const refused = await admin.post(`${BASE}/api/admin/apply-goodwill-discount`, {
    data: { appointmentId: delivered, amountPaise: 10_000, reason: "Therapist ran late last time" },
  });
  expect(refused.status()).toBe(409);
  expect(await refused.text()).toMatch(/Write it off/);
  const { data: kept } = await db.from("appointments").select("amount_due_paise").eq("id", delivered).single();
  expect(kept!.amount_due_paise).toBe(99_900);
});
