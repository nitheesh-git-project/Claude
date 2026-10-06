// The rating card on a completed session, from both sides: five stars,
// quick picks that suit the score, an optional note, then the thank-you.
// The picks are saved inside the ordinary feedback text (src/lib/
// feedbackPicks.ts), so what reaches the database is checked here too.
import { test, expect, type Page } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  markDashboardTourSeen,
  pageUntilVisible,
  profileIdFor,
  waitForSplashToClear,
} from "./helpers";

const db = adminClient();
const MARKER = `E2E session-feedback ${Date.now()}`;
const HOUR = 60 * 60 * 1000;

let sessionId: string;

test.beforeAll(async () => {
  const patientId = await profileIdFor(db, QA_EMAILS.patientA);
  const therapistId = await profileIdFor(db, QA_EMAILS.therapistA);
  await markDashboardTourSeen(QA_EMAILS.patientA);
  await markDashboardTourSeen(QA_EMAILS.therapistA);
  // A completed session a few days back, in the first hour neither side
  // already has one -- earlier runs leave completed sessions behind.
  for (let h = 50; h < 50 + 24 * 6; h += 1) {
    const slot = new Date(Date.now() - h * HOUR);
    slot.setMinutes(0, 0, 0);
    const { data, error } = await db
      .from("appointments")
      .insert({
        patient_id: patientId,
        therapist_id: therapistId,
        slot_time: slot.toISOString(),
        status: "completed",
        payment_status: "paid",
        duration_minutes: 30,
        visit_mode: "online",
        concern: MARKER,
      })
      .select("id")
      .single();
    if (!error && data) {
      sessionId = data.id as string;
      return;
    }
  }
  throw new Error("could not find a free hour to seed a completed session");
});

async function openCard(page: Page, email: string, path: string) {
  await page.context().addCookies(await browserCookiesFor(email));
  await page.goto(`${BASE}${path}`);
  await waitForSplashToClear(page);
  await page.getByRole("button", { name: /^Past/ }).first().click();
  const card = page.locator("div.rounded-xl", { hasText: MARKER }).first();
  expect(await pageUntilVisible(page, "sessions", card)).toBe(true);
  return card;
}

test("SF-001: a patient rates with stars, a quick pick and a note, and is thanked", async ({ page }) => {
  const card = await openCard(page, QA_EMAILS.patientA, "/patient/dashboard/sessions");
  const form = card.getByRole("form", { name: "Rate this session" });
  await expect(form).toBeVisible();
  // Nothing to pick until there is a score.
  await expect(form.getByRole("button", { name: "Clear explanations" })).toHaveCount(0);

  await form.getByRole("button", { name: /^4 stars/ }).click();
  await expect(form.getByText("Great", { exact: true })).toBeVisible();
  await form.getByRole("button", { name: "Clear explanations" }).click();
  await expect(form.getByRole("button", { name: "Clear explanations" })).toHaveAttribute("aria-pressed", "true");
  await form.getByLabel(/Anything else/).fill("More stretches next time");
  await form.getByRole("button", { name: "Send feedback" }).click();

  await expect(card.getByText(/^Thank you/)).toBeVisible();
  await expect(card.getByText("Your feedback is with the clinic.")).toBeVisible();
  await card.screenshot({ path: "test-results/session-feedback-thanks.png" });

  const { data } = await db
    .from("appointments")
    .select("patient_rating, patient_feedback")
    .eq("id", sessionId)
    .single();
  expect(data!.patient_rating).toBe(4);
  expect(data!.patient_feedback).toBe("Clear explanations · More stretches next time");

  // A later visit shows the summary, not the form and not the animation.
  await page.reload();
  await waitForSplashToClear(page);
  await page.getByRole("button", { name: /^Past/ }).first().click();
  const again = page.locator("div.rounded-xl", { hasText: MARKER }).first();
  expect(await pageUntilVisible(page, "sessions", again)).toBe(true);
  await expect(again.getByText("You rated this session")).toBeVisible();
  await expect(again.getByText("Clear explanations")).toBeVisible();
  await expect(again.getByRole("form", { name: "Rate this session" })).toHaveCount(0);
});

test("SF-002: a low score offers what could be better, and a therapist can send picks alone", async ({ page }) => {
  const card = await openCard(page, QA_EMAILS.therapistA, "/therapist/dashboard/sessions");
  const form = card.getByRole("form", { name: "Rate this session" });
  await form.getByRole("button", { name: /^2 stars/ }).click();
  await expect(form.getByText("What could have gone better?")).toBeVisible();
  await form.getByRole("button", { name: "Connection issues" }).click();
  await form.getByRole("button", { name: "Send feedback" }).click();
  await expect(card.getByText(/^Thank you/)).toBeVisible();

  const { data } = await db
    .from("appointments")
    .select("therapist_rating, therapist_feedback")
    .eq("id", sessionId)
    .single();
  expect(data!.therapist_rating).toBe(2);
  expect(data!.therapist_feedback).toBe("Connection issues");
});
