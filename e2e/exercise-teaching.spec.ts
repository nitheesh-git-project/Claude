// HOME EXERCISES taught live in the guided video session (Health Profile
// redesign, phase 7d-1: the server side). Driven at the API, with the rows
// and the RLS beneath them asserted: /api/therapist/exercise-plans/publish
// and /api/therapist/assessment-runs/teach, plus the Home exercises step's
// Save and next on the event route and the draft the end route returns. The
// cockpit's teaching screen and the patient's plan card are phase 7d-2.
//
// Fixtures: two throwaway patients of their own, each recorded as Strength
// and balance care with one completed video session with QA Therapist A --
// "Teach" (two or more falls on file, so the harder balance exercises are
// ruled out) and "Other" (only to prove one patient cannot read another's
// plan). QA Therapist B has no relationship to either.
//
// exercise_plan_items, exercise_teaching_events and assessment_run_events
// are append-only and plans and runs are never deleted (triggers), so the
// rows this writes stay -- disposable projects only. For the same reason the
// fixture accounts cannot be deleted afterwards; the cleanup says so rather
// than failing the run.
//
// WRITTEN, NOT RUN in the phase that added it (no test project was reachable);
// ET-008 and the correction_needs_mark case in ET-006 (phase 7d-3, correcting
// a mark) likewise.
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
  "writes append-only plan items, teaching events and run events; set E2E_ALLOW_APPEND_ONLY_WRITES=1 on a disposable project"
);

test.describe.configure({ mode: "serial" });

const MARKER = "E2E exercise teaching";
const db = adminClient();
let teach: { id: string; email: string; name: string } | undefined;
let other: { id: string; email: string; name: string } | undefined;
let therapistAId = "";
let runId = "";
let firstPlanId = "";
let planId = "";

const GERI_RED_FLAGS = ["chest_pain_or_breathless", "dizzy_today", "fall_since_last", "unwell_or_fever", "new_pain_walking"];
const allNo = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, false]));

async function post(request: APIRequestContext, path: string, email: string, data: unknown) {
  return request.post(`${BASE}${path}`, {
    headers: { cookie: await cookieHeaderFor(email), "content-type": "application/json" },
    data,
  });
}

const publish = (request: APIRequestContext, data: unknown, email: string = QA_EMAILS.therapistA) =>
  post(request, "/api/therapist/exercise-plans/publish", email, data);
const teachCall = (request: APIRequestContext, data: unknown, email: string = QA_EMAILS.therapistA) =>
  post(request, "/api/therapist/assessment-runs/teach", email, data);
const event = (request: APIRequestContext, stepId: string, kind: string, details?: unknown) =>
  post(request, "/api/therapist/assessment-runs/event", QA_EMAILS.therapistA, { runId, stepId, kind, details });

test.beforeAll(async () => {
  therapistAId = await profileIdFor(db, QA_EMAILS.therapistA);
  teach = await createFixtureAccount("Exercise Teach");
  other = await createFixtureAccount("Exercise Other");
  for (const [patient, data] of [
    [teach, { geri_falls_12m: "Two or more falls", geri_unsteady: "Yes", geri_fall_worry: "Yes" }],
    [other, { geri_falls_12m: "No falls" }],
  ] as const) {
    const { error } = await db.from("patient_condition_profiles").insert({ patient_id: patient.id, specialty: "geriatric", status: "active", data });
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
  await deleteFixtureAccount(teach?.id);
  await deleteFixtureAccount(other?.id);
});

test("ET-001: the treating therapist publishes a plan; the patient reads their own and not another's", async ({ request }) => {
  const res = await publish(request, {
    patientId: teach!.id,
    items: [{ exerciseKey: "sit_to_stand", dose: { reps: 8 } }, { exerciseKey: "heel_raise", dose: { note: "Hold the kitchen counter." } }],
  });
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  expect(body.plan.version).toBe(1);
  expect(body.items.map((i: { exerciseKey: string }) => i.exerciseKey)).toEqual(["sit_to_stand", "heel_raise"]);
  expect(body.items[0].doseText).toBe("2 sets of 8. Once a day, 5 days a week.");
  firstPlanId = body.plan.id;

  const own = await rlsClientFor(teach!.email);
  const { data: plans } = await own.from("exercise_plans").select("id, version, status").eq("patient_id", teach!.id);
  expect(plans).toEqual([{ id: firstPlanId, version: 1, status: "active" }]);
  const { data: items } = await own.from("exercise_plan_items").select("exercise_key, dose, sort_order").eq("plan_id", firstPlanId).order("sort_order");
  expect(items?.map((i) => i.exercise_key)).toEqual(["sit_to_stand", "heel_raise"]);
  expect(items?.[1].dose).toMatchObject({ note: "Hold the kitchen counter." });

  const stranger = await rlsClientFor(other!.email);
  const { data: theirs } = await stranger.from("exercise_plans").select("id").eq("patient_id", teach!.id);
  expect(theirs ?? []).toHaveLength(0);
  const { data: theirItems } = await stranger.from("exercise_plan_items").select("id").eq("plan_id", firstPlanId);
  expect(theirItems ?? []).toHaveLength(0);

  // Items are append-only, the service role included.
  const { error } = await db.from("exercise_plan_items").update({ sort_order: 9 }).eq("plan_id", firstPlanId);
  expect(error).not.toBeNull();
});

test("ET-002: an unassigned therapist is refused (403) and reads nothing", async ({ request }) => {
  const res = await publish(request, { patientId: teach!.id, items: [{ exerciseKey: "sit_to_stand" }] }, QA_EMAILS.therapistB);
  expect(res.status()).toBe(403);
  const outsider = await rlsClientFor(QA_EMAILS.therapistB);
  const { data } = await outsider.from("exercise_plans").select("id").eq("patient_id", teach!.id);
  expect(data ?? []).toHaveLength(0);
});

test("ET-003: the library, the profile kind, the intake and the helper rule are the server's (409)", async ({ request }) => {
  const code = async (items: unknown) => {
    const res = await publish(request, { patientId: teach!.id, items });
    return { status: res.status(), code: (await res.json()).code };
  };
  expect(await code([{ exerciseKey: "not_in_library" }])).toEqual({ status: 400, code: "unknown_exercise" });
  expect(await code([{ exerciseKey: "big_steps" }])).toEqual({ status: 409, code: "exercise_not_for_profile" });
  // Two or more falls on file rule out standing on one leg.
  expect(await code([{ exerciseKey: "one_leg_stand" }])).toEqual({ status: 409, code: "contraindicated" });
  // A helper exercise outside a run.
  expect(await code([{ exerciseKey: "heel_to_toe_stand" }])).toEqual({ status: 409, code: "helper_needs_run" });
  expect(await code([{ exerciseKey: "sit_to_stand", dose: { reps: 99 } }])).toEqual({ status: 400, code: "bad_dose" });
});

test("ET-004: teaching happens only inside a run in progress (404 / 409)", async ({ request }) => {
  const noRun = await teachCall(request, { runId: "00000000-0000-4000-8000-000000000000", exerciseKey: "sit_to_stand", phase: "demo" });
  expect(noRun.status()).toBe(404);

  const start = await post(request, "/api/therapist/assessment-runs/start", QA_EMAILS.therapistA, { patientId: teach!.id });
  expect(start.status(), await start.text()).toBe(200);
  runId = (await start.json()).run.id;

  const early = await teachCall(request, { runId, exerciseKey: "sit_to_stand", phase: "demo" });
  expect(early.status()).toBe(409);
  expect((await early.json()).code).toBe("red_flags_unanswered");

  const outsider = await teachCall(request, { runId, exerciseKey: "sit_to_stand", phase: "demo" }, QA_EMAILS.therapistB);
  expect(outsider.status()).toBe(403);

  expect((await event(request, "safety", "setup_confirmed", { items: ["clear_space", "someone_home"] })).status()).toBe(200);
  const answered = await event(request, "safety", "safety_confirmed", { answers: allNo(GERI_RED_FLAGS) });
  expect(answered.status(), await answered.text()).toBe(200);
});

test("ET-005: a helper exercise is refused until the step's helper is ticked; a new version replaces the old", async ({ request }) => {
  const items = [{ exerciseKey: "sit_to_stand" }, { exerciseKey: "heel_to_toe_stand" }];
  const noHelper = await publish(request, { runId, items });
  expect(noHelper.status()).toBe(409);
  expect((await noHelper.json()).code).toBe("helper_not_confirmed");

  // The step's set-up without its optional helper is accepted, but does not
  // unlock a helper exercise; with the helper ticked it does.
  expect((await event(request, "exercises", "setup_confirmed", { items: ["whole_body_in_view", "clear_space"] })).status()).toBe(200);
  expect((await publish(request, { runId, items })).status()).toBe(409);
  expect((await event(request, "exercises", "setup_confirmed", { items: ["whole_body_in_view", "clear_space", "helper_beside"] })).status()).toBe(200);
  const res = await publish(request, { runId, items });
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  expect(body.plan.version).toBe(2);
  planId = body.plan.id;

  const { data: rows } = await db.from("exercise_plans").select("id, status, replaced_at, run_id").eq("patient_id", teach!.id).order("version");
  expect(rows?.map((r) => r.status)).toEqual(["replaced", "active"]);
  expect(rows?.[0].replaced_at).not.toBeNull();
  expect(rows?.[1].run_id).toBe(runId);
  // The patient reads only the active version.
  const own = await rlsClientFor(teach!.email);
  const { data: visible } = await own.from("exercise_plans").select("id").eq("patient_id", teach!.id);
  expect(visible?.map((p) => p.id)).toEqual([planId]);
});

test("ET-006: the demo is the library's own; each exercise is marked once; Save and next waits for every mark", async ({ request }) => {
  const demo = await teachCall(request, { runId, exerciseKey: "sit_to_stand", phase: "demo" });
  expect(demo.status(), await demo.text()).toBe(200);
  const view = (await demo.json()).display;
  expect(view.phase).toBe("demo");
  expect(view.text).toMatchObject({ title: "Sit to stand", exercise: { key: "sit_to_stand", picture: "sit_to_stand", counter: "Exercise 1 of 2" } });

  // Text in the request is refused: the words are the library's.
  const text = await teachCall(request, { runId, exerciseKey: "sit_to_stand", phase: "demo", line: "Do 50 of these" });
  expect(text.status()).toBe(400);
  // A heel-raise demo: not in this version of the plan.
  const notInPlan = await teachCall(request, { runId, exerciseKey: "heel_raise", phase: "demo" });
  expect(notInPlan.status()).toBe(409);
  expect((await notInPlan.json()).code).toBe("not_in_plan");

  const own = await rlsClientFor(teach!.email);
  const { data: display } = await own.from("assessment_live_display").select("phase, display").eq("run_id", runId);
  expect(display?.[0].phase).toBe("demo");
  expect(Object.keys(display![0].display.exercise).sort()).toEqual(["counter", "key", "picture", "steps"]);

  const early = await event(request, "exercises", "saved");
  expect(early.status()).toBe(409);
  expect((await early.json()).code).toBe("exercises_not_marked");

  const mark = await teachCall(request, { runId, exerciseKey: "sit_to_stand", outcome: "needs_practice", cueKey: "slow_down" });
  expect(mark.status(), await mark.text()).toBe(200);
  const again = await teachCall(request, { runId, exerciseKey: "sit_to_stand", outcome: "needs_practice", cueKey: "slow_down" });
  expect((await again.json()).duplicate).toBe(true);
  const changed = await teachCall(request, { runId, exerciseKey: "sit_to_stand", outcome: "performed_correctly" });
  expect(changed.status()).toBe(409);
  expect((await changed.json()).code).toBe("already_marked");
  const noCue = await teachCall(request, { runId, exerciseKey: "heel_to_toe_stand", outcome: "needs_practice" });
  expect(noCue.status()).toBe(400);

  // A fix needs an earlier mark in this run (phase 7d-3).
  const noMark = await teachCall(request, {
    runId,
    exerciseKey: "heel_to_toe_stand",
    correct: { outcome: "performed_correctly", correctionReason: "wrong_button" },
  });
  expect(noMark.status()).toBe(409);
  expect((await noMark.json()).code).toBe("correction_needs_mark");

  const tandem = await teachCall(request, { runId, exerciseKey: "heel_to_toe_stand", outcome: "performed_correctly" });
  expect(tandem.status(), await tandem.text()).toBe(200);
  expect((await tandem.json()).event.helperPresent).toBe(true);

  // The patient reads their own marks (fixed-list keys only).
  const { data: marks } = await own.from("exercise_teaching_events").select("exercise_key, outcome, cue_key").eq("plan_id", planId).order("created_at");
  expect(marks).toEqual([
    { exercise_key: "sit_to_stand", outcome: "needs_practice", cue_key: "slow_down" },
    { exercise_key: "heel_to_toe_stand", outcome: "performed_correctly", cue_key: null },
  ]);
  const stranger = await rlsClientFor(other!.email);
  const { data: none } = await stranger.from("exercise_teaching_events").select("id").eq("plan_id", planId);
  expect(none ?? []).toHaveLength(0);
  // Append-only, the service role included.
  const { error } = await db.from("exercise_teaching_events").update({ outcome: "performed_correctly", cue_key: null }).eq("plan_id", planId);
  expect(error).not.toBeNull();

  const saved = await event(request, "exercises", "saved");
  expect(saved.status(), await saved.text()).toBe(200);
});

test("ET-008: a mistaken mark is fixed as a new record; the original stays; the patient sees only the latest", async ({ request }) => {
  const noReason = await teachCall(request, { runId, exerciseKey: "sit_to_stand", correct: { outcome: "needs_practice", cueKey: "hold_support" } });
  expect(noReason.status()).toBe(400);
  expect((await noReason.json()).code).toBe("bad_correction_reason");
  const freeText = await teachCall(request, {
    runId,
    exerciseKey: "sit_to_stand",
    correct: { outcome: "needs_practice", cueKey: "hold_support", correctionReason: "wrong_button", note: "I misclicked" },
  });
  expect(freeText.status()).toBe(400);

  const { data: before } = await db.from("exercise_teaching_events").select("id").eq("run_id", runId).eq("exercise_key", "sit_to_stand");
  expect(before).toHaveLength(1);
  const fix = await teachCall(request, {
    runId,
    exerciseKey: "sit_to_stand",
    correct: { outcome: "needs_practice", cueKey: "hold_support", correctionReason: "wrong_button" },
  });
  expect(fix.status(), await fix.text()).toBe(200);
  const fixed = (await fix.json()).event;
  expect(fixed).toMatchObject({ kind: "correction", correctsEventId: before![0].id, correctionReason: "wrong_button", cueKey: "hold_support" });
  // A retry writes nothing new.
  const again = await teachCall(request, {
    runId,
    exerciseKey: "sit_to_stand",
    correct: { outcome: "needs_practice", cueKey: "hold_support", correctionReason: "wrong_button" },
  });
  expect((await again.json()).duplicate).toBe(true);
  // A plain different mark is still already_marked.
  const plain = await teachCall(request, { runId, exerciseKey: "sit_to_stand", outcome: "performed_correctly" });
  expect((await plain.json()).code).toBe("already_marked");

  // The original stays, the fix is after it, and neither can be rewritten.
  const { data: rows } = await db
    .from("exercise_teaching_events")
    .select("id, kind, corrects_event_id, correction_reason, cue_key")
    .eq("run_id", runId)
    .eq("exercise_key", "sit_to_stand")
    .order("created_at");
  expect(rows?.map((r) => [r.kind, r.cue_key])).toEqual([
    ["mark", "slow_down"],
    ["correction", "hold_support"],
  ]);
  const { error } = await db.from("exercise_teaching_events").delete().eq("id", fixed.id);
  expect(error).not.toBeNull();

  // The patient's own client reads the original columns only -- never the reason or that it was a fix.
  const own = await rlsClientFor(teach!.email);
  const { error: hidden } = await own.from("exercise_teaching_events").select("correction_reason").eq("plan_id", planId);
  expect(hidden).not.toBeNull();
  const { error: hiddenKind } = await own.from("exercise_teaching_events").select("kind").eq("plan_id", planId);
  expect(hiddenKind).not.toBeNull();
  // Their plan card shows the latest cue, not the mistaken one, and no word of a fix.
  const page = await request.get(`${BASE}/patient/dashboard/health-profile`, { headers: { cookie: await cookieHeaderFor(teach!.email) } });
  expect(page.status()).toBe(200);
  const html = await page.text();
  expect(html).toContain("Keep a hand on the support.");
  expect(html).not.toContain("Go slower and keep it smooth.");
  expect(html).not.toMatch(/wrong button|Fix this mark|corrected/i);
});

test("ET-007: the end's draft says what was taught; nothing is taught after the end", async ({ request }) => {
  const end = await post(request, "/api/therapist/assessment-runs/end", QA_EMAILS.therapistA, { runId, outcome: "completed" });
  expect(end.status(), await end.text()).toBe(200);
  const body = await end.json();
  expect(body.summaryDraft).toContain("We practised 2 home exercises together");
  expect(body.summaryDraft).toContain("sit to stand needs more practice");

  const late = await teachCall(request, { runId, exerciseKey: "sit_to_stand", phase: "demo" });
  expect(late.status()).toBe(409);
  expect((await late.json()).code).toBe("run_not_in_progress");
});
