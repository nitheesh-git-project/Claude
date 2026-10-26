// Strength and balance care and Heart and lung rehabilitation (Health
// Profile redesign, phase 6a: the server side; the screens are phase 6b).
// Triage offers the two new condition types only once an admin has switched
// them on - they start off - and suggests them with the reason shown; the
// onboarding route refuses a switched-off one and stores the new intake sets
// (geri_* / cardio_*, schema_version 1, the conditional follow-ups); the
// diary keeps the kinds each profile kind offers; the vitals are recorded
// through the shared measurement route, both numbers of a blood pressure
// kept; and the PDF export is complete for both.
//
// What this does not drive, and where it is covered instead: the fall-risk
// level and its rule, the oxygen stop limit and the red-flag wording are
// pure modules, unit-tested in src/lib/geriatricRisk.test.ts,
// cardioSafety.test.ts and geriatricCardioProfile.test.ts (the profile
// screens that print them are 6b); "no exam before Done" is
// sessionCompletion.test.ts.
//
// Fixtures: two throwaway patients, each with one completed session with QA
// Therapist A. The diary entries and the measurements are append-only, so
// they stay - disposable projects only. The setting is restored afterwards.
import { test, expect, type APIRequestContext, type Browser, type Locator } from "@playwright/test";
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
  "writes append-only diary entries and measurements; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);

test.describe.configure({ mode: "serial" });

const MARKER = "E2E geriatric cardio intake";
const SEEN = { timeout: 60_000 };
const db = adminClient();
let geri: { id: string; email: string; name: string } | undefined;
let cardio: { id: string; email: string; name: string } | undefined;
let therapistAId = "";
let settingBefore: unknown = null;

const GERI_ANSWERS = {
  geri_carer_name: "Ramesh",
  geri_carer_relationship: "Son",
  geri_concern: "E2E: three falls this year, nervous on the stairs",
  geri_falls_12m: "Two or more falls",
  geri_unsteady: "Yes",
  geri_fall_worry: "Yes",
  geri_walking_aid: "A walking stick",
  geri_daily_help: "Bathing or washing",
  geri_goal: "Walk to my daughter's house on my own",
};

const OPEN_HEART = "Heart bypass or valve surgery (open-heart)";
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

function minutesAgo(n: number) {
  return new Date(Date.now() - n * 60_000).toISOString();
}

async function post(request: APIRequestContext, path: string, email: string | null, data: unknown) {
  return request.post(`${BASE}${path}`, {
    headers: { ...(email ? { cookie: await cookieHeaderFor(email) } : {}), "content-type": "application/json" },
    data,
  });
}

async function setEnabled(value: string[]) {
  const { error } = await db.from("site_settings").update({ enabled_intake_specialties: value }).eq("id", true);
  expect(error).toBeNull();
}

async function pageAs(browser: Browser, email: string, path: string) {
  const context = await browser.newContext();
  await context.addCookies(await browserCookiesFor(email));
  const page = await context.newPage();
  await page.goto(`${BASE}${path}`);
  return { context, page };
}

test.beforeAll(async () => {
  therapistAId = await profileIdFor(db, QA_EMAILS.therapistA);
  const { data } = await db.from("site_settings").select("enabled_intake_specialties").eq("id", true).maybeSingle();
  settingBefore = data?.enabled_intake_specialties ?? null;
  geri = await createFixtureAccount("Geriatric Intake");
  cardio = await createFixtureAccount("Cardio Intake");
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
});

test.afterAll(async () => {
  await db
    .from("site_settings")
    .update({ enabled_intake_specialties: settingBefore ?? ["ortho", "neuro", "pediatrics"] })
    .eq("id", true);
  await deleteFixtureAccount(geri?.id);
  await deleteFixtureAccount(cardio?.id);
});

test("GC-001: a switched-off new type is refused at onboarding; switched on, its intake set is stored", async ({ request }) => {
  const onboard = (patientId: string, specialty: string, data: Record<string, string>, triageData: Record<string, string>) =>
    post(request, "/api/therapist/condition-profile/onboard", QA_EMAILS.therapistA, { patientId, specialty, data, triageData });
  const geriTriage = { age_band: "65 or older", presenting_problem: "Falls, unsteadiness or getting weaker with age" };
  const cardioTriage = { age_band: "18 to 64", presenting_problem: "A heart or lung condition, or after heart surgery or a heart attack" };

  // Off by default: the original three.
  await setEnabled(["ortho", "neuro", "pediatrics"]);
  const off = await onboard(geri!.id, "geriatric", GERI_ANSWERS, geriTriage);
  expect(off.status()).toBe(400);
  expect((await off.json()).error).toMatch(/switched off/i);

  await setEnabled(["ortho", "neuro", "pediatrics", "geriatric", "cardiopulmonary"]);

  // The three STEADI questions are required; the carer pre-step is not.
  const missing = await onboard(geri!.id, "geriatric", { ...GERI_ANSWERS, geri_falls_12m: "" }, geriTriage);
  expect(missing.status(), await missing.text()).toBe(400);
  const withoutCarer = Object.fromEntries(Object.entries(GERI_ANSWERS).filter(([k]) => !k.startsWith("geri_carer_")));
  const noCarer = await onboard(geri!.id, "geriatric", withoutCarer, geriTriage);
  expect(noCarer.status(), await noCarer.text()).toBe(200);
  const ok = await onboard(geri!.id, "geriatric", GERI_ANSWERS, geriTriage);
  expect(ok.status(), await ok.text()).toBe(200);
  const { data: geriRow } = await db.from("patient_condition_profiles").select("specialty, schema_version, status, data").eq("patient_id", geri!.id).single();
  expect(geriRow).toMatchObject({ specialty: "geriatric", schema_version: 1, status: "active" });
  expect(geriRow!.data).toMatchObject({ geri_falls_12m: "Two or more falls", geri_carer_name: "Ramesh" });

  // A key another set owns is refused for this one.
  const foreign = await onboard(cardio!.id, "cardiopulmonary", { ...CARDIO_ANSWERS, geri_concern: "x" }, cardioTriage);
  expect(foreign.status()).toBe(400);
  const cardioOk = await onboard(cardio!.id, "cardiopulmonary", CARDIO_ANSWERS, cardioTriage);
  expect(cardioOk.status(), await cardioOk.text()).toBe(200);
  const { data: cardioRow } = await db.from("patient_condition_profiles").select("specialty, schema_version, data").eq("patient_id", cardio!.id).single();
  expect(cardioRow).toMatchObject({ specialty: "cardiopulmonary", schema_version: 1 });
  expect(cardioRow!.data).toMatchObject({ cardio_sternal_precautions_until: "20 Nov 2026", cardio_beta_blocker: "Yes" });

  // Re-triaging an existing record is still offered its own type once it is switched off.
  await setEnabled(["ortho"]);
  const again = await onboard(geri!.id, "geriatric", { ...GERI_ANSWERS, geri_goal: "Manage the stairs" }, geriTriage);
  expect(again.status(), await again.text()).toBe(200);
});

test("GC-002: triage offers Geriatric only when it is switched on, and suggests it with the reason", async ({ browser }) => {
  test.setTimeout(240_000);
  const answer = async (dialog: Locator) => {
    await dialog.getByRole("button", { name: "65 or older", exact: true }).click();
    await dialog.getByRole("button", { name: "Falls, unsteadiness or getting weaker with age", exact: true }).click();
  };

  await setEnabled(["ortho", "neuro", "pediatrics"]);
  const offRun = await pageAs(browser, QA_EMAILS.therapistA, `/therapist/dashboard/health-profile/${cardio!.id}`);
  await offRun.page.getByRole("button", { name: "Change condition type" }).click(SEEN);
  const offDialog = offRun.page.getByRole("dialog", { name: /Which condition type is this/ });
  await expect(offDialog).toBeVisible(SEEN);
  await answer(offDialog);
  await expect(offDialog.getByRole("button", { name: /^Geriatric/ })).toHaveCount(0);
  // The profile's own type stays offered even though it is switched off.
  await expect(offDialog.getByRole("button", { name: /^Cardiopulmonary/ })).toBeVisible();
  await expect(offDialog).toContainText("Geriatric would fit, but it is switched off in Settings.");
  await offRun.context.close();

  await setEnabled(["ortho", "neuro", "pediatrics", "geriatric", "cardiopulmonary"]);
  const onRun = await pageAs(browser, QA_EMAILS.therapistA, `/therapist/dashboard/health-profile/${cardio!.id}`);
  await onRun.page.getByRole("button", { name: "Change condition type" }).click(SEEN);
  const onDialog = onRun.page.getByRole("dialog", { name: /Which condition type is this/ });
  await expect(onDialog).toBeVisible(SEEN);
  await answer(onDialog);
  await expect(onDialog.getByRole("button", { name: /^Geriatric/ })).toBeVisible();
  await expect(onDialog).toContainText("Suggested: Geriatric");
  await expect(onDialog).toContainText("Aged 65 or older and referred for falls, unsteadiness or getting weaker.");
  // Suggested is pre-selected, never accepted: nothing is saved by answering.
  const { data: still } = await db.from("patient_condition_profiles").select("specialty").eq("patient_id", cardio!.id).single();
  expect(still!.specialty).toBe("cardiopulmonary");
  await onRun.context.close();
});

test("GC-003: the diary keeps falls for Strength and balance care and active minutes for Heart and lung rehabilitation", async ({ request }) => {
  const path = "/api/patient/diary/add";
  const fall = { kind: "fall", occurredAt: minutesAgo(120), details: { injured: false, gotUpAlone: true } };
  const active = { kind: "active_minutes", occurredAt: minutesAgo(60), details: { minutes: 40, intensity: "moderate" } };

  const geriFall = await post(request, path, geri!.email, fall);
  expect(geriFall.status(), await geriFall.text()).toBe(200);
  expect((await geriFall.json()).entry).toMatchObject({ kind: "fall", enteredByRole: "patient", confirmedAt: null });
  expect((await post(request, path, geri!.email, { kind: "near_miss", occurredAt: minutesAgo(90) })).status()).toBe(200);
  const geriActive = await post(request, path, geri!.email, active);
  expect(geriActive.status()).toBe(400);
  expect((await geriActive.json()).code).toBe("diary_kind_not_offered");

  const cardioActive = await post(request, path, cardio!.email, active);
  expect(cardioActive.status(), await cardioActive.text()).toBe(200);
  const cardioFall = await post(request, path, cardio!.email, fall);
  expect(cardioFall.status()).toBe(400);
  expect((await cardioFall.json()).code).toBe("diary_kind_not_offered");
});

test("GC-004: the vitals are recorded at the shared route, both numbers kept, and the export is complete for both types", async ({ request }) => {
  const record = (measurement: Record<string, unknown>) =>
    post(request, "/api/therapist/measurements/submit", QA_EMAILS.therapistA, { patientId: cardio!.id, measurement });
  const conditions = { setting: "in_person" };

  // A blood pressure over 180/100 is stored as measured (the refusal to
  // exercise is the profile's job, 6b); its two numbers travel together.
  const high = await record({ measureKey: "blood_pressure", variant: "rest", value: 190, items: { systolic: 190, diastolic: 105 }, measuredAt: minutesAgo(15), conditions });
  expect(high.status(), await high.text()).toBe(200);
  expect((await high.json()).measurement).toMatchObject({ measureKey: "blood_pressure", variant: "rest", value: 190, items: { systolic: 190, diastolic: 105 } });
  const upsideDown = await record({ measureKey: "blood_pressure", variant: "rest", value: 120, items: { systolic: 120, diastolic: 130 }, measuredAt: minutesAgo(14), conditions });
  expect(upsideDown.status()).toBe(400);
  expect((await record({ measureKey: "resting_heart_rate", value: 128, measuredAt: minutesAgo(13), conditions })).status()).toBe(200);
  expect((await record({ measureKey: "resting_spo2", value: 89, measuredAt: minutesAgo(12), conditions })).status()).toBe(200);
  expect((await record({ measureKey: "talk_test", value: 1, measuredAt: minutesAgo(11), conditions })).status()).toBe(200);
  expect((await record({ measureKey: "talk_test", value: 3, measuredAt: minutesAgo(10), conditions })).status()).toBe(400);
  // The licensed Borg scale stays off.
  expect((await record({ measureKey: "borg_cr10", value: 3, measuredAt: minutesAgo(9), conditions })).status()).toBe(400);

  for (const patient of [geri!, cardio!]) {
    const pdf = await request.get(`${BASE}/api/patient/condition-profile/export`, { headers: { cookie: await cookieHeaderFor(patient.email) } });
    expect(pdf.status(), patient.email).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
  }
  const json = await request.get(`${BASE}/api/patient/condition-profile/export?format=json`, { headers: { cookie: await cookieHeaderFor(cardio!.email) } });
  const payload = await json.json();
  expect(payload.specialty).toBe("cardiopulmonary");
  expect(payload.outcome_measurements.some((m: { measure_key: string }) => m.measure_key === "blood_pressure")).toBe(true);
});
