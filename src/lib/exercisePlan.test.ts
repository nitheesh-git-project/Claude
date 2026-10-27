import { describe, expect, it } from "vitest";
import { exerciseByKey } from "@/lib/exerciseLibrary";
import { sessionProtocol, protocolStep } from "@/lib/sessionProtocols";
import { runStateFromEvents, type RunEvent } from "@/lib/assessmentRun";
import { CARDIO_CONDITION_OPEN_HEART } from "@/lib/intakeCardio";
import { GERI_FALLS_TWO_PLUS } from "@/lib/intakeGeriatric";
import {
  COACHING_CUES,
  EXERCISE_REFUSAL_TEXT,
  allExercisesMarked,
  checkTeachExercise,
  checkTeachStep,
  teachAction,
  contraFlagsFromIntake,
  doseText,
  exercisePlanView,
  homeExerciseNotePrefill,
  parsePlanItemRow,
  parsePlanRow,
  parseTeachingEventRow,
  planItemsJson,
  practisedLine,
  teachingSummarySentence,
  validateDose,
  validatePlanItems,
  validateTeachRequest,
  type ExercisePlan,
  type TeachingEvent,
} from "@/lib/exercisePlan";

const NOW = Date.parse("2026-10-27T10:00:00Z");
const ctx = { profileKind: "geriatric" as const, contraFlags: new Set<never>(), helper: "confirmed" as const };

function event(over: Partial<TeachingEvent>): TeachingEvent {
  return {
    id: "e1",
    runId: "run-1",
    planId: "plan-1",
    patientId: "p",
    exerciseKey: "sit_to_stand",
    outcome: "performed_correctly",
    cueKey: null,
    reasonKey: null,
    helperPresent: false,
    actor: "t",
    createdAt: "2026-10-27T09:00:00Z",
    ...over,
  };
}

const PLAN: ExercisePlan = parsePlanRow(
  {
    id: "plan-1",
    patient_id: "p",
    version: 3,
    authored_by: "t",
    run_id: "run-1",
    appointment_id: null,
    profile_kind: "geriatric",
    status: "active",
    created_at: "2026-10-27T09:00:00Z",
    replaced_at: null,
  },
  [
    parsePlanItemRow({ id: "i2", plan_id: "plan-1", exercise_key: "heel_to_toe_stand", sort_order: 1, dose: { sets: 3, reps: null, holdSeconds: 10, minutes: null, timesPerDay: 1, daysPerWeek: 3, note: null }, milestone_id: null })!,
    parsePlanItemRow({ id: "i1", plan_id: "plan-1", exercise_key: "sit_to_stand", sort_order: 0, dose: { sets: 2, reps: 10, holdSeconds: null, minutes: null, timesPerDay: 1, daysPerWeek: 5, note: "Use the kitchen chair." }, milestone_id: null })!,
  ]
)!;

describe("contraindications from the intake", () => {
  it("raises only what the answers on file say", () => {
    expect([...contraFlagsFromIntake({}, NOW)]).toEqual([]);
    expect([...contraFlagsFromIntake(null, NOW)]).toEqual([]);
    expect(contraFlagsFromIntake({ cardio_condition: CARDIO_CONDITION_OPEN_HEART }, NOW).has("sternal_precautions")).toBe(true);
    expect(
      contraFlagsFromIntake({ cardio_condition: CARDIO_CONDITION_OPEN_HEART, cardio_sternal_precautions_until: "1 Jan 2026" }, NOW).has("sternal_precautions")
    ).toBe(false);
    expect(
      contraFlagsFromIntake({ cardio_condition: CARDIO_CONDITION_OPEN_HEART, cardio_sternal_precautions_until: "when the surgeon says" }, NOW).has(
        "sternal_precautions"
      )
    ).toBe(true);
    expect(contraFlagsFromIntake({ geri_falls_12m: GERI_FALLS_TWO_PLUS }, NOW).has("high_fall_risk")).toBe(true);
    expect(contraFlagsFromIntake({ neuro_pd_freezing: "Most days" }, NOW).has("high_fall_risk")).toBe(true);
    expect(contraFlagsFromIntake({ neuro_mobility: "Use a wheelchair" }, NOW).has("cannot_stand")).toBe(true);
  });
});

describe("the dose", () => {
  const sit = exerciseByKey("sit_to_stand")!;
  it("defaults what is left out and refuses what is out of bounds or the wrong shape", () => {
    const d = validateDose(sit, { reps: 8 });
    expect(d.ok && d.dose).toMatchObject({ sets: 2, reps: 8, holdSeconds: null, timesPerDay: 1, daysPerWeek: 5, note: null });
    expect(validateDose(sit, { reps: 2.5 }).ok).toBe(false);
    expect(validateDose(sit, { reps: 31 }).ok).toBe(false);
    expect(validateDose(sit, { holdSeconds: 5 }).ok).toBe(false);
    expect(validateDose(sit, { price: 1 }).ok).toBe(false);
    expect(validateDose(sit, "two sets").ok).toBe(false);
  });
  it("keeps a short plain note and refuses a long one", () => {
    const d = validateDose(sit, { note: "  Use the   kitchen chair. " });
    expect(d.ok && d.dose.note).toBe("Use the kitchen chair.");
    const long = validateDose(sit, { note: "One. Two. Three." });
    expect(!long.ok && long.refusal.code).toBe("note_not_plain");
  });
  it("says the dose in plain words", () => {
    expect(doseText({ sets: 2, reps: 10, holdSeconds: null, minutes: null, timesPerDay: 1, daysPerWeek: 5, note: null })).toBe(
      "2 sets of 10. Once a day, 5 days a week."
    );
    expect(doseText({ sets: 1, reps: 10, holdSeconds: 5, minutes: null, timesPerDay: 2, daysPerWeek: 7, note: null })).toBe(
      "10 times, holding each for 5 seconds. Twice a day, every day."
    );
    expect(doseText({ sets: 3, reps: null, holdSeconds: 10, minutes: null, timesPerDay: 1, daysPerWeek: 3, note: null })).toBe(
      "Hold for 10 seconds, 3 times. Once a day, 3 days a week."
    );
    expect(doseText({ sets: 1, reps: null, holdSeconds: null, minutes: 10, timesPerDay: 1, daysPerWeek: 1, note: null })).toBe(
      "10 minutes. Once a day, 1 day a week."
    );
  });
});

describe("the publish request", () => {
  it("takes library keys for this kind of patient, in order, with their doses", () => {
    const v = validatePlanItems([{ exerciseKey: "sit_to_stand", dose: { reps: 8 } }, { exerciseKey: "heel_raise" }], ctx);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(planItemsJson(v.items).map((i) => i.exercise_key)).toEqual(["sit_to_stand", "heel_raise"]);
    expect(planItemsJson(v.items)[0].dose).toEqual({ sets: 2, reps: 8, holdSeconds: null, minutes: null, timesPerDay: 1, daysPerWeek: 5, note: null });
  });
  it("refuses an unknown key, another kind's exercise, a duplicate, none, and too many", () => {
    const code = (raw: unknown, c = ctx) => {
      const v = validatePlanItems(raw, c);
      return v.ok ? null : v.refusal.code;
    };
    expect(code([{ exerciseKey: "made_up" }])).toBe("unknown_exercise");
    expect(code([{ exerciseKey: "big_steps" }])).toBe("exercise_not_for_profile");
    expect(code([{ exerciseKey: "heel_raise" }, { exerciseKey: "heel_raise" }])).toBe("duplicate_exercise");
    expect(code([])).toBe("no_exercises");
    expect(code(Array.from({ length: 13 }, () => ({ exerciseKey: "heel_raise" })))).toBe("too_many_exercises");
    expect(code([{ exerciseKey: "heel_raise", price: 10 }])).toBe("bad_request");
    expect(code([{ exerciseKey: "heel_raise", milestoneId: "not-a-uuid" }])).toBe("bad_request");
  });
  it("refuses what the intake rules out, and a helper exercise without a confirmed helper", () => {
    const code = (raw: unknown, c: Parameters<typeof validatePlanItems>[1]) => {
      const v = validatePlanItems(raw, c);
      return v.ok ? null : v.refusal.code;
    };
    expect(code([{ exerciseKey: "one_leg_stand" }], { ...ctx, contraFlags: new Set(["high_fall_risk"]) })).toBe("contraindicated");
    expect(code([{ exerciseKey: "sit_to_stand_hands" }], { ...ctx, contraFlags: new Set(["sternal_precautions"]) })).toBe("contraindicated");
    expect(code([{ exerciseKey: "heel_to_toe_stand" }], { ...ctx, helper: "no_run" })).toBe("helper_needs_run");
    expect(code([{ exerciseKey: "heel_to_toe_stand" }], { ...ctx, helper: "not_confirmed" })).toBe("helper_not_confirmed");
    expect(code([{ exerciseKey: "heel_raise" }], { ...ctx, helper: "no_run" })).toBeNull();
  });
});

describe("the teach request", () => {
  it("is a phase to show or an outcome to record, keys only", () => {
    expect(validateTeachRequest({ runId: "r", exerciseKey: "heel_raise", phase: "demo" }).ok).toBe(true);
    expect(validateTeachRequest({ runId: "r", exerciseKey: "heel_raise", outcome: "performed_correctly" }).ok).toBe(true);
    expect(validateTeachRequest({ runId: "r", exerciseKey: "heel_raise", outcome: "needs_practice", cueKey: "slow_down" }).ok).toBe(true);
    expect(validateTeachRequest({ runId: "r", exerciseKey: "heel_raise", outcome: "not_attempted", reasonKey: "too_painful" }).ok).toBe(true);
    const bad = (raw: unknown) => !validateTeachRequest(raw).ok;
    expect(bad({ runId: "r", exerciseKey: "heel_raise" })).toBe(true);
    expect(bad({ runId: "r", exerciseKey: "heel_raise", phase: "demo", outcome: "performed_correctly" })).toBe(true);
    expect(bad({ runId: "r", exerciseKey: "heel_raise", phase: "rest" })).toBe(true);
    expect(bad({ runId: "r", exerciseKey: "heel_raise", outcome: "needs_practice" })).toBe(true);
    expect(bad({ runId: "r", exerciseKey: "heel_raise", outcome: "needs_practice", cueKey: "say what you like" })).toBe(true);
    expect(bad({ runId: "r", exerciseKey: "heel_raise", outcome: "not_attempted" })).toBe(true);
    expect(bad({ runId: "r", exerciseKey: "heel_raise", outcome: "performed_correctly", cueKey: "slow_down" })).toBe(true);
    expect(bad({ runId: "r", exerciseKey: "heel_raise", outcome: "performed_correctly", note: "well done" })).toBe(true);
    expect(bad({ runId: "r", exerciseKey: "nope", phase: "demo" })).toBe(true);
  });
  it("teaches only what is in the active plan, and a helper exercise only with the helper ticked", () => {
    const plan = { id: "plan-1", exerciseKeys: ["sit_to_stand", "heel_to_toe_stand"] };
    const tandem = exerciseByKey("heel_to_toe_stand")!;
    const go = validateTeachRequest({ exerciseKey: "heel_to_toe_stand", phase: "go" });
    const demo = validateTeachRequest({ exerciseKey: "heel_to_toe_stand", phase: "demo" });
    const notAttempted = validateTeachRequest({ exerciseKey: "heel_to_toe_stand", outcome: "not_attempted", reasonKey: "no_helper" });
    if (!go.ok || !demo.ok || !notAttempted.ok) throw new Error("setup");
    const r = (request = go.request, helperConfirmed = false, p: typeof plan | null = plan) =>
      checkTeachExercise({ plan: p, exercise: tandem, request, helperConfirmed });
    expect(r(go.request, false, null)).toMatchObject({ ok: false, refusal: { code: "no_active_plan" } });
    expect(checkTeachExercise({ plan, exercise: exerciseByKey("heel_raise")!, request: go.request, helperConfirmed: true })).toMatchObject({
      ok: false,
      refusal: { code: "not_in_plan" },
    });
    expect(r(go.request, false)).toMatchObject({ ok: false, refusal: { code: "helper_not_confirmed" } });
    expect(r(demo.request, false)).toEqual({ ok: true, index: 1, total: 2 });
    expect(r(notAttempted.request, false).ok).toBe(true);
    expect(r(go.request, true).ok).toBe(true);
  });
  it("words every refusal code", () => {
    for (const t of Object.values(EXERCISE_REFUSAL_TEXT)) {
      expect(t.message.length).toBeGreaterThan(0);
      expect(t.fix.length).toBeGreaterThan(0);
    }
  });
});

describe("the patient's plan", () => {
  it("is the library's pictures and steps, the dose in words, and when it was practised", () => {
    expect(PLAN.items.map((i) => i.exerciseKey)).toEqual(["sit_to_stand", "heel_to_toe_stand"]);
    const view = exercisePlanView(PLAN, [
      event({ id: "a", exerciseKey: "heel_to_toe_stand", outcome: "needs_practice", cueKey: "hold_support", createdAt: "2026-10-27T09:10:00Z" }),
      event({ id: "b", exerciseKey: "sit_to_stand", planId: "other-plan" }),
    ]);
    expect(view.version).toBe(3);
    expect(view.items[0]).toMatchObject({ key: "sit_to_stand", dose: "2 sets of 10. Once a day, 5 days a week.", note: "Use the kitchen chair.", practised: null, helperLine: null });
    expect(view.items[1].practised).toEqual({ at: "2026-10-27T09:10:00Z", outcome: "needs_practice", cue: COACHING_CUES.hold_support });
    expect(view.items[1].helperLine).toBe("Do this with another adult beside you.");
    expect(practisedLine(view.items[1].practised, "27 Oct")).toBe(
      "Practised with your physiotherapist on 27 Oct. Remember: Keep a hand on the support."
    );
    expect(practisedLine(null, "")).toMatch(/go through this with you/);
  });
  it("parses rows and refuses a malformed one", () => {
    expect(parsePlanRow({ id: "x" })).toBeNull();
    expect(parsePlanItemRow({ id: "i", plan_id: "p", exercise_key: "k", sort_order: 0, dose: { sets: "two" } })).toBeNull();
    expect(
      parseTeachingEventRow({
        id: "e", run_id: "r", plan_id: "p", patient_id: "pt", exercise_key: "heel_raise", outcome: "needs_practice",
        cue_key: "slow_down", reason_key: null, helper_present: true, actor: "t", created_at: "2026-10-27T09:00:00Z",
      })
    ).toMatchObject({ outcome: "needs_practice", cueKey: "slow_down", helperPresent: true });
    expect(parseTeachingEventRow({ id: "e", outcome: "great" })).toBeNull();
  });
});

describe("the summary and the session note", () => {
  const events = [
    event({ id: "1", exerciseKey: "sit_to_stand", outcome: "performed_correctly" }),
    event({ id: "2", exerciseKey: "heel_raise", outcome: "needs_practice", cueKey: "hold_support" }),
    event({ id: "3", exerciseKey: "heel_to_toe_stand", outcome: "not_attempted", reasonKey: "no_helper" }),
  ];
  it("says what was taught, honest about needs practice and not attempted", () => {
    expect(teachingSummarySentence([], "patient")).toBeNull();
    expect(teachingSummarySentence(events, "patient")).toBe(
      "We practised 2 home exercises together: sit to stand went well, and heel raise needs more practice. We will try heel-to-toe stand next time."
    );
    expect(teachingSummarySentence(events, "clinician")).toBe(
      "Home exercises taught: 2 of 3; performed correctly: sit to stand; needs practice: heel raise (keep a hand on the support); not attempted: heel-to-toe stand (no one could stand beside the patient)."
    );
  });
  it("prefills a new note's home exercise field from the plan", () => {
    expect(homeExerciseNotePrefill(PLAN)).toBe(
      "Home exercises, version 3: Sit to stand: 2 sets of 10. Once a day, 5 days a week (Use the kitchen chair); Heel-to-toe stand: Hold for 10 seconds, 3 times. Once a day, 3 days a week."
    );
  });
});

describe("the Home exercises step's own gate", () => {
  const knee = sessionProtocol("ortho_knee")!;
  const cardio = sessionProtocol("cardiopulmonary")!;
  const step = protocolStep(knee, "exercises")!;
  let n = 0;
  const ev = (stepId: string, kind: RunEvent["kind"], details: Record<string, unknown> = {}): RunEvent => ({
    id: `e${++n}`,
    runId: "run-1",
    stepId,
    kind,
    measurementId: null,
    details,
    actor: "t",
    createdAt: new Date(Date.parse("2026-10-27T09:00:00Z") + n * 1000).toISOString(),
  });
  const clear = ev("safety", "safety_confirmed", { gate: "red_flags", answers: {}, flagged: [] });
  const flagged = ev("safety", "safety_confirmed", { gate: "red_flags", answers: { unwell_or_fever: true }, flagged: ["unwell_or_fever"] });
  const setup = ev("exercises", "setup_confirmed", { items: ["whole_body_in_view", "clear_space"], helperPresent: false });
  const gate = (events: RunEvent[], action: "demo" | "doing" | "not_attempted", protocol = knee, s = step) =>
    checkTeachStep({ protocol, step: s, state: runStateFromEvents(events), action, preExercise: null })?.code ?? null;

  it("follows the clinical order", () => {
    expect(gate([], "demo")).toBe("red_flags_unanswered");
    expect(gate([], "not_attempted")).toBe("red_flags_unanswered");
    expect(gate([clear], "demo")).toBeNull();
    expect(gate([clear], "doing")).toBe("setup_not_confirmed");
    expect(gate([clear, setup], "doing")).toBeNull();
    expect(gate([flagged], "demo")).toBe("red_flag_present");
    expect(gate([flagged, setup], "doing")).toBe("red_flag_present");
    expect(gate([flagged], "not_attempted")).toBeNull();
    // Heart and lung: the patient's turn waits on the resting check.
    expect(gate([clear, setup], "doing", cardio, protocolStep(cardio, "exercises")!)).toBe("cardio_check_not_recorded");
  });

  it("maps each request to its gate, and Save and next needs every exercise marked", () => {
    const r = (raw: unknown) => {
      const v = validateTeachRequest(raw);
      if (!v.ok) throw new Error("bad");
      return teachAction(v.request);
    };
    expect(r({ exerciseKey: "heel_raise", phase: "demo" })).toBe("demo");
    expect(r({ exerciseKey: "heel_raise", phase: "go" })).toBe("doing");
    expect(r({ exerciseKey: "heel_raise", outcome: "needs_practice", cueKey: "slow_down" })).toBe("doing");
    expect(r({ exerciseKey: "heel_raise", outcome: "not_attempted", reasonKey: "out_of_time" })).toBe("not_attempted");
    const plan = { id: "plan-1", exerciseKeys: ["sit_to_stand", "heel_raise"] };
    expect(allExercisesMarked(plan, [event({ exerciseKey: "sit_to_stand" })], "run-1")).toBe(false);
    expect(allExercisesMarked(plan, [event({ exerciseKey: "sit_to_stand" }), event({ id: "2", exerciseKey: "heel_raise", runId: "other" })], "run-1")).toBe(false);
    expect(allExercisesMarked(plan, [event({ exerciseKey: "sit_to_stand" }), event({ id: "2", exerciseKey: "heel_raise" })], "run-1")).toBe(true);
    expect(allExercisesMarked({ id: "plan-1", exerciseKeys: [] }, [], "run-1")).toBe(false);
  });
});
