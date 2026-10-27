import { describe, expect, it } from "vitest";
import { PROFILE_KINDS } from "@/lib/outcomeMeasures";
import { CLINICAL_REVIEW_MARK } from "@/lib/sessionProtocols";
import {
  EXERCISE_LIBRARY,
  EXERCISES_PER_KIND_MIN,
  bodyAreasFor,
  doseShapeProblem,
  exerciseByKey,
  exercisesFor,
  libraryProblems,
  type Exercise,
} from "@/lib/exerciseLibrary";

const base = exerciseByKey("sit_to_stand")!;

describe("exercise library", () => {
  it("loads, has unique keys, and is marked for clinical review", () => {
    expect(libraryProblems(EXERCISE_LIBRARY)).toEqual([]);
    expect(new Set(EXERCISE_LIBRARY.map((e) => e.key)).size).toBe(EXERCISE_LIBRARY.length);
    for (const e of EXERCISE_LIBRARY) {
      expect(e.review).toBe(CLINICAL_REVIEW_MARK);
      expect(e.source).toBe("code");
    }
  });

  it("offers every profile kind a starter set, filterable by body area", () => {
    for (const kind of PROFILE_KINDS) {
      expect(exercisesFor(kind).length).toBeGreaterThanOrEqual(EXERCISES_PER_KIND_MIN);
      for (const area of bodyAreasFor(kind)) {
        expect(exercisesFor(kind, area).every((e) => e.bodyArea === area && e.profileKinds.includes(kind))).toBe(true);
      }
    }
    expect(exercisesFor("geriatric").map((e) => e.key)).toEqual(
      expect.arrayContaining(["sit_to_stand", "heel_raise", "heel_to_toe_stand"])
    );
    expect(exercisesFor("neuro_parkinsons").map((e) => e.key)).toEqual(expect.arrayContaining(["big_steps", "sit_to_stand"]));
    expect(exercisesFor("cardiopulmonary").map((e) => e.key)).toEqual(expect.arrayContaining(["walking", "pursed_lip_breathing"]));
  });

  it("puts a parent beside every child's exercise", () => {
    for (const e of exercisesFor("pediatrics")) expect(e.needsHelper).toBe(true);
  });

  it("refuses a duplicate key, a dangling level, a clinic word and a bad default dose", () => {
    const dup = [...EXERCISE_LIBRARY, { ...base }];
    expect(libraryProblems(dup)).toContain('duplicate exercise key "sit_to_stand"');
    const bad: Exercise = {
      ...base,
      key: "bad_one",
      name: "Patient sit to stand",
      easier: "nowhere",
      steps: ["One.", "Two."],
      defaultDose: { ...base.defaultDose, reps: 99 },
    };
    const problems = libraryProblems([...EXERCISE_LIBRARY, bad]);
    expect(problems.some((p) => p.includes('bad_one.name: uses the clinic word "patient"'))).toBe(true);
    expect(problems.some((p) => p.includes('easier version "nowhere"'))).toBe(true);
    expect(problems.some((p) => p.includes("needs 3 to 5 steps"))).toBe(true);
    expect(problems.some((p) => p.includes("default dose"))).toBe(true);
    const child: Exercise = { ...base, key: "child_alone", profileKinds: ["pediatrics"], needsHelper: false, easier: undefined };
    expect(libraryProblems([...EXERCISE_LIBRARY, child]).some((p) => p.includes("needs a parent"))).toBe(true);
  });

  it("checks a dose against its kind", () => {
    const d = { sets: 2, reps: 10, holdSeconds: null, minutes: null, timesPerDay: 1, daysPerWeek: 5, note: null };
    expect(doseShapeProblem("reps", d)).toBeNull();
    expect(doseShapeProblem("reps_hold", d)).toMatch(/hold/);
    expect(doseShapeProblem("minutes", { ...d, sets: 1, reps: null, minutes: 10 })).toBeNull();
    expect(doseShapeProblem("minutes", { ...d, reps: null, minutes: 10 })).toMatch(/one go/);
    expect(doseShapeProblem("hold", { ...d, reps: null, holdSeconds: 10 })).toBeNull();
    expect(doseShapeProblem("reps", { ...d, daysPerWeek: 8 })).toMatch(/days a week/);
  });
});
