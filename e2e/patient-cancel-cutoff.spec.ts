// A patient can't cancel an online session in its last N minutes
// (`site_settings.patient_cancel_cutoff_minutes`, default 15): the Cancel
// button is gone and /api/appointments/cancel refuses. Home visits keep
// their own rules. Sessions here are unpaid, so a cancel moves no money.
// Patient B, because other specs leave patient A with sessions near "now".
import { test, expect, request, type APIRequestContext } from "@playwright/test";
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
const MARKER = "E2E cancel-cutoff";
const MIN = 60_000;

let patientId: string;
let patient: APIRequestContext;
let admin: APIRequestContext;

async function seed(slotMs: number, concern = MARKER) {
  const { data, error } = await db
    .from("appointments")
    .insert({
      patient_id: patientId,
      slot_time: new Date(slotMs).toISOString(),
      status: "requested",
      payment_status: "unpaid",
      duration_minutes: 30,
      visit_mode: "online",
      concern,
    })
    .select("id")
    .single();
  if (error) throw new Error(`could not seed a session: ${error.message}`);
  return data.id as string;
}

async function setCutoff(value: number) {
  const res = await admin.post(`${BASE}/api/admin/update-setting`, {
    data: { key: "patient_cancel_cutoff_minutes", value },
  });
  return res;
}

test.beforeAll(async () => {
  patientId = await profileIdFor(db, QA_EMAILS.patientB);
  await markDashboardTourSeen(QA_EMAILS.patientB);
  patient = await request.newContext({ extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.patientB) } });
  admin = await request.newContext({ extraHTTPHeaders: { Cookie: await cookieHeaderFor(QA_EMAILS.admin) } });
  await db.from("appointments").delete().like("concern", `${MARKER}%`);
});

test.beforeEach(async () => {
  await db.from("appointments").delete().like("concern", `${MARKER}%`);
});

test.afterAll(async () => {
  await setCutoff(15);
  await db.from("appointments").delete().like("concern", `${MARKER}%`);
  await patient?.dispose();
  await admin?.dispose();
});

test("PCC-001: inside the cut-off the cancel route refuses", async () => {
  expect((await setCutoff(15)).status()).toBe(200);
  const id = await seed(Date.now() + 10 * MIN);
  const res = await patient.post(`${BASE}/api/appointments/cancel`, { data: { appointmentId: id } });
  expect(res.status()).toBe(409);
  expect((await res.json()).code).toBe("cancel_cutoff");
  const { data } = await db.from("appointments").select("status").eq("id", id).single();
  expect(data!.status).toBe("requested");
});

test("PCC-002: the setting moves the cut-off, and is range-checked", async () => {
  expect((await setCutoff(2000)).status()).toBe(400);
  expect((await setCutoff(0)).status()).toBe(200);
  const id = await seed(Date.now() + 10 * MIN);
  const res = await patient.post(`${BASE}/api/appointments/cancel`, { data: { appointmentId: id } });
  expect(res.status()).toBe(200);
  expect((await setCutoff(15)).status()).toBe(200);
});

test("PCC-003: the Cancel button is gone inside the cut-off and there outside it", async ({ page }) => {
  expect((await setCutoff(15)).status()).toBe(200);
  await seed(Date.now() + 10 * MIN, `${MARKER} soon`);
  await seed(Date.now() + 3 * 24 * 60 * MIN, `${MARKER} later`);
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.patientB));
  await page.goto(`${BASE}/patient/dashboard/sessions`);
  await waitForSplashToClear(page);
  const soon = page.locator("div.rounded-xl", { hasText: `${MARKER} soon` }).first();
  const later = page.locator("div.rounded-xl", { hasText: `${MARKER} later` }).first();
  await expect(soon).toBeVisible();
  await expect(later.getByRole("button", { name: "Cancel Session" })).toBeVisible();
  await expect(soon.getByRole("button", { name: "Cancel Session" })).toHaveCount(0);
  await soon.screenshot({ path: "test-results/cancel-cutoff-soon.png" });
});
