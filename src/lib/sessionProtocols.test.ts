import { describe, expect, it } from "vitest";
import { outcomeMeasure, PROFILE_KINDS } from "./outcomeMeasures";
import {
  CLINICAL_REVIEW_MARK,
  SESSION_PROTOCOLS,
  containsClinicWord,
  defaultProtocolFor,
  needsPreExerciseCheck,
  protocolProblems,
  protocolStep,
  protocolsForProfileKind,
  sentenceCount,
  sessionProtocol,
  stepRecordsMeasure,
  type SessionProtocol,
} from "./sessionProtocols";

const knee = sessionProtocol("ortho_knee")!;

describe("session protocols", () => {
  it("load with no problems, one or more per profile kind", () => {
    expect(protocolProblems(SESSION_PROTOCOLS)).toEqual([]);
    for (const kind of PROFILE_KINDS) expect(protocolsForProfileKind(kind).length).toBeGreaterThan(0);
  });

  it("the knee protocol is the orthopaedic default and follows the approved cockpit", () => {
    expect(defaultProtocolFor("ortho")?.key).toBe("ortho_knee");
    expect(knee.steps.map((s) => s.short)).toEqual([
      "Safety",
      "Pain",
      "Function",
      "Knee bend",
      "Straightening",
      "Chair stand",
      "Walking",
      "Summary",
    ]);
    expect(protocolStep(knee, "pain")?.layer).toBe("pain_map");
    expect(protocolStep(knee, "chair_stand")?.needsHelper).toBe(true);
    expect(protocolStep(knee, "chair_stand")?.clock).toEqual({ kind: "countdown", seconds: 30 });
  });

  it("every step is marked for senior review and every protocol starts with red flags and ends with the summary", () => {
    for (const p of SESSION_PROTOCOLS) {
      expect(p.review).toBe(CLINICAL_REVIEW_MARK);
      expect(p.steps[0].tool).toBe("red_flags");
      expect(p.steps[0].skippable).toBe(false);
      expect(p.steps[p.steps.length - 1].tool).toBe("summary");
      for (const s of p.steps) {
        expect(s.review).toBe(CLINICAL_REVIEW_MARK);
        expect(sentenceCount(s.script)).toBeLessThanOrEqual(2);
        expect(containsClinicWord(s.title)).toBeNull();
        expect(containsClinicWord(s.patientLine)).toBeNull();
      }
    }
  });

  it("never records an in-person-only or licensed measure, and flags every helper measure", () => {
    for (const p of SESSION_PROTOCOLS) {
      for (const s of p.steps) {
        for (const sm of s.measures) {
          const m = outcomeMeasure(sm.measureKey)!;
          expect(m.videoUse).not.toBe("no");
          expect(m.enabledByDefault).toBe(true);
          if (m.videoUse === "with_helper") expect(s.needsHelper).toBe(true);
        }
      }
    }
    // The six-minute walk is in person only: the heart and lung protocol uses
    // the one-minute sit-to-stand instead (the handbook's video stand-in).
    const cardio = defaultProtocolFor("cardiopulmonary")!;
    expect(cardio.steps.some((s) => s.measures.some((m) => m.measureKey === "six_minute_walk"))).toBe(false);
    expect(cardio.steps.some((s) => s.measures.some((m) => m.measureKey === "one_minute_sit_to_stand"))).toBe(true);
  });

  it("refuses a protocol that breaks the rules", () => {
    const bad: SessionProtocol = {
      ...knee,
      key: "bad",
      steps: [
        { ...knee.steps[1], id: "pain" },
        {
          ...knee.steps[5],
          needsHelper: false,
          exertion: false,
          setup: [{ id: "x", label: "x" }],
          measures: [{ measureKey: "six_minute_walk" }, { measureKey: "nope" }, { measureKey: "joint_range", variants: ["elbow_wiggle"] }],
          script: "One. Two. Three.",
          patientLine: "Your triage case is ready.",
        },
        knee.steps[7],
      ],
    };
    const problems = protocolProblems([bad]).join("\n");
    expect(problems).toMatch(/first step must be the red-flag check/);
    expect(problems).toMatch(/unknown measure "nope"/);
    expect(problems).toMatch(/six_minute_walk is done in person only/);
    expect(problems).toMatch(/no variant "elbow_wiggle"/);
    expect(problems).toMatch(/more than two sentences/);
    expect(problems).toMatch(/clinic word "triage"/);
    expect(problems).toMatch(/is exertion and the step must say so/);
  });

  it("refuses an exertion step before the heart and lung resting check", () => {
    const cardio = defaultProtocolFor("cardiopulmonary")!;
    const reordered: SessionProtocol = {
      ...cardio,
      key: "cardio_reordered",
      steps: [cardio.steps[0], protocolStep(cardio, "sit_to_stand")!, protocolStep(cardio, "resting_check")!, cardio.steps[cardio.steps.length - 1]],
    };
    expect(protocolProblems([reordered]).join("\n")).toMatch(/must come after the resting check/);
  });

  it("knows which measures and variants a step records", () => {
    const bend = protocolStep(knee, "knee_bend")!;
    expect(stepRecordsMeasure(bend, "joint_range", "knee_flexion_active")).toBe(true);
    expect(stepRecordsMeasure(bend, "joint_range", "knee_extension_active")).toBe(false);
    expect(stepRecordsMeasure(bend, "joint_range", null)).toBe(false);
    expect(stepRecordsMeasure(bend, "lefs", null)).toBe(false);
    expect(stepRecordsMeasure(protocolStep(knee, "function")!, "lefs", null)).toBe(true);
  });

  it("puts the pre-exercise check in front of heart and lung exertion only", () => {
    const cardio = defaultProtocolFor("cardiopulmonary")!;
    expect(needsPreExerciseCheck(cardio, protocolStep(cardio, "sit_to_stand")!)).toBe(true);
    expect(needsPreExerciseCheck(cardio, protocolStep(cardio, "breathless_now")!)).toBe(false);
    expect(needsPreExerciseCheck(knee, protocolStep(knee, "chair_stand")!)).toBe(false);
  });

  it("spots clinic words on word boundaries only", () => {
    expect(containsClinicWord("Showcase your knee")).toBeNull();
    expect(containsClinicWord("Your case notes")).toBe("case");
    expect(containsClinicWord("The patient stands")).toBe("patient");
  });
});
