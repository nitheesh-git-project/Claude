import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  completionOpensAtMs,
  PEDS_EXAM_REQUIRED_FOR_DONE,
  missingSessionExam,
  requiredSessionExam,
  sessionExamMissingMessage,
  sessionExamWindowStartMs,
  SESSION_EXAM_LEAD_MS,
  SESSION_EXAM_REFUSAL,
} from "@/lib/sessionCompletion";

const SLOT = Date.parse("2026-10-01T12:30:00Z");

describe("completionOpensAtMs", () => {
  it("opens Done at the scheduled start, not at the join window", () => {
    expect(completionOpensAtMs(SLOT, "done", 15)).toBe(SLOT);
  });

  it("opens No-show only after the late-arrival grace", () => {
    expect(completionOpensAtMs(SLOT, "no_show", 15)).toBe(SLOT + 15 * 60_000);
  });

  it("never opens No-show before the start, whatever the setting says", () => {
    expect(completionOpensAtMs(SLOT, "no_show", -10)).toBe(SLOT);
  });
});

describe("sessionExamWindowStartMs", () => {
  const HOUR = 60 * 60_000;

  it("opens an hour before the slot on the real clock", () => {
    expect(SESSION_EXAM_LEAD_MS).toBe(HOUR);
    expect(sessionExamWindowStartMs(SLOT, 0)).toBe(SLOT - HOUR);
  });

  it("counts an exam taken on the simulated clock for a session still ahead in real time", () => {
    // Real now is five hours before the slot; the debug clock runs six hours
    // ahead, so it reads an hour after it. The exam's created_at is the real
    // now, which the unshifted window (slot - 1h) refused -- Done stayed
    // blocked on an exam the therapist had just recorded.
    const realNow = SLOT - 5 * HOUR;
    const offset = 6 * HOUR;
    expect(realNow).toBeLessThan(sessionExamWindowStartMs(SLOT, 0));
    expect(realNow).toBeGreaterThanOrEqual(sessionExamWindowStartMs(SLOT, offset));
  });

  it("still refuses an exam from before the session on that same simulated clock", () => {
    // Eight real hours before the slot is two simulated hours before it.
    expect(SLOT - 8 * HOUR).toBeLessThan(sessionExamWindowStartMs(SLOT, 6 * HOUR));
  });
});

describe("which examination Done requires", () => {
  it("asks an orthopaedic patient for the Pain Map and a neurological one for the neuro chart", () => {
    expect(requiredSessionExam("ortho")).toBe("pain_map");
    expect(requiredSessionExam("neuro")).toBe("neuro_exam");
  });

  it("asks nothing of a geriatric or cardiopulmonary patient (phase 6a, the owner's decision)", () => {
    for (const specialty of ["geriatric", "cardiopulmonary"] as const) {
      expect(requiredSessionExam(specialty)).toBeNull();
      expect(missingSessionExam(specialty, { painMap: 0, neuroExam: 0, pedsExam: 0 })).toBeNull();
    }
  });

  it("asks a paediatric patient for the paediatric exam, as it does ortho and neuro (phase 5b)", () => {
    expect(PEDS_EXAM_REQUIRED_FOR_DONE).toBe(true);
    expect(requiredSessionExam("pediatrics")).toBe("peds_exam");
    expect(missingSessionExam("pediatrics", { painMap: 0, neuroExam: 0 })).toBe("peds_exam");
    expect(missingSessionExam("pediatrics", { painMap: 0, neuroExam: 0, pedsExam: 0 })).toBe("peds_exam");
    expect(missingSessionExam("pediatrics", { painMap: 0, neuroExam: 0, pedsExam: 1 })).toBeNull();
  });

  it("asks a paediatric patient for the paediatric exam once the gate is on, and no other layer stands in", () => {
    expect(requiredSessionExam("pediatrics", true)).toBe("peds_exam");
    expect(missingSessionExam("pediatrics", { painMap: 0, neuroExam: 0, pedsExam: 0 }, true)).toBe("peds_exam");
    expect(missingSessionExam("pediatrics", { painMap: 0, neuroExam: 0 }, true)).toBe("peds_exam");
    expect(missingSessionExam("pediatrics", { painMap: 4, neuroExam: 2, pedsExam: 0 }, true)).toBe("peds_exam");
    expect(missingSessionExam("pediatrics", { painMap: 0, neuroExam: 0, pedsExam: 1 }, true)).toBeNull();
    // A paediatric exam never satisfies the other two.
    expect(missingSessionExam("ortho", { painMap: 0, neuroExam: 0, pedsExam: 3 }, true)).toBe("pain_map");
    expect(missingSessionExam("neuro", { painMap: 0, neuroExam: 0, pedsExam: 3 }, true)).toBe("neuro_exam");
    expect(SESSION_EXAM_REFUSAL.peds_exam.code).toBe("peds_exam_required");
    expect(sessionExamMissingMessage("peds_exam")).toBe("Record the paediatric examination for this session before finishing it.");
  });

  it("is never on while the note dialog's exam step has no paediatric arm", () => {
    // The gate and the control ship together: turning the requirement on
    // without mounting SessionPedsExamStep would leave every paediatric
    // session impossible to finish.
    const step = readFileSync(join(process.cwd(), "src/components/therapist/SessionExamStep.tsx"), "utf8");
    if (PEDS_EXAM_REQUIRED_FOR_DONE) {
      expect(step).toMatch(/SessionPedsExamStep/);
      expect(step).toMatch(/"peds_exam"/);
    } else {
      expect(PEDS_EXAM_REQUIRED_FOR_DONE).toBe(false);
    }
  });

  it("gives the therapist something to press, and says when it could not read", () => {
    const peds = readFileSync(join(process.cwd(), "src/components/therapist/SessionPedsExamStep.tsx"), "utf8");
    // Offered exactly like the neurological one: a button, a required marker,
    // and a read that failed is said and never counted as recorded.
    expect(peds).toMatch(/Record the paediatric exam/);
    expect(peds).toMatch(/Record another examination/);
    expect(peds).toMatch(/const recorded = !failed && thisSession\.length > 0/);
    expect(peds).toMatch(/so it is not\s+counted as recorded/);
    // The button is not disabled by a failed or pending read.
    expect(peds).not.toMatch(/disabled=\{rows === null\}/);
    const step = readFileSync(join(process.cwd(), "src/components/therapist/SessionExamStep.tsx"), "utf8");
    expect(step).toMatch(/couldn&apos;t check which examination this session needs/);
  });

  it("refuses a neurological Done with no neuro exam this session, and allows it after one", () => {
    expect(missingSessionExam("neuro", { painMap: 0, neuroExam: 0 })).toBe("neuro_exam");
    expect(missingSessionExam("neuro", { painMap: 0, neuroExam: 1 })).toBeNull();
  });

  it("never lets the other layer stand in for the required one", () => {
    // Pain scores left from before a re-triage are not this session's
    // neurological examination, and vice versa.
    expect(missingSessionExam("neuro", { painMap: 3, neuroExam: 0 })).toBe("neuro_exam");
    expect(missingSessionExam("ortho", { painMap: 0, neuroExam: 2 })).toBe("pain_map");
  });

  it("leaves the orthopaedic gate exactly as it was", () => {
    expect(missingSessionExam("ortho", { painMap: 0, neuroExam: 0 })).toBe("pain_map");
    expect(missingSessionExam("ortho", { painMap: 1, neuroExam: 0 })).toBeNull();
    expect(SESSION_EXAM_REFUSAL.pain_map).toEqual({
      code: "pain_map_required",
      error: "Update the Pain Map for this session before marking it done.",
    });
  });

  it("names the neuro refusal by its own code and says what to do", () => {
    expect(SESSION_EXAM_REFUSAL.neuro_exam.code).toBe("neuro_exam_required");
    expect(SESSION_EXAM_REFUSAL.neuro_exam.error).toMatch(/neurological examination/);
    expect(sessionExamMissingMessage("neuro_exam")).toMatch(/before finishing it/);
    expect(sessionExamMissingMessage("pain_map")).toBe("Update the Pain Map for this session before finishing it.");
  });
});
