// The guided video assessment's server side (Health Profile redesign, phase
// 7a): the run routes under /api/therapist/assessment-runs/ and the
// measurement route's run gate, driven at the API with the rows and the RLS
// beneath them asserted. No screen draws the cockpit or the companion yet
// (phases 7b and 7c).
//
// Fixtures: two throwaway patients of their own -- an orthopaedic one (the
// knee protocol) and a heart and lung one (the pre-exercise check) -- each
// with one completed video session with QA Therapist A. QA Therapist B has
// no relationship to either.
//
// assessment_run_events and outcome_measurements are append-only and a run
// is never deleted (triggers), so the rows this writes stay -- disposable
// projects only. For the same reason the fixture accounts cannot be deleted
// afterwards; the cleanup says so rather than failing the run.
//
// WRITTEN, NOT RUN in the phase that added it (no test project was reachable).
import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  BASE,
  QA_EMAILS,
  adminClient,
  cookieHeaderFor,
  createFixtureAccount,
  deleteFixtureAccount,
  insertPastFixtureAppointment,
  profileIdFor,
  rlsClientFor,
} from "./helpers";

test.skip(
  process.env.E2E_ALLOW_APPEND_ONLY_WRITES !== "1" && process.env.CI_LOCAL_STACK !== "1",
  "writes append-only run events and measurements; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);

test.describe.configure({ mode: "serial" });

const MARKER = "E2E assessment run";
const db = adminClient();
let knee: { id: string; email: string; name: string } | undefined;
let heart: { id: string; email: string; name: string } | undefined;
let therapistAId = "";
let kneeRunId = "";
let heartRunId = "";

const KNEE_RED_FLAGS = ["chest_pain_or_breathless", "unwell_or_fever", "knee_hot_swollen", "leg_numb_weak", "fall_since_last"];
const HEART_RED_FLAGS = ["chest_pain_new", "recent_heart_attack", "swelling_fever_weight", "dizzy_today", "more_breathless"];
const allNo = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, false]));

function minutesAgo(n: number) {
  return new Date(Date.now() - n * 60_000).toISOString();
}

async function post(request: APIRequestContext, path: string, email: string, data: unknown) {
  return request.post(`${BASE}${path}`, {
    headers: { cookie: await cookieHeaderFor(email), "content-type": "application/json" },
    data,
  });
}

const event = (request: APIRequestContext, runId: string, stepId: string, kind: string, details?: unknown, email: string = QA_EMAILS.therapistA) =>
  post(request, "/api/therapist/assessment-runs/event", email, { runId, stepId, kind, details });

const measure = (request: APIRequestContext, patientId: string, runId: string, stepId: string, measurement: unknown) =>
  post(request, "/api/therapist/measurements/submit", QA_EMAILS.therapistA, { patientId, runId, stepId, measurement });

test.beforeAll(async () => {
  therapistAId = await profileIdFor(db, QA_EMAILS.therapistA);
  knee = await createFixtureAccount("Assessment Run Knee");
  heart = await createFixtureAccount("Assessment Run Heart");
  for (const [patient, specialty, data] of [
    [knee, "ortho", { pain_location: "Right knee" }],
    [heart, "cardiopulmonary", { cardio_condition: "Heart failure", cardio_beta_blocker: "No" }],
  ] as const) {
    const { error } = await db.from("patient_condition_profiles").insert({ patient_id: patient.id, specialty, status: "active", data });
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
  }
});

test.afterAll(async () => {
  await deleteFixtureAccount(knee?.id);
  await deleteFixtureAccount(heart?.id);
});

test("AR-001: the treating therapist starts the knee protocol; a second start answers with the open run", async ({ request }) => {
  const res = await post(request, "/api/therapist/assessment-runs/start", QA_EMAILS.therapistA, { patientId: knee!.id });
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  expect(body.run).toMatchObject({ protocolKey: "ortho_knee", profileKind: "ortho", status: "in_progress", therapistId: therapistAId });
  kneeRunId = body.run.id;

  const again = await post(request, "/api/therapist/assessment-runs/start", QA_EMAILS.therapistA, { patientId: knee!.id });
  expect(again.status()).toBe(409);
  expect(await again.json()).toMatchObject({ code: "run_in_progress", runId: kneeRunId, yours: true });

  // A protocol from another condition type is refused.
  const wrong = await post(request, "/api/therapist/assessment-runs/start", QA_EMAILS.therapistA, { patientId: heart!.id, protocolKey: "ortho_knee" });
  expect(wrong.status()).toBe(400);
});

test("AR-002: an unassigned therapist is refused at every door and reads nothing", async ({ request }) => {
  const start = await post(request, "/api/therapist/assessment-runs/start", QA_EMAILS.therapistB, { patientId: knee!.id });
  expect(start.status()).toBe(403);
  const ev = await event(request, kneeRunId, "safety", "step_opened", {}, QA_EMAILS.therapistB);
  expect(ev.status()).toBe(403);
  const display = await post(request, "/api/therapist/assessment-runs/display", QA_EMAILS.therapistB, { runId: kneeRunId, stepId: "safety", phase: "ready" });
  expect(display.status()).toBe(403);
  // Abandoning asks only "the run's own physiotherapist, or assigned to the
  // patient now" -- and an unassigned colleague is neither.
  const abandon = await post(request, "/api/therapist/assessment-runs/end", QA_EMAILS.therapistB, { runId: kneeRunId, outcome: "abandoned", reason: "other" });
  expect(abandon.status()).toBe(403);
  expect((await abandon.json()).code).toBe("run_not_yours");
  const outsider = await rlsClientFor(QA_EMAILS.therapistB);
  const { data: runs } = await outsider.from("assessment_runs").select("id").eq("id", kneeRunId);
  expect(runs ?? []).toHaveLength(0);
  const { data: events } = await outsider.from("assessment_run_events").select("id").eq("run_id", kneeRunId);
  expect(events ?? []).toHaveLength(0);
});

test("AR-003: nothing after step 1 until the red flags are answered, and set-up before a save (409)", async ({ request }) => {
  const early = await event(request, kneeRunId, "function", "setup_confirmed", { items: ["can_hear"] });
  expect(early.status()).toBe(409);
  expect((await early.json()).code).toBe("red_flags_unanswered");

  expect((await event(request, kneeRunId, "safety", "setup_confirmed", { items: ["clear_space", "sturdy_chair", "camera_side_on"] })).status()).toBe(200);
  const partial = await event(request, kneeRunId, "safety", "safety_confirmed", { answers: { chest_pain_or_breathless: false } });
  expect(partial.status()).toBe(409);
  expect((await partial.json()).code).toBe("red_flags_unanswered");
  const answered = await event(request, kneeRunId, "safety", "safety_confirmed", { answers: allNo(KNEE_RED_FLAGS) });
  expect(answered.status(), await answered.text()).toBe(200);
  expect((await answered.json()).flagged).toEqual([]);

  // LEFS saved in the Function step before its set-up was ticked.
  const noSetup = await measure(request, knee!.id, kneeRunId, "function", {
    measureKey: "lefs",
    value: 58,
    measuredAt: minutesAgo(1),
    conditions: { setting: "video" },
  });
  expect(noSetup.status()).toBe(409);
  expect((await noSetup.json()).code).toBe("setup_not_confirmed");

  expect((await event(request, kneeRunId, "function", "setup_confirmed", { items: ["can_hear"] })).status()).toBe(200);
  const saved = await measure(request, knee!.id, kneeRunId, "function", {
    measureKey: "lefs",
    value: 58,
    measuredAt: minutesAgo(1),
    conditions: { setting: "video" },
  });
  expect(saved.status(), await saved.text()).toBe(200);
  const savedBody = await saved.json();
  expect(savedBody.runEvent.recorded).toBe(true);
  const { data: link } = await db.from("assessment_run_events").select("kind, step_id").eq("measurement_id", savedBody.measurement.id);
  expect(link).toEqual([{ kind: "saved", step_id: "function" }]);

  // A measure the step does not record.
  const wrongStep = await measure(request, knee!.id, kneeRunId, "function", {
    measureKey: "koos12",
    value: 70,
    measuredAt: minutesAgo(1),
    conditions: { setting: "video" },
  });
  expect(wrongStep.status()).toBe(409);
  expect((await wrongStep.json()).code).toBe("measure_not_in_step");
});

test("AR-004: a helper step refuses a save without the helper confirmed (409)", async ({ request }) => {
  // The set-up list without the helper item is incomplete, so it is refused.
  const noHelper = await event(request, kneeRunId, "chair_stand", "setup_confirmed", { items: ["chair_against_wall", "arms_crossed"] });
  expect(noHelper.status()).toBe(409);
  expect((await noHelper.json()).code).toBe("setup_incomplete");
  // And so is the save: no set-up, no helper.
  const save = await measure(request, knee!.id, kneeRunId, "chair_stand", {
    measureKey: "chair_stand_30s",
    value: 9,
    measuredAt: minutesAgo(1),
    conditions: { setting: "video", helperPresent: true },
  });
  expect(save.status()).toBe(409);
  expect((await save.json()).code).toBe("setup_not_confirmed");

  expect(
    (await event(request, kneeRunId, "chair_stand", "setup_confirmed", { items: ["chair_against_wall", "arms_crossed", "helper_beside"] })).status()
  ).toBe(200);
  const noHelperInReading = await measure(request, knee!.id, kneeRunId, "chair_stand", {
    measureKey: "chair_stand_30s",
    value: 9,
    measuredAt: minutesAgo(1),
    conditions: { setting: "video" },
  });
  // The registry refuses a helper test over video without the helper (400)
  // before the run gate is reached; either way nothing is stored.
  expect([400, 409]).toContain(noHelperInReading.status());
});

test("AR-005: Stop test writes a stopped event and saves nothing", async ({ request }) => {
  const { count: before } = await db.from("outcome_measurements").select("id", { count: "exact", head: true }).eq("patient_id", knee!.id);
  const stop = await event(request, kneeRunId, "chair_stand", "stopped", { reason: "near_fall" });
  expect(stop.status(), await stop.text()).toBe(200);
  const { count: after } = await db.from("outcome_measurements").select("id", { count: "exact", head: true }).eq("patient_id", knee!.id);
  expect(after).toBe(before);
  const { data: stopped } = await db.from("assessment_run_events").select("kind, measurement_id, details").eq("run_id", kneeRunId).eq("kind", "stopped");
  expect(stopped).toEqual([{ kind: "stopped", measurement_id: null, details: { reason: "near_fall" } }]);
  // The event cannot be rewritten, the service role included.
  const { error } = await db.from("assessment_run_events").update({ details: {} }).eq("run_id", kneeRunId).eq("kind", "stopped");
  expect(error).not.toBeNull();
});

test("AR-006: the patient reads the live display -- patient-safe text only -- but not the run or its results", async ({ request }) => {
  const shown = await post(request, "/api/therapist/assessment-runs/display", QA_EMAILS.therapistA, {
    runId: kneeRunId,
    stepId: "chair_stand",
    phase: "go",
    startClock: true,
  });
  expect(shown.status(), await shown.text()).toBe(200);
  const view = (await shown.json()).display;
  expect(view.clock).toMatchObject({ mode: "countdown", seconds: 30 });

  // Text in the request is refused: the server picks the words.
  const text = await post(request, "/api/therapist/assessment-runs/display", QA_EMAILS.therapistA, {
    runId: kneeRunId,
    stepId: "chair_stand",
    phase: "go",
    line: "You did 9 stands",
  });
  expect(text.status()).toBe(400);

  const own = await rlsClientFor(knee!.email);
  const { data: display } = await own.from("assessment_live_display").select("current_step_id, phase, display").eq("run_id", kneeRunId);
  expect(display).toHaveLength(1);
  expect(display![0]).toMatchObject({ current_step_id: "chair_stand", phase: "go" });
  expect(Object.keys(display![0].display).sort()).toEqual(["clockLabel", "line", "picture", "progress", "title"]);
  expect(JSON.stringify(display![0].display)).not.toMatch(/58|stands done|LEFS/);
  // No policy lets the patient read the run or its events.
  const { data: runs } = await own.from("assessment_runs").select("id").eq("id", kneeRunId);
  expect(runs ?? []).toHaveLength(0);
  const { data: events } = await own.from("assessment_run_events").select("id").eq("run_id", kneeRunId);
  expect(events ?? []).toHaveLength(0);
});

test("AR-007: heart and lung exertion is refused until a clear pre-exercise check, and on a red flag (409)", async ({ request }) => {
  const start = await post(request, "/api/therapist/assessment-runs/start", QA_EMAILS.therapistA, { patientId: heart!.id });
  expect(start.status(), await start.text()).toBe(200);
  heartRunId = (await start.json()).run.id;
  expect((await event(request, heartRunId, "safety", "setup_confirmed", { items: ["clear_space", "devices_ready"] })).status()).toBe(200);
  expect((await event(request, heartRunId, "safety", "safety_confirmed", { answers: allNo(HEART_RED_FLAGS) })).status()).toBe(200);

  // No resting vitals yet: the sit-to-stand's set-up is refused.
  const early = await event(request, heartRunId, "sit_to_stand", "setup_confirmed", { items: ["chair_against_wall", "oximeter_on", "helper_beside"] });
  expect(early.status()).toBe(409);
  expect((await early.json()).code).toBe("cardio_check_not_recorded");

  // Resting vitals off the patient's own devices, with a heart rate over 120.
  expect((await event(request, heartRunId, "resting_check", "setup_confirmed", { items: ["rested_5_min", "device_in_view"] })).status()).toBe(200);
  const device = { setting: "video", homeMeasured: true, readFrom: "patient_device_on_video" };
  const unlabelled = await measure(request, heart!.id, heartRunId, "resting_check", {
    measureKey: "resting_heart_rate",
    value: 130,
    measuredAt: minutesAgo(1),
    conditions: { setting: "video", homeMeasured: true },
  });
  expect(unlabelled.status()).toBe(409);
  expect((await unlabelled.json()).code).toBe("read_from_required");
  for (const m of [
    { measureKey: "resting_heart_rate", value: 130, measuredAt: minutesAgo(1), conditions: device },
    { measureKey: "blood_pressure", variant: "rest", value: 130, items: { systolic: 130, diastolic: 80 }, measuredAt: minutesAgo(1), conditions: device },
    { measureKey: "resting_spo2", value: 96, measuredAt: minutesAgo(1), conditions: device },
  ]) {
    const r = await measure(request, heart!.id, heartRunId, "resting_check", m);
    expect(r.status(), await r.text()).toBe(200);
  }
  const check = await event(request, heartRunId, "resting_check", "safety_confirmed", {});
  expect(check.status()).toBe(200);
  expect((await check.json()).preExercise.status).toBe("stop");

  const refused = await event(request, heartRunId, "sit_to_stand", "setup_confirmed", { items: ["chair_against_wall", "oximeter_on", "helper_beside"] });
  expect(refused.status()).toBe(409);
  expect((await refused.json()).code).toBe("cardio_red_flag");
  const go = await post(request, "/api/therapist/assessment-runs/display", QA_EMAILS.therapistA, { runId: heartRunId, stepId: "sit_to_stand", phase: "go", startClock: true });
  expect(go.status()).toBe(409);
  const saved = await measure(request, heart!.id, heartRunId, "sit_to_stand", {
    measureKey: "one_minute_sit_to_stand",
    value: 14,
    measuredAt: minutesAgo(1),
    conditions: { setting: "video", helperPresent: true },
  });
  expect(saved.status()).toBe(409);
  expect((await saved.json()).code).toBe("cardio_red_flag");
});

test("AR-008: ending a run once, with the summary draft from what was saved; the admin has no door", async ({ request }) => {
  const asAdmin = await post(request, "/api/admin/measurements/submit", QA_EMAILS.admin, {
    patientId: knee!.id,
    runId: kneeRunId,
    stepId: "function",
    measurement: { measureKey: "lefs", value: 60, measuredAt: minutesAgo(1), conditions: { setting: "video" } },
  });
  expect(asAdmin.status()).toBe(400);
  expect((await asAdmin.json()).code).toBe("run_is_therapist_only");

  const noReason = await post(request, "/api/therapist/assessment-runs/end", QA_EMAILS.therapistA, { runId: heartRunId, outcome: "abandoned" });
  expect(noReason.status()).toBe(400);
  const abandoned = await post(request, "/api/therapist/assessment-runs/end", QA_EMAILS.therapistA, { runId: heartRunId, outcome: "abandoned", reason: "patient_unwell" });
  expect(abandoned.status(), await abandoned.text()).toBe(200);

  const ended = await post(request, "/api/therapist/assessment-runs/end", QA_EMAILS.therapistA, { runId: kneeRunId, outcome: "completed" });
  expect(ended.status(), await ended.text()).toBe(200);
  const body = await ended.json();
  expect(body.run.status).toBe("completed");
  expect(body.summaryDraft).toContain("58 out of 80");
  expect(body.summaryDraft).toMatch(/stopped sit to stand for 30 seconds before the end/);

  const twice = await post(request, "/api/therapist/assessment-runs/end", QA_EMAILS.therapistA, { runId: kneeRunId, outcome: "completed" });
  expect(twice.status()).toBe(409);
  const late = await event(request, kneeRunId, "walk", "step_opened");
  expect(late.status()).toBe(409);
  expect((await late.json()).code).toBe("run_not_in_progress");

  const own = await rlsClientFor(knee!.email);
  const { data: display } = await own.from("assessment_live_display").select("display, ended_at").eq("run_id", kneeRunId);
  expect(display![0].ended_at).not.toBeNull();
  expect(display![0].display.title).toBe("All done");
});
