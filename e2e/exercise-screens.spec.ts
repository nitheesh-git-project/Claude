// HOME EXERCISES, the screens (Health Profile redesign, phase 7d-2): the
// patient's read-only "Your home exercises" card on the Health Profile page
// and the companion's exercise demo. The server side is exercise-teaching.spec.ts.
//
// Fixture: a throwaway patient recorded as Strength and balance care with one
// completed video session with QA Therapist A (so the Health Profile is not
// "awaiting your therapist"). The plan is published through the route as the
// therapist; the run is started, the safety questions answered no and the
// demo sent through the routes -- the cockpit's clicks are checked by hand
// (THR-HP-005t) and by screenshot, not driven here.
//
// Plans, items and run events are append-only and never deleted (triggers):
// disposable projects only. WRITTEN, NOT RUN in the phase that added it (no
// test project was reachable).
import { test, expect, type APIRequestContext } from "@playwright/test";
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
  "writes append-only plan items and run events; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const db = adminClient();
const SEEN = { timeout: 60_000 };
const MARKER = "E2E exercise screens";
const GERI_RED_FLAGS = ["chest_pain_or_breathless", "dizzy_today", "fall_since_last", "unwell_or_fever", "new_pain_walking"];
let patient: { id: string; email: string; name: string } | undefined;
let runId = "";

async function post(request: APIRequestContext, path: string, data: unknown) {
  return request.post(`${BASE}${path}`, {
    headers: { cookie: await cookieHeaderFor(QA_EMAILS.therapistA), "content-type": "application/json" },
    data,
  });
}

test.beforeAll(async () => {
  const therapistAId = await profileIdFor(db, QA_EMAILS.therapistA);
  patient = await createFixtureAccount("Exercise Screens");
  const { error } = await db
    .from("patient_condition_profiles")
    .insert({ patient_id: patient.id, specialty: "geriatric", status: "active", data: { geri_falls_12m: "No falls" } });
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
  if (runId) await post(request, "/api/therapist/assessment-runs/end", { runId, outcome: "abandoned", reason: "other" });
  await deleteFixtureAccount(patient?.id);
});

test("ES-001: before any plan the card is calm and has nothing to fill in", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await context.addCookies(await browserCookiesFor(patient!.email));
  const page = await context.newPage();
  await page.goto(`${BASE}/patient/dashboard/health-profile`);
  const card = page.getByTestId("home-exercises");
  await expect(card).toBeVisible(SEEN);
  await expect(card).toHaveAttribute("data-state", "empty");
  await expect(card).toContainText("Your physiotherapist will teach you your exercises in your video session");
  await expect(card.locator("input, textarea, select, button")).toHaveCount(0);
  await expect(card).not.toContainText(/care plan/i);
  await context.close();
});

test("ES-002: the plan card shows each exercise with its dose and steps, read only", async ({ browser, request }) => {
  const res = await post(request, "/api/therapist/exercise-plans/publish", {
    patientId: patient!.id,
    items: [{ exerciseKey: "sit_to_stand", dose: { reps: 8, note: "Hold the kitchen counter." } }, { exerciseKey: "heel_raise" }],
  });
  expect(res.status(), await res.text()).toBe(200);

  const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await context.addCookies(await browserCookiesFor(patient!.email));
  const page = await context.newPage();
  await page.goto(`${BASE}/patient/dashboard/health-profile`);
  const card = page.getByTestId("home-exercises");
  await expect(card).toHaveAttribute("data-state", "plan", SEEN);
  await expect(card.getByRole("heading", { name: "Your home exercises" })).toBeVisible();
  const sit = page.getByTestId("home-exercise-sit_to_stand");
  await expect(sit).toContainText("Sit to stand");
  await expect(sit).toContainText("2 sets of 8. Once a day, 5 days a week.");
  await expect(sit.getByRole("img")).toBeVisible();
  // The steps sit under the name, collapsed until it is opened.
  await expect(sit.getByRole("listitem").first()).toBeHidden();
  await sit.locator("summary").click();
  await expect(sit.getByRole("listitem").first()).toBeVisible();
  await expect(sit).toContainText("Hold the kitchen counter.");
  await expect(page.getByTestId("home-exercise-practised-sit_to_stand")).toContainText("Your physiotherapist will go through this with you");
  // Nothing to tick, type or press.
  await expect(card.locator("input, textarea, select, button, a")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});

test("ES-003: the companion shows the exercise demo, with no controls and no clock", async ({ browser, request }) => {
  const start = await post(request, "/api/therapist/assessment-runs/start", { patientId: patient!.id });
  expect(start.status(), await start.text()).toBe(200);
  runId = (await start.json()).run.id;
  const event = (stepId: string, kind: string, details?: unknown) => post(request, "/api/therapist/assessment-runs/event", { runId, stepId, kind, details });
  expect((await event("safety", "setup_confirmed", { items: ["clear_space", "someone_home"] })).status()).toBe(200);
  const answers = Object.fromEntries(GERI_RED_FLAGS.map((id) => [id, false]));
  expect((await event("safety", "safety_confirmed", { answers })).status()).toBe(200);
  expect((await event("safety", "saved")).status()).toBe(200);
  const published = await post(request, "/api/therapist/exercise-plans/publish", {
    runId,
    items: [{ exerciseKey: "sit_to_stand" }, { exerciseKey: "heel_raise" }],
  });
  expect(published.status(), await published.text()).toBe(200);
  const demo = await post(request, "/api/therapist/assessment-runs/teach", { runId, exerciseKey: "sit_to_stand", phase: "demo" });
  expect(demo.status(), await demo.text()).toBe(200);

  const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await context.addCookies(await browserCookiesFor(patient!.email));
  const page = await context.newPage();
  await page.goto(`${BASE}/patient/dashboard/session`);
  await expect(page.getByTestId("companion-live")).toHaveAttribute("data-exercise", "sit_to_stand", SEEN);
  await expect(page.getByTestId("companion-counter")).toHaveText("Exercise 1 of 2");
  await expect(page.getByTestId("companion-line")).toHaveText("Watch how it is done.");
  await expect(page.getByTestId("companion-steps").getByRole("listitem")).not.toHaveCount(0);
  await expect(page.getByTestId("companion-live").getByRole("img").first()).toBeVisible();
  await expect(page.getByTestId("companion").getByRole("button")).toHaveCount(0);

  await context.close();
});

test("ES-004: the Overview has one calm 'Your home exercises' row linking to the card", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await context.addCookies(await browserCookiesFor(patient!.email));
  const page = await context.newPage();
  await page.goto(`${BASE}/patient/dashboard`);
  const row = page.getByRole("link", { name: /Your home exercises/ });
  await expect(row).toBeVisible(SEEN);
  await expect(row).toContainText(/\d+ exercises? from your physiotherapist/);
  await expect(row).toHaveAttribute("href", "/patient/dashboard/health-profile#home-exercises");
  await row.click();
  await expect(page).toHaveURL(/health-profile#home-exercises$/);
  await expect(page.getByTestId("home-exercises")).toBeVisible();
  await context.close();
});

test("ES-005: the admin's patient detail shows Home exercises read only", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await context.addCookies(await browserCookiesFor(QA_EMAILS.admin));
  const page = await context.newPage();
  await page.goto(`${BASE}/admin/dashboard/conditions/${patient!.id}`);
  await expect(page.getByTestId("chart-exercises")).toBeVisible(SEEN);
  await expect(page.getByTestId("chart-exercise-sit_to_stand")).toContainText("Sit to stand");
  await expect(page.getByTestId("chart-exercises").locator("input, textarea, select, button")).toHaveCount(0);
  await context.close();
});
