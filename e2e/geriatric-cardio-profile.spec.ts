// Strength and balance care and Heart and lung rehabilitation (Health
// Profile redesign, phase 6b: the screens; the server side is
// geriatric-cardio-intake.spec.ts). The pages open in the shared layout with
// the condition picture drawn from recorded measurements: the fall-risk dial
// with the STEADI rule that decided it, the four test cards, daily living,
// the home safety check and the standing blood pressure; the safety limits
// row, the oxygen bar with the patient's own limit, the vitals and the
// active-minutes diary. The home safety check is a free registry measure
// (a 1 or 0 per item, the value how many are done); height, weight and the
// highest heart rate are free measures the physiotherapist records.
//
// The pre-exercise refusal is enforced on the screen that starts exercise
// (the guided six-minute walk), not at a route - this spec drives that screen
// and not a route. What it does not drive, and where it is covered: the STEADI
// level, the card badges, the walk track and oxygen bar geometry, the
// predicted-distance "needs ..." line, the heart-rate target rules and the
// walk's readings are pure modules (src/lib/phase6bProfile.test.ts,
// steadiCards.test.ts, cardioPicture.test.ts, geriatricCardioProfile.test.ts).
//
// Fixtures: two throwaway patients, each with one completed session with QA
// Therapist A. Measurements and diary entries are append-only, so they stay -
// disposable projects only. The setting is restored afterwards.
import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";
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
  "writes append-only measurements and diary entries; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);

test.describe.configure({ mode: "serial" });

const MARKER = "E2E geriatric cardio profile";
const SEEN = { timeout: 60_000 };
const db = adminClient();
let geri: { id: string; email: string; name: string } | undefined;
let cardio: { id: string; email: string; name: string } | undefined;
let therapistAId = "";
let settingBefore: unknown = null;

const OPEN_HEART = "Heart bypass or valve surgery (open-heart)";
const GERI_ANSWERS = {
  geri_concern: "E2E: three falls this year",
  geri_falls_12m: "Two or more falls",
  geri_unsteady: "Yes",
  geri_fall_worry: "Yes",
  geri_walking_aid: "A walking stick",
  geri_daily_help: "Bathing or washing",
  geri_goal: "Walk to my daughter's house on my own",
};
const CARDIO_ANSWERS = {
  cardio_condition: OPEN_HEART,
  cardio_condition_date: "July 2026",
  cardio_sternal_precautions: "No lifting over 4 kg",
  cardio_sternal_precautions_until: "20 Nov 2026",
  cardio_beta_blocker: "Yes",
  cardio_breathlessness: "I walk slower than others my age, or stop for breath at my own pace",
  cardio_home_oxygen: "No",
  cardio_spo2_limit: "No limit given, or not sure",
  cardio_goal: "Back at work",
};
const HOME_KEYS = ["grab_rail_toilet", "night_light_bathroom", "loose_rugs_removed", "non_slip_shower_mat", "raised_toilet_seat", "stair_rails"];

function minutesAgo(n: number) {
  return new Date(Date.now() - n * 60_000).toISOString();
}

async function post(request: APIRequestContext, path: string, email: string | null, data: unknown) {
  return request.post(`${BASE}${path}`, {
    headers: { ...(email ? { cookie: await cookieHeaderFor(email) } : {}), "content-type": "application/json" },
    data,
  });
}

async function pageAs(browser: Browser, email: string, path: string, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  await context.addCookies(await browserCookiesFor(email));
  const page = await context.newPage();
  await page.goto(`${BASE}${path}`);
  return { context, page };
}

const record = (request: APIRequestContext, patientId: string, measurement: Record<string, unknown>) =>
  post(request, "/api/therapist/measurements/submit", QA_EMAILS.therapistA, { patientId, measurement });
const conditions = { setting: "in_person" };

test.beforeAll(async ({ request }) => {
  therapistAId = await profileIdFor(db, QA_EMAILS.therapistA);
  const { data } = await db.from("site_settings").select("enabled_intake_specialties").eq("id", true).maybeSingle();
  settingBefore = data?.enabled_intake_specialties ?? null;
  await db.from("site_settings").update({ enabled_intake_specialties: ["ortho", "neuro", "pediatrics", "geriatric", "cardiopulmonary"] }).eq("id", true);
  geri = await createFixtureAccount("Geriatric Profile");
  cardio = await createFixtureAccount("Cardio Profile");
  for (const patient of [geri, cardio]) {
    await insertPastFixtureAppointment(db, {
      patient_id: patient.id,
      therapist_id: therapistAId,
      status: "completed",
      payment_status: "paid",
      visit_mode: "online",
      duration_minutes: 30,
      concern: MARKER,
    });
  }
  const onboard = (patientId: string, specialty: string, data: Record<string, string>, triageData: Record<string, string>) =>
    post(request, "/api/therapist/condition-profile/onboard", QA_EMAILS.therapistA, { patientId, specialty, data, triageData });
  const a = await onboard(geri.id, "geriatric", GERI_ANSWERS, { age_band: "65 or older", presenting_problem: "Falls, unsteadiness or getting weaker with age" });
  expect(a.status(), await a.text()).toBe(200);
  const b = await onboard(cardio.id, "cardiopulmonary", CARDIO_ANSWERS, { age_band: "18 to 64", presenting_problem: "A heart or lung condition, or after heart surgery or a heart attack" });
  expect(b.status(), await b.text()).toBe(200);
});

test.afterAll(async () => {
  await db
    .from("site_settings")
    .update({ enabled_intake_specialties: settingBefore ?? ["ortho", "neuro", "pediatrics"] })
    .eq("id", true);
  await deleteFixtureAccount(geri?.id);
  await deleteFixtureAccount(cardio?.id);
});

test("GP-001: the home safety check, height, weight and the highest heart rate are recorded at the shared route and checked", async ({ request }) => {
  const items = (done: string[]) => Object.fromEntries(HOME_KEYS.map((k) => [k, done.includes(k) ? 1 : 0]));
  const home = (value: number, itemsBody: Record<string, number>, at: string) =>
    record(request, geri!.id, { measureKey: "home_safety_check", value, items: itemsBody, measuredAt: at, conditions });

  const ok = await home(2, items(["grab_rail_toilet", "stair_rails"]), minutesAgo(50));
  expect(ok.status(), await ok.text()).toBe(200);
  expect((await ok.json()).measurement).toMatchObject({ measureKey: "home_safety_check", value: 2 });
  // The value must be how many are ticked; every item must be there and a tick is 1 or 0.
  expect((await home(3, items(["grab_rail_toilet", "stair_rails"]), minutesAgo(49))).status()).toBe(400);
  expect((await home(1, { grab_rail_toilet: 1 }, minutesAgo(48))).status()).toBe(400);
  expect((await home(2, { ...items([]), grab_rail_toilet: 2 }, minutesAgo(47))).status()).toBe(400);
  // A new snapshot is a new row; an earlier one is never changed.
  expect((await home(4, items(["grab_rail_toilet", "stair_rails", "night_light_bathroom", "loose_rugs_removed"]), minutesAgo(40))).status()).toBe(200);
  // It is a geriatric measure only.
  expect((await record(request, cardio!.id, { measureKey: "home_safety_check", value: 0, items: items([]), measuredAt: minutesAgo(30), conditions })).status()).toBe(400);
  // A patient cannot record a test.
  const asPatient = await post(request, "/api/therapist/measurements/submit", geri!.email, {
    patientId: geri!.id,
    measurement: { measureKey: "height_cm", value: 160, measuredAt: minutesAgo(5), conditions },
  });
  expect(asPatient.status()).toBe(403);

  expect((await record(request, cardio!.id, { measureKey: "height_cm", value: 172, measuredAt: minutesAgo(30), conditions })).status()).toBe(200);
  expect((await record(request, cardio!.id, { measureKey: "weight_kg", value: 74.5, measuredAt: minutesAgo(30), conditions })).status()).toBe(200);
  expect((await record(request, cardio!.id, { measureKey: "height_cm", value: 20, measuredAt: minutesAgo(29), conditions })).status()).toBe(400);
  // The highest heart rate says where it came from.
  expect((await record(request, cardio!.id, { measureKey: "max_hr_bpm", value: 158, variant: "exercise_test", measuredAt: minutesAgo(28), conditions })).status()).toBe(200);
  expect((await record(request, cardio!.id, { measureKey: "max_hr_bpm", value: 158, measuredAt: minutesAgo(27), conditions })).status()).toBe(400);
});

test("GP-002: the Strength and balance care page draws the dial with its rule, the four test cards, daily living and the home safety check", async ({ browser, request }) => {
  test.setTimeout(240_000);
  for (const m of [
    { measureKey: "tug", value: 14.2, items: [14.2], measuredAt: minutesAgo(300) },
    { measureKey: "tug", value: 11.4, items: [11.4], measuredAt: minutesAgo(20) },
    { measureKey: "four_stage_balance", value: 3, measuredAt: minutesAgo(19) },
    { measureKey: "gait_speed_4m", value: 0.72, items: [0.72], measuredAt: minutesAgo(18) },
    {
      measureKey: "orthostatic_bp",
      value: 25,
      items: { lying_systolic: 130, lying_diastolic: 80, standing_1min_systolic: 105, standing_1min_diastolic: 72 },
      measuredAt: minutesAgo(17),
    },
  ]) {
    const res = await record(request, geri!.id, { ...m, conditions });
    expect(res.status(), `${m.measureKey}: ${await res.text()}`).toBe(200);
  }

  const own = await pageAs(browser, geri!.email, "/patient/dashboard/health-profile");
  const root = own.page.getByTestId("geriatric-profile");
  await expect(root).toBeVisible(SEEN);
  await expect(root).toContainText("Strength and balance care");
  await expect(root).not.toContainText("Geriatric");
  // The level and the RULE that decided it; the safer-range line is its own line.
  await expect(root.getByTestId("fall-risk-rule")).toContainText("High because of 2 falls in the last 12 months");
  await expect(root.getByTestId("safer-range-line")).toContainText("Tests in the safer range:");
  await expect(root.getByTestId("steadi-cards").getByRole("listitem")).toHaveCount(4);
  await expect(root.getByTestId("steadi-tug")).toHaveAttribute("data-badge", "safer");
  await expect(root.getByTestId("daily-living")).toContainText("5 of 6");
  await expect(root.getByTestId("home-safety-count")).toHaveText("4 of 6 done");
  await expect(root.getByTestId("orthostatic-tell-doctor")).toBeVisible();
  // The patient has none of the physiotherapist's controls.
  await expect(own.page.getByTestId("falls-check-start")).toHaveCount(0);
  await expect(own.page.getByRole("button", { name: "Record a test" })).toHaveCount(0);
  await expect(own.page.getByRole("button", { name: /Log a fall or a near miss/ })).toBeVisible();
  await own.context.close();

  const treating = await pageAs(browser, QA_EMAILS.therapistA, `/therapist/dashboard/health-profile/${geri!.id}`);
  await expect(treating.page.getByTestId("geriatric-profile")).toContainText("Geriatric", SEEN);
  await expect(treating.page.getByTestId("falls-check-start")).toBeVisible();
  await expect(treating.page.getByRole("button", { name: "Record a test" })).toBeVisible();
  // The guided falls check runs the tests in order, one step at a time.
  await treating.page.getByTestId("falls-check-start").click();
  const dialog = treating.page.getByRole("dialog");
  await expect(dialog.getByTestId("flow-step")).toContainText("Step 1 of 4: Timed Up and Go", SEEN);
  await dialog.getByRole("button", { name: "Leave this one out" }).click();
  await expect(dialog.getByTestId("flow-step")).toContainText("Step 2 of 4: 30-second chair stand", SEEN);
  await treating.context.close();
});

test("GP-003: the Heart and lung page shows the patient's safety limits, the oxygen bar with their own limit and the pre-session check", async ({ browser, request }) => {
  test.setTimeout(240_000);
  for (const m of [
    { measureKey: "six_minute_walk", value: 430, items: [430], measuredAt: minutesAgo(25) },
    { measureKey: "resting_heart_rate", value: 128, measuredAt: minutesAgo(24) },
    { measureKey: "blood_pressure", variant: "rest", value: 124, items: { systolic: 124, diastolic: 78 }, measuredAt: minutesAgo(23) },
    { measureKey: "resting_spo2", value: 97, measuredAt: minutesAgo(22) },
    { measureKey: "lowest_spo2", value: 94, measuredAt: minutesAgo(21) },
  ]) {
    const res = await record(request, cardio!.id, { ...m, conditions });
    expect(res.status(), `${m.measureKey}: ${await res.text()}`).toBe(200);
  }

  const own = await pageAs(browser, cardio!.email, "/patient/dashboard/health-profile");
  const root = own.page.getByTestId("cardio-profile");
  await expect(root).toBeVisible(SEEN);
  await expect(root).toContainText("Heart and lung rehabilitation");
  const limits = root.getByTestId("safety-limits");
  // The patient's own limit, labelled a default until the doctor sets one; the beta-blocker note.
  await expect(limits.getByTestId("limit-oxygen")).toContainText("Oxygen stop limit 90%");
  await expect(limits.getByTestId("limit-oxygen")).toContainText("default");
  await expect(limits.getByTestId("limit-beta")).toContainText("talk test, not your heart rate");
  await expect(root.getByTestId("oxygen-limit")).toContainText("Your stop limit: 90%");
  await expect(root.getByTestId("walk-track")).toContainText("430");
  await expect(root.getByTestId("stop-box")).toContainText("Stop and tell your physiotherapist");
  // The patient is never shown a heart-rate target on a beta-blocker.
  await expect(root.getByTestId("hr-target")).toHaveCount(0);
  await expect(own.page.getByRole("button", { name: /Log your active minutes/ })).toBeVisible();
  await expect(own.page.getByTestId("pre-session-check")).toHaveCount(0);
  await own.context.close();

  const treating = await pageAs(browser, QA_EMAILS.therapistA, `/therapist/dashboard/health-profile/${cardio!.id}`);
  const check = treating.page.getByTestId("pre-session-check");
  await expect(check).toBeVisible(SEEN);
  // A resting heart rate of 128 is over the limit: do not exercise today.
  await expect(check.getByTestId("pre-session-stop")).toContainText("Do not exercise or test today. Contact the patient's doctor.");
  await expect(check.getByTestId("pre-session-stop")).toContainText("Resting heart rate 128");
  await treating.context.close();
});

test("GP-004: the guided six-minute walk cannot be started while a pre-exercise red flag stands", async ({ browser }) => {
  test.setTimeout(240_000);
  const treating = await pageAs(browser, QA_EMAILS.therapistA, `/therapist/dashboard/health-profile/${cardio!.id}`, { width: 390, height: 900 });
  await treating.page.getByRole("button", { name: "Start the six-minute walk" }).first().click(SEEN);
  const dialog = treating.page.getByRole("dialog");
  await dialog.getByText("In person").first().click();
  const boxes = dialog.locator("input[type=checkbox]");
  for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).check();
  await dialog.getByLabel("Heart rate (beats a minute)").first().fill("78");
  await dialog.getByLabel("Blood pressure, top").first().fill("128");
  await dialog.getByLabel("Blood pressure, bottom").first().fill("80");
  await dialog.getByLabel("Oxygen (%)").first().fill("96");
  const start = dialog.getByRole("button", { name: "Start the 6:00 walk" });
  await expect(start).toBeEnabled();
  // Over 180/100: refused, in the clinician's wording, and the button is off.
  await dialog.getByLabel("Blood pressure, top").first().fill("186");
  await expect(dialog.getByTestId("walk-refusal")).toContainText("Do not exercise or test today. Contact the patient's doctor.");
  await expect(start).toBeDisabled();
  await dialog.getByLabel("Blood pressure, top").first().fill("128");
  await expect(dialog.getByTestId("walk-refusal")).toHaveCount(0);
  // Oxygen under the patient's own limit refuses it too.
  await dialog.getByLabel("Oxygen (%)").first().fill("85");
  await expect(dialog.getByTestId("walk-refusal")).toBeVisible();
  await expect(start).toBeDisabled();
  await treating.context.close();
});

test("GP-005: active minutes are written in the diary, waiting for the therapist, who confirms them once", async ({ browser, request }) => {
  test.setTimeout(240_000);
  const add = await post(request, "/api/patient/diary/add", cardio!.email, {
    kind: "active_minutes",
    occurredAt: minutesAgo(30),
    details: { minutes: 25, intensity: "moderate" },
  });
  expect(add.status(), await add.text()).toBe(200);
  const bad = await post(request, "/api/patient/diary/add", cardio!.email, { kind: "active_minutes", occurredAt: minutesAgo(29), details: { minutes: 0 } });
  expect(bad.status()).toBe(400);

  const own = await pageAs(browser, cardio!.email, "/patient/dashboard/health-profile");
  const panel = own.page.getByTestId("active-minutes-panel");
  await expect(panel).toContainText("25 minutes of moderate activity", SEEN);
  await expect(panel).toContainText("You noted this");
  await expect(panel.getByTestId("active-minutes-chart")).toBeVisible();
  await expect(panel.getByRole("button", { name: /^Confirm/ })).toHaveCount(0);
  await own.context.close();

  const treating = await pageAs(browser, QA_EMAILS.therapistA, `/therapist/dashboard/health-profile/${cardio!.id}`);
  const waiting = treating.page.getByTestId("diary-awaiting");
  await expect(waiting).toContainText("25 minutes of moderate activity", SEEN);
  await waiting.getByRole("button", { name: /^Confirm/ }).first().click();
  await expect(treating.page.getByTestId("diary-awaiting")).toHaveCount(0, SEEN);
  await treating.context.close();
});

test("GP-006: both pages scroll only downwards at 360, 834 and 1280 wide", async ({ browser }) => {
  test.setTimeout(240_000);
  for (const [email, path] of [
    [geri!.email, "/patient/dashboard/health-profile"],
    [cardio!.email, "/patient/dashboard/health-profile"],
    [QA_EMAILS.therapistA, `/therapist/dashboard/health-profile/${geri!.id}`],
    [QA_EMAILS.therapistA, `/therapist/dashboard/health-profile/${cardio!.id}`],
  ] as const) {
    for (const width of [360, 834, 1280]) {
      const { page, context } = await pageAs(browser, email, path, { width, height: 900 });
      await expect(page.getByTestId(/^(geriatric|cardio)-profile$/)).toBeVisible(SEEN);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} at ${width}`).toBeLessThanOrEqual(0);
      await context.close();
    }
  }
});
