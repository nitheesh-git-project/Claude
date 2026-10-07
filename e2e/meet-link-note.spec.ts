// An online session's tile says when the Meet link shows up, as a clock
// time, on the patient's and the therapist's dashboards -- instead of an
// empty space where people expect a link.
import { test, expect } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  markDashboardTourSeen,
  profileIdFor,
  waitForSplashToClear,
} from "./helpers";

const db = adminClient();
const MARKER = "E2E meet-note";

let requestedId: string;
let confirmedId: string;

async function seed(slotIso: string, status: string, therapistId: string | null, concern: string) {
  const { data, error } = await db
    .from("appointments")
    .insert({
      patient_id: await profileIdFor(db, QA_EMAILS.patientB),
      therapist_id: therapistId,
      slot_time: slotIso,
      status,
      payment_status: "paid",
      duration_minutes: 30,
      visit_mode: "online",
      concern,
    })
    .select("id")
    .single();
  if (error) throw new Error(`could not seed a session: ${error.message}`);
  return data.id as string;
}

test.beforeAll(async () => {
  await db.from("appointments").delete().like("concern", `${MARKER}%`);
  await markDashboardTourSeen(QA_EMAILS.patientB);
  await markDashboardTourSeen(QA_EMAILS.therapistA);
  const therapistId = await profileIdFor(db, QA_EMAILS.therapistA);
  // 6:00 PM and 7:00 PM IST four days out: the note should read 5:45 / 6:45
  // with the default 15-minute join window.
  const day = new Date(Date.now() + 5.5 * 3_600_000 + 4 * 86_400_000).toISOString().slice(0, 10);
  requestedId = await seed(`${day}T18:00:00+05:30`, "requested", null, `${MARKER} requested`);
  confirmedId = await seed(`${day}T19:00:00+05:30`, "confirmed", therapistId, `${MARKER} confirmed`);
});

test.afterAll(async () => {
  await db.from("appointments").delete().like("concern", `${MARKER}%`);
});

test("ML-001: the patient's tiles say when the Meet link shows", async ({ page }) => {
  expect(requestedId && confirmedId).toBeTruthy();
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.patientB));
  await page.goto(`${BASE}/patient/dashboard/sessions`);
  await waitForSplashToClear(page);
  const requested = page.locator("div.rounded-xl", { hasText: `${MARKER} requested` }).first();
  await expect(requested.getByText(/Meet link will show here once a therapist is confirmed - you can join from 5:45/i)).toBeVisible();
  const confirmed = page.locator("div.rounded-xl", { hasText: `${MARKER} confirmed` }).first();
  await expect(confirmed.getByText(/Meet link will show here - you can join from 6:45/i)).toBeVisible();
  await requested.screenshot({ path: "test-results/meet-note-patient.png" });
});

test("ML-002: the therapist's tile says it too", async ({ page }) => {
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.therapistA));
  await page.goto(`${BASE}/therapist/dashboard/sessions`);
  await waitForSplashToClear(page);
  const card = page.locator("div.rounded-xl", { hasText: `${MARKER} confirmed` }).first();
  await expect(card.getByText(/Meet link will show here - you can join from 6:45/i)).toBeVisible();
  await card.screenshot({ path: "test-results/meet-note-therapist.png" });
});
