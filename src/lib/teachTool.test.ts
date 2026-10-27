import { describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY, exerciseByKey, DOSE_LIMITS, doseShapeProblem, type ContraFlag } from "@/lib/exerciseLibrary";
import {
  COACHING_CUES,
  EXERCISE_REFUSAL_TEXT,
  NOT_ATTEMPTED_REASONS,
  validateDose,
  validateTeachRequest,
  type ExerciseRefusalCode,
  type TeachingEvent,
} from "@/lib/exercisePlan";
import {
  COACHING_CUE_OPTIONS,
  NOT_ATTEMPTED_OPTIONS,
  PLAN_PICK_MAX,
  CORRECTION_REASON_OPTIONS,
  addTeachMark,
  canStep,
  correctionBody,
  doseFieldsFor,
  fixChangesNothing,
  latestMarksByKey,
  draftProblem,
  exerciseProgress,
  markBody,
  markText,
  newDraftItem,
  nextUnmarked,
  noteProblem,
  offerFor,
  publishBody,
  stepDose,
  teachFailure,
  teachMissing,
  toggleDraft,
  updateDraft,
  withNote,
} from "@/lib/teachTool";

const ex = (key: string) => exerciseByKey(key)!;

describe("the dose steppers", () => {
  it("shows exactly the numbers each exercise kind is dosed with", () => {
    for (const e of EXERCISE_LIBRARY) {
      const fields = doseFieldsFor(e.doseKind);
      for (const f of ["sets", "reps", "holdSeconds", "minutes"] as const) {
        // A number the kind does not use is null in the default dose, and has no stepper.
        // A timed exercise is always one go, so it has no sets stepper.
        const used = f === "sets" ? e.doseKind !== "minutes" : e.defaultDose[f] !== null;
        expect(fields.includes(f), `${e.key} ${f}`).toBe(used);
      }
      expect(fields).toContain("timesPerDay");
      expect(fields).toContain("daysPerWeek");
    }
  });

  it("moves by one and never leaves the server's bounds", () => {
    const d = ex("heel_raise").defaultDose;
    expect(stepDose(d, "reps", 1).reps).toBe(d.reps! + 1);
    let top = d;
    for (let i = 0; i < 100; i++) top = stepDose(top, "timesPerDay", 1);
    expect(top.timesPerDay).toBe(DOSE_LIMITS.timesPerDay.max);
    expect(canStep(top, "timesPerDay", 1)).toBe(false);
    let low = d;
    for (let i = 0; i < 100; i++) low = stepDose(low, "daysPerWeek", -1);
    expect(low.daysPerWeek).toBe(DOSE_LIMITS.daysPerWeek.min);
    expect(canStep(low, "daysPerWeek", -1)).toBe(false);
    expect(stepDose(d, "minutes", 1)).toBe(d);
  });

  it("any stepped dose is one the server accepts, for every exercise", () => {
    for (const e of EXERCISE_LIBRARY) {
      let dose = newDraftItem(e).dose;
      for (const f of doseFieldsFor(e.doseKind)) {
        for (let i = 0; i < 40; i++) dose = stepDose(dose, f, 1);
        expect(doseShapeProblem(e.doseKind, dose), `${e.key} max`).toBeNull();
        expect(validateDose(e, dose).ok, `${e.key} max`).toBe(true);
        for (let i = 0; i < 80; i++) dose = stepDose(dose, f, -1);
        expect(doseShapeProblem(e.doseKind, dose), `${e.key} min`).toBeNull();
      }
    }
  });
});

describe("the note", () => {
  it("allows none, two short sentences, and no more", () => {
    expect(noteProblem("")).toBeNull();
    expect(noteProblem("  ")).toBeNull();
    expect(noteProblem("Go slowly. Stop if it hurts.")).toBeNull();
    expect(noteProblem("One. Two. Three.")).toMatch(/2 short sentences/);
    expect(noteProblem("x".repeat(141))).toMatch(/140/);
  });
  it("stores an empty note as none", () => {
    const d = ex("bridge").defaultDose;
    expect(withNote(d, "   ").note).toBeNull();
    expect(withNote(d, "Slowly.").note).toBe("Slowly.");
  });
});

describe("the draft plan", () => {
  it("starts from the library's own dose and holds at most six", () => {
    const orthos = EXERCISE_LIBRARY.filter((e) => e.profileKinds.includes("ortho"));
    let draft: ReturnType<typeof toggleDraft>["draft"] = [];
    for (const e of orthos.slice(0, PLAN_PICK_MAX)) draft = toggleDraft(draft, e).draft;
    expect(draft).toHaveLength(PLAN_PICK_MAX);
    expect(draft[0].dose).toEqual(orthos[0].defaultDose);
    const over = toggleDraft(draft, orthos[PLAN_PICK_MAX]);
    expect(over.tooMany).toBe(true);
    expect(over.draft).toHaveLength(PLAN_PICK_MAX);
    expect(toggleDraft(draft, orthos[0]).draft).toHaveLength(PLAN_PICK_MAX - 1);
  });

  it("edits one exercise's dose and no other", () => {
    let draft = toggleDraft(toggleDraft([], ex("bridge")).draft, ex("heel_slide")).draft;
    draft = updateDraft(draft, "bridge", (d) => stepDose(d, "sets", 1));
    expect(draft[0].dose.sets).toBe(ex("bridge").defaultDose.sets + 1);
    expect(draft[1].dose).toEqual(ex("heel_slide").defaultDose);
  });

  it("says what stops Use this plan", () => {
    const base = { helperTicked: false, needsHelper: (k: string) => !!exerciseByKey(k)?.needsHelper };
    expect(draftProblem([], base)).toMatch(/at least one/);
    const ok = [newDraftItem(ex("bridge"))];
    expect(draftProblem(ok, base)).toBeNull();
    expect(draftProblem([{ ...ok[0], dose: withNote(ok[0].dose, "One. Two. Three.") }], base)).toMatch(/short sentences/);
    const helper = EXERCISE_LIBRARY.find((e) => e.needsHelper)!;
    const needs = [newDraftItem(helper)];
    expect(draftProblem(needs, base)).toMatch(/another adult/);
    expect(draftProblem(needs, { ...base, helperTicked: true })).toBeNull();
  });

  it("sends the run and the keys with their doses, never text of its own", () => {
    const body = publishBody("run-1", [newDraftItem(ex("bridge"))]) as { runId: string; items: { exerciseKey: string; dose: unknown }[] };
    expect(body.runId).toBe("run-1");
    expect(body.items).toEqual([{ exerciseKey: "bridge", dose: ex("bridge").defaultDose }]);
  });
});

describe("offering an exercise", () => {
  it("rules out what the intake rules out, with the refusal wording", () => {
    const standing = EXERCISE_LIBRARY.find((e) => e.contraindications.includes("cannot_stand"))!;
    const offer = offerFor(standing, new Set<ContraFlag>(["cannot_stand"]));
    expect(offer.kind).toBe("ruled_out");
    if (offer.kind === "ruled_out") {
      expect(offer.message).toBe(EXERCISE_REFUSAL_TEXT.contraindicated.message);
      expect(offer.reason).toMatch(/cannot stand/);
    }
    expect(offerFor(standing, new Set<ContraFlag>()).kind).toBe("open");
  });
});

describe("the marks", () => {
  it("builds request bodies the teach route accepts", () => {
    const k = "heel_slide";
    const body = (c: Parameters<typeof markBody>[2]) => markBody("run-1", k, c);
    expect(validateTeachRequest(body({ outcome: "performed_correctly" })).ok).toBe(true);
    for (const cue of Object.keys(COACHING_CUES)) {
      expect(validateTeachRequest(body({ outcome: "needs_practice", cueKey: cue as keyof typeof COACHING_CUES })).ok, cue).toBe(true);
    }
    for (const reason of Object.keys(NOT_ATTEMPTED_REASONS)) {
      expect(validateTeachRequest(body({ outcome: "not_attempted", reasonKey: reason as keyof typeof NOT_ATTEMPTED_REASONS })).ok, reason).toBe(true);
    }
    expect(COACHING_CUE_OPTIONS).toHaveLength(Object.keys(COACHING_CUES).length);
    expect(NOT_ATTEMPTED_OPTIONS).toHaveLength(Object.keys(NOT_ATTEMPTED_REASONS).length);
  });

  it("words a mark in plain terms", () => {
    expect(markText({ outcome: "performed_correctly", cueKey: null, reasonKey: null })).toBe("Did it correctly");
    expect(markText({ outcome: "needs_practice", cueKey: "slow_down", reasonKey: null })).toBe("Needs practice: Go slower and keep it smooth.");
    expect(markText({ outcome: "not_attempted", cueKey: null, reasonKey: "no_space" })).toBe("Not attempted: Not enough space");
  });

  it("finds the next exercise with no mark, round the list", () => {
    const keys = ["a", "b", "c", "d"];
    expect(nextUnmarked(keys, new Set())).toBe(0);
    expect(nextUnmarked(keys, new Set(["a", "b"]))).toBe(2);
    expect(nextUnmarked(keys, new Set(["a", "b", "d"]), 3)).toBe(2);
    expect(nextUnmarked(keys, new Set(keys))).toBeNull();
  });

  it("says what Save and next is waiting for", () => {
    expect(teachMissing(false, [], new Set())).toMatch(/Use this plan/);
    expect(teachMissing(true, ["a", "b", "c"], new Set(["a"]))).toBe("Mark 2 more exercises, or skip this step.");
    expect(teachMissing(true, ["a", "b"], new Set(["a"]))).toBe("Mark 1 more exercise, or skip this step.");
    expect(teachMissing(true, ["a"], new Set(["a"]))).toBeNull();
    expect(exerciseProgress(1, 4)).toBe("Exercise 2 of 4");
  });
});

describe("teachFailure", () => {
  it("has a sentence and one fix for every exercise refusal code", () => {
    for (const code of Object.keys(EXERCISE_REFUSAL_TEXT) as ExerciseRefusalCode[]) {
      const f = teachFailure({ status: 409, code });
      expect(f.kind).toBe("refused");
      expect(f.message.length, code).toBeGreaterThan(5);
      expect(f.fix, code).toBe(EXERCISE_REFUSAL_TEXT[code].fix);
    }
  });

  it("names the exercise when the route did", () => {
    const f = teachFailure({ status: 409, code: "contraindicated", error: "Bottom lift is ruled out: the intake records a high risk of falling." });
    expect(f.message).toContain("Bottom lift");
    expect(f.fix).toBe(EXERCISE_REFUSAL_TEXT.contraindicated.fix);
  });

  it("never says not allowed for a check that could not be run, and says wait for a 429", () => {
    const f = teachFailure({ status: 503, error: "We couldn't check the home exercises just now." });
    expect(f.kind).toBe("unchecked");
    expect(f.message).toMatch(/could not check/);
    expect(f.message.toLowerCase()).not.toContain("not allowed");
    expect(teachFailure({ status: 429 }).kind).toBe("wait");
  });

  it("explains a blocked note and an unmigrated database, and defers to the cockpit for run codes", () => {
    expect(teachFailure({ status: 400, code: "note_blocked", error: "Phone numbers are not shared." }).fix).toMatch(/phone number/);
    expect(teachFailure({ status: 503, code: "not_migrated" }).message).toMatch(/not set up/);
    expect(teachFailure({ status: 409, code: "setup_not_confirmed" }).message).toMatch(/set-up/);
    expect(teachFailure({ status: 409, code: "exercises_not_marked" }).message).toMatch(/Not every exercise/);
    expect(teachFailure({ status: 409, code: "no_condition_profile" }).fix).toMatch(/Health Profile/);
  });
});

describe("Fix this mark (phase 7d-3)", () => {
  const ev = (o: Partial<TeachingEvent>): TeachingEvent => ({
    id: "m", kind: "mark", correctsEventId: null, correctionReason: null, runId: "r", planId: "p", patientId: "pt", exerciseKey: "heel_raise",
    outcome: "performed_correctly", cueKey: null, reasonKey: null, helperPresent: false, actor: "t", createdAt: "2026-10-27T09:00:00Z", ...o,
  });
  const mark = ev({});
  const fix = ev({ id: "f", kind: "correction", correctsEventId: "m", correctionReason: "wrong_button", outcome: "needs_practice", cueKey: "slow_down", createdAt: "2026-10-27T09:01:00Z" });

  it("offers the three reasons in plain words", () => {
    expect(CORRECTION_REASON_OPTIONS.map((o) => o.label)).toEqual([
      "I tapped the wrong button",
      "They tried again and did it right",
      "Other: I will explain in the summary",
    ]);
  });
  it("sends a body the route accepts", () => {
    const body = correctionBody("r", "heel_raise", { outcome: "needs_practice", cueKey: "slow_down" }, "wrong_button");
    expect(body).toEqual({ runId: "r", exerciseKey: "heel_raise", correct: { outcome: "needs_practice", cueKey: "slow_down", correctionReason: "wrong_button" } });
    expect(validateTeachRequest(body).ok).toBe(true);
    expect(validateTeachRequest(correctionBody("r", "heel_raise", { outcome: "not_attempted", reasonKey: "out_of_time" }, "see_summary")).ok).toBe(true);
  });
  it("knows a fix that changes nothing", () => {
    expect(fixChangesNothing(mark, { outcome: "performed_correctly" })).toBe(true);
    expect(fixChangesNothing(fix, { outcome: "needs_practice", cueKey: "slow_down" })).toBe(true);
    expect(fixChangesNothing(fix, { outcome: "needs_practice", cueKey: "back_flat" })).toBe(false);
  });
  it("adds a fix after its mark, never a retried mark twice, and reads the latest", () => {
    const once = addTeachMark([mark], fix);
    expect(once.map((e) => e.id)).toEqual(["m", "f"]);
    expect(addTeachMark(once, fix).map((e) => e.id)).toEqual(["m", "f"]);
    expect(addTeachMark([mark], ev({ id: "local-heel_raise-r" })).map((e) => e.id)).toEqual(["m"]);
    expect(latestMarksByKey(once).get("heel_raise")?.id).toBe("f");
    // Save and next still needs every exercise to have a (latest) mark.
    expect(teachMissing(true, ["heel_raise", "bridge"], new Set(latestMarksByKey(once).keys()))).toMatch(/Mark 1 more exercise/);
  });
  it("says each new refusal in one sentence with one fix", () => {
    expect(teachFailure({ status: 409, code: "correction_needs_mark" })).toMatchObject({ message: /no mark/i, fix: /three buttons/ } as never);
    expect(teachFailure({ status: 400, code: "bad_correction_reason" }).fix).toMatch(/reason/);
    expect(teachFailure({ status: 409, code: "already_marked" }).fix).toMatch(/Fix this mark/);
  });
});
