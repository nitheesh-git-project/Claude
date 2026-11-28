// A session nobody was put on, close to its time or past it, and the Pay /
// Join rules around it (src/lib/sessionPatientActions.ts):
//
// - under 4 hours to go with no physiotherapist, the card offers a new time
//   and a cancel with a full refund, and no Pay button; the cancel route
//   allows it inside the usual cut-off
// - past its time with nobody on it, it is not "needs a therapist" on the
//   admin side
// - Pay never shows on a past, completed or cancelled session, and
//   create-order refuses one
// - an unpaid session paid up front cannot be joined, admin-booked or not
// - Home lists a session waiting for payment, with Pay now and Cancel
//
// Patient B. Sessions are unpaid, so nothing here moves money.
import { test, expect, request, type APIRequestContext, type Page } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  markDashboardTourSeen,
  profileIdFor,
  waitForSplashToClear,
} from "./helpers";

const db = adminClient();
const MARKER = "E2E no-therapist";
const MIN = 60_000;
const HOUR = 60 * MIN;

let patientId: string;
let therapistId: string;
let patient: APIRequestContext;

async function seed(over: Record<string, unknown>, concern: string) {
  const { data, error } = await db
    .from("appointments")
    .insert({
      patient_id: patientId,
      status: "requested",
      payment_status: "unpaid",
      duration_minutes: 30,
      visit_mode: "online",
      concern,
      ...over,
    })
    .select("id, session_code")
    .single();
  if (error) throw new Error(`could not seed a session: ${error.message}`);
  return data as { id: string; session_code: string | null };
}

const at = (ms: number) => new Date(ms).toISOString();

async function open(page: Page, path: string) {
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.patientB));
  await page.goto(`${BASE}${path}`);
  await waitForSplashToClear(page);
}

function card(page: Page, concern: string) {
  return page.locator("div.rounded-xl", { hasText: concern }).first();
}

test.beforeAll(async () => {
  patientId = await profileIdFor(db, QA_EMAILS.patientB);
  therapistId = await profileIdFor(db, QA_EMAILS.therapistA);
  await markDashboardTourSeen(QA_EMAILS.patientB);
  patient = await request.newContext({ extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.patientB) } });
});

test.beforeEach(async () => {
  await db.from("appointments").delete().like("concern", `${MARKER}%`);
});

test.afterAll(async () => {
  await db.from("appointments").delete().like("concern", `${MARKER}%`);
  await patient?.dispose();
});

test("NTR-001: under four hours with nobody on it offers a new time and a cancel, not Pay", async ({ page }) => {
  const concern = `${MARKER} soon`;
  await seed({ slot_time: at(Date.now() + 2 * HOUR) }, concern);
  await open(page, "/patient/dashboard/sessions");
  const c = card(page, concern);
  await expect(c.getByTestId("no-therapist-rescue")).toBeVisible();
  await expect(c.getByTestId("rescue-pick-new-time")).toBeVisible();
  await expect(c.getByRole("button", { name: "Cancel session" })).toBeVisible();
  await expect(c.getByTestId("resume-checkout")).toHaveCount(0);
  await expect(c.getByRole("button", { name: "Reschedule", exact: true })).toHaveCount(0);
});

test("NTR-002: the cancel route allows it inside the cut-off and records why", async () => {
  const s = await seed({ slot_time: at(Date.now() + 10 * MIN) }, `${MARKER} cutoff`);
  const res = await patient.post(`${BASE}/api/appointments/cancel`, { data: { appointmentId: s.id } });
  expect(res.status()).toBe(200);
  const { data } = await db.from("appointments").select("status, cancellation_reason").eq("id", s.id).single();
  expect(data!.status).toBe("cancelled");
  expect(data!.cancellation_reason).toMatch(/No physiotherapist was confirmed in time/);
});

test("NTR-003: a past session offers no Pay, and create-order refuses it", async ({ page }) => {
  const concern = `${MARKER} past`;
  const s = await seed({ slot_time: at(Date.now() - 26 * HOUR), therapist_id: therapistId, status: "confirmed" }, concern);
  await open(page, "/patient/dashboard/sessions");
  await page.getByRole("button", { name: /^Past/ }).first().click();
  const c = card(page, concern);
  await expect(c).toBeVisible();
  await expect(c.getByTestId("resume-checkout")).toHaveCount(0);
  await expect(c.getByTestId("session-payment-note")).toHaveText("Not paid");
  const res = await patient.post(`${BASE}/api/razorpay/create-order`, { data: { appointmentId: s.id } });
  expect(res.status()).toBe(409);
  expect((await res.json()).code).toBe("not_payable");
});

test("NTR-004: a completed unpaid session never offers Pay", async ({ page }) => {
  const concern = `${MARKER} done`;
  await seed({ slot_time: at(Date.now() - 50 * HOUR), therapist_id: therapistId, status: "completed" }, concern);
  await open(page, "/patient/dashboard/sessions");
  await page.getByRole("button", { name: /^Past/ }).first().click();
  const c = card(page, concern);
  await expect(c).toBeVisible();
  await expect(c.getByTestId("resume-checkout")).toHaveCount(0);
  await expect(c.getByTestId("session-payment-note")).toHaveText("Payment due");
});

test("NTR-005: an unpaid admin-booked session cannot be joined until it is paid", async ({ page }) => {
  const concern = `${MARKER} join`;
  await seed(
    {
      slot_time: at(Date.now() + 5 * MIN),
      therapist_id: therapistId,
      status: "confirmed",
      meet_link: "https://meet.google.com/e2e-unpaid-held",
    },
    concern
  );
  await open(page, "/patient/dashboard/sessions");
  const c = card(page, concern);
  await expect(c.getByTestId("join-held-for-payment")).toBeVisible();
  await expect(c.getByRole("button", { name: "Tap to Join" })).toHaveCount(0);
  // The link is not in the page at all while it is held.
  expect(await page.content()).not.toContain("e2e-unpaid-held");
});

test("NTR-006: Home lists a session waiting for payment, and cancelling it clears it", async ({ page }) => {
  const concern = `${MARKER} home`;
  await seed({ slot_time: at(Date.now() + 5 * 24 * HOUR), therapist_id: therapistId, status: "confirmed" }, concern);
  await open(page, "/patient/dashboard");
  const row = page.getByTestId("home-awaiting-payment-row").filter({ hasText: concern });
  await expect(row).toBeVisible();
  await expect(row.getByTestId("home-pay-now")).toBeVisible();
  await row.getByRole("button", { name: "Cancel Session" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("nothing to refund");
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(page.getByTestId("home-awaiting-payment-row").filter({ hasText: concern })).toHaveCount(0, {
    timeout: 30_000,
  });
  const { data } = await db.from("appointments").select("status").eq("concern", concern).single();
  expect(data!.status).toBe("cancelled");
});
