// The guided video assessment's two screens (Health Profile redesign, phase
// 7b): the therapist's session cockpit at /therapist/dashboard/assessment/
// [patientId] and the patient's display-only companion at
// /patient/dashboard/session. The routes under them were phase 7a's
// (assessment-run.spec.ts); this drives the screens.
//
// Fixtures: one throwaway orthopaedic patient of its own with one completed
// video session with QA Therapist A (a session that has been delivered counts
// as started). QA Therapist B has no relationship to the patient.
//
// What is asserted: the chart offers the door and the cockpit opens on the
// safety step with the step bar, the card (script, set-up, helper rule) and
// exactly three actions; Save and next stays disabled until the set-up is
// ticked and every safety question answered, and says what is missing; a step
// after the safety check is shut until it is answered; Stop test writes a
// stopped event and saves nothing; the patient's screen is a calm waiting
// state with no run, then shows only the step counter, the step name and one
// patient-safe line with nothing to press; neither screen scrolls sideways at
// 390 px and the three actions stay on screen; an unassigned therapist gets a
// 404, never the screen.
//
// Run events are append-only and a run is never deleted (triggers), so the
// rows this writes stay -- disposable projects only. The cleanup ends the run
// so the patient is not left with one in progress.
//
// WRITTEN, NOT RUN in the phase that added it (no test project was reachable).
import { test, expect, type Page } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  browserCookiesFor,
  cookieHeaderFor,
  createFixtureAccount,
  deleteFixtureAccount,
  insertPastFixtureAppointment,
  profileIdFor,
} from "./helpers";

test.skip(
  process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
  "writes append-only run events; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const db = adminClient();
const SEEN = { timeout: 60_000 };
const MARKER = "E2E assessment cockpit";
let patient: { id: string; email: string; name: string } | undefined;
let runId = "";

async function asTherapist(page: Page) {
  await page.context().addCookies(await browserCookiesFor(QA_EMAILS.therapistA));
}

async function cockpit(page: Page) {
  await asTherapist(page);
  await page.goto(`${BASE}/therapist/dashboard/assessment/${patient!.id}`);
}

test.beforeAll(async () => {
  const therapistAId = await profileIdFor(db, QA_EMAILS.therapistA);
  patient = await createFixtureAccount("Assessment Cockpit");
  const { error } = await db
    .from("patient_condition_profiles")
    .insert({ patient_id: patient.id, specialty: "ortho", status: "active", data: { pain_location: "Right knee" } });
  expect(error, error?.message).toBeNull();
  await insertPastFixtureAppointment(db, {
    patient_id: patient.id,
    therapist_id: therapistAId,
    status: "completed",
    payment_status: "paid",
    visit_mode: "online",
    duration_minutes: 30,
    concern: MARKER,
  });
});

test.afterAll(async ({ request }) => {
  if (runId) {
    await request.post(`${BASE}/api/therapist/assessment-runs/end`, {
      headers: { cookie: await cookieHeaderFor(QA_EMAILS.therapistA), "content-type": "application/json" },
      data: { runId, outcome: "abandoned", reason: "other" },
    });
  }
  await deleteFixtureAccount(patient?.id);
});

test("AC-001: with no run the patient's screen waits calmly and has nothing but a way back", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addCookies(await browserCookiesFor(patient!.email));
  const page = await context.newPage();
  await page.goto(`${BASE}/patient/dashboard/session`);
  const waiting = page.getByTestId("companion-waiting");
  await expect(waiting).toBeVisible(SEEN);
  await expect(waiting).toContainText("Your physiotherapist will start the guided check soon");
  // No result, no clinic word, nothing to press but the way back to the dashboard.
  await expect(page.getByTestId("companion").getByRole("button")).toHaveCount(0);
  await expect(page.getByTestId("companion").getByRole("link")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Back to your dashboard" })).toBeVisible();
  await context.close();
});

test("AC-002: the chart offers Start guided assessment, and the cockpit opens on the safety step with three actions", async ({ page }) => {
  await asTherapist(page);
  await page.goto(`${BASE}/therapist/dashboard/health-profile/${patient!.id}`);
  await page.getByTestId("chart-start-guided-assessment").click(SEEN);
  await expect(page).toHaveURL(new RegExp(`/therapist/dashboard/assessment/${patient!.id}`));

  await page.getByTestId("start-assessment").click(SEEN);
  await expect(page.getByTestId("session-cockpit")).toBeVisible(SEEN);

  // The steps across the top: nine (Home exercises is the eighth), the first the current one.
  const steps = page.getByTestId("step-bar").getByRole("button");
  await expect(steps).toHaveCount(9);
  await expect(steps.first()).toHaveAttribute("aria-current", "step");

  // The card: where we are, what to say, the set-up, the helper rule only where it applies.
  await expect(page.getByTestId("step-card")).toContainText("Step 1 of 9");
  await expect(page.getByTestId("step-title")).toHaveText("Safety check");
  await expect(page.getByTestId("step-script")).not.toBeEmpty();
  await expect(page.getByTestId("step-card").getByRole("checkbox").first()).toBeVisible();
  await expect(page.getByTestId("helper-warning")).toHaveCount(0);

  // Exactly three actions, always the same.
  const bar = page.getByRole("group", { name: "Step actions" });
  await expect(bar.getByRole("button")).toHaveCount(3);
  await expect(bar.getByRole("button", { name: "Stop test" })).toBeEnabled();
  await expect(bar.getByRole("button", { name: "Skip" })).toBeDisabled(); // the safety check cannot be skipped
  // ... and the reason is on the page and attached to the button, not only a hover title.
  await expect(page.getByTestId("action-skip-reason")).toHaveText("This step cannot be skipped.");
  await expect(bar.getByRole("button", { name: "Skip" })).toHaveAccessibleDescription("This step cannot be skipped.");
  await expect(bar.getByRole("button", { name: "Save and next" })).toBeDisabled();

  const run = await db.from("assessment_runs").select("id, status, protocol_key").eq("patient_id", patient!.id).eq("status", "in_progress").single();
  expect(run.data?.protocol_key).toBe("ortho_knee");
  runId = run.data!.id as string;
});

test("AC-003: Save and next stays disabled until the set-up is ticked and every safety question answered, and says what is missing", async ({ page }) => {
  await cockpit(page);
  const save = page.getByTestId("action-save");
  const note = page.getByTestId("action-note");
  await expect(save).toBeDisabled(SEEN);
  await expect(note).toContainText(/set-up/i);

  // The next step is shut until the safety questions are answered.
  await expect(page.getByTestId("step-pain")).toBeDisabled();

  for (const box of await page.getByTestId("step-card").getByRole("checkbox").all()) await box.check();
  await expect(save).toBeDisabled();
  await expect(note).toContainText(/safety question/i);

  const questions = page.locator("[data-testid^=flag-]").filter({ has: page.getByRole("button", { name: "No" }) });
  const count = await questions.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) await questions.nth(i).getByRole("button", { name: "No" }).click();
  await expect(save).toBeEnabled();
  await expect(note).toContainText("Nothing is saved until Save and next");
});

test("AC-004: Stop test saves nothing and writes only a stopped event", async ({ page }) => {
  await cockpit(page);
  const questions = page.locator("[data-testid^=flag-]").filter({ has: page.getByRole("button", { name: "No" }) });
  for (let i = 0; i < (await questions.count()); i++) await questions.nth(i).getByRole("button", { name: "No" }).click();

  await page.getByTestId("action-stop").click();
  await page.getByRole("dialog").getByRole("button", { name: "Started again" }).click();
  await expect(page.getByTestId("cockpit-notice")).toContainText("Nothing from that attempt was kept", SEEN);
  // The answers are thrown away with it.
  await expect(page.getByTestId("action-save")).toBeDisabled();

  const events = await db.from("assessment_run_events").select("kind, step_id, measurement_id").eq("run_id", runId);
  const kinds = (events.data ?? []).map((e) => e.kind as string);
  expect(kinds).toContain("stopped");
  expect(kinds).not.toContain("saved");
  expect(kinds).not.toContain("safety_confirmed");
  const readings = await db.from("outcome_measurements").select("id").eq("patient_id", patient!.id);
  expect(readings.data ?? []).toHaveLength(0);
});

test("AC-005: the patient's screen shows only the step counter, its name and one patient-safe line, with nothing to press", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addCookies(await browserCookiesFor(patient!.email));
  const page = await context.newPage();
  await page.goto(`${BASE}/patient/dashboard/session`);
  const live = page.getByTestId("companion-live");
  await expect(live).toBeVisible(SEEN);
  await expect(page.getByTestId("companion-step")).toContainText("Step 1 of 9");
  await expect(page.getByTestId("companion-step")).toContainText("Safety check");
  await expect(page.getByTestId("companion-line")).not.toBeEmpty();

  // Display only: no button, link, field or form on the live screen.
  await expect(live.getByRole("button")).toHaveCount(0);
  await expect(live.getByRole("link")).toHaveCount(0);
  await expect(live.locator("input, select, textarea, form")).toHaveCount(0);

  // Patient-safe words only: no result, no clinic word, no back-office path.
  const text = (await page.getByTestId("companion").innerText()).toLowerCase();
  for (const word of ["triage", "specialty", "red flag", "lefs", "score", "admin", "protocol", "ortho"]) expect(text).not.toContain(word);
  await context.close();
});

test("AC-006: neither screen scrolls sideways at 390 px and the three actions stay on screen", async ({ browser }) => {
  const therapist = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await therapist.addCookies(await browserCookiesFor(QA_EMAILS.therapistA));
  const t = await therapist.newPage();
  await t.goto(`${BASE}/therapist/dashboard/assessment/${patient!.id}`);
  await expect(t.getByTestId("session-cockpit")).toBeVisible(SEEN);
  const overflow = await t.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  for (const name of ["Stop test", "Skip", "Save and next"]) {
    const box = await t.getByRole("group", { name: "Step actions" }).getByRole("button", { name }).boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await therapist.close();

  const patientCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await patientCtx.addCookies(await browserCookiesFor(patient!.email));
  const p = await patientCtx.newPage();
  await p.goto(`${BASE}/patient/dashboard/session`);
  await expect(p.getByTestId("companion-live")).toBeVisible(SEEN);
  expect(await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await patientCtx.close();
});

test("AC-007: a therapist with no relationship to the patient gets a 404, never the screen", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addCookies(await browserCookiesFor(QA_EMAILS.therapistB));
  const page = await context.newPage();
  const response = await page.goto(`${BASE}/therapist/dashboard/assessment/${patient!.id}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByTestId("session-cockpit")).toHaveCount(0);
  await context.close();
});
