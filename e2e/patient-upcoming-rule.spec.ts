// One rule for "upcoming", on every patient surface that says it.
//
// A patient with one confirmed, paid session from more than a day ago that
// nobody marked done: the Sessions list files it under Past (sessionBucket's
// grace day is over), and before F-02 the Calendar view of the very same
// rows said "1 session coming up this month", because it counted by status
// alone. Both views now ask sessionBucket (src/lib/calendarMonthStats.ts).
import { test, expect } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  createFixtureAccount,
  deleteFixtureAccount,
  profileIdFor,
  waitForSplashToClear,
} from "./helpers";

const db = adminClient();
const HOUR = 3_600_000;

let patient: { id: string; email: string; name: string };

test.beforeAll(async () => {
  patient = await createFixtureAccount("upcoming rule");
  const therapistId = await profileIdFor(db, QA_EMAILS.therapistA);
  // 26 hours ago, on the hour: past the 24-hour grace sessionBucket gives an
  // open session, so it is Past by the List's rule.
  const slot = new Date(Date.now() - 26 * HOUR);
  slot.setMinutes(0, 0, 0);
  const { error } = await db.from("appointments").insert({
    patient_id: patient.id,
    therapist_id: therapistId,
    slot_time: slot.toISOString(),
    status: "confirmed",
    payment_status: "paid",
    paid_at: new Date(slot.getTime() - 72 * HOUR).toISOString(),
    amount_paid_paise: 120000,
    visit_mode: "online",
    duration_minutes: 30,
    concern: "E2E upcoming rule",
  });
  if (error) throw new Error(`could not seed the past session: ${error.message}`);
});

test.afterAll(async () => {
  await deleteFixtureAccount(patient?.id);
});

test("PU-001: a past confirmed session is Past on the list and not coming up on the calendar", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.context().addCookies(await browserCookiesFor(patient.email));
  await page.goto(`${BASE}/patient/dashboard/sessions`, { waitUntil: "domcontentloaded" });
  await waitForSplashToClear(page);

  // The List: nothing upcoming, one past.
  await expect(page.getByRole("button", { name: /^Upcoming\s*0$/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: /^Past\s*1$/ })).toBeVisible();

  // The Calendar, over the same rows. Click until it says pressed -- a click
  // before hydration is dropped.
  const calendar = page.getByRole("button", { name: "Calendar", exact: true });
  await expect(async () => {
    await calendar.click();
    await expect(calendar).toHaveAttribute("aria-pressed", "true", { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByText(/Showing sessions for/)).toBeVisible();
  // Whichever month the seeded slot fell in, nothing about it is "coming up".
  await expect(page.getByText(/coming up/)).toHaveCount(0);
});
