import { describe, expect, it } from "vitest";
import {
  assessedCount,
  emptyPedsForm,
  isPedsFormDirty,
  lastTimeLine,
  pedsExamErrorMessage,
  pedsFormToRaw,
  setMilestone,
} from "@/lib/pedsExamForm";
import {
  validatePedsFindings,
  type ParsedPedsAssessment,
} from "@/lib/pedsExam";

const CTX = { todayIso: "2026-10-20", birthDate: "2025-06-01" };

describe("the form's state", () => {
  it("starts empty and clean, with every milestone not assessed", () => {
    const f = emptyPedsForm();
    expect(isPedsFormDirty(f)).toBe(false);
    expect(assessedCount(f)).toBe(0);
    expect(pedsFormToRaw(f)).toEqual({ milestones: {} });
  });

  it("is dirty once anything is chosen or typed", () => {
    expect(
      isPedsFormDirty(
        setMilestone(emptyPedsForm(), "walking_alone", { status: "not_yet" }),
      ),
    ).toBe(true);
    expect(isPedsFormDirty({ ...emptyPedsForm(), notes: "  " })).toBe(false);
    expect(isPedsFormDirty({ ...emptyPedsForm(), gmfcs: "2" })).toBe(true);
  });

  it("clears the source, date and rough flag when a milestone goes back to not yet or not assessed", () => {
    let f = setMilestone(emptyPedsForm(), "standing_alone", {
      status: "achieved",
      source: "reported",
      date: "2026-08-01",
      approximate: true,
    });
    expect(f.milestones.standing_alone).toEqual({
      status: "achieved",
      source: "reported",
      date: "2026-08-01",
      approximate: true,
    });
    f = setMilestone(f, "standing_alone", { status: "not_yet" });
    expect(f.milestones.standing_alone).toEqual({
      status: "not_yet",
      source: "",
      date: "",
      approximate: false,
    });
    f = setMilestone(f, "standing_alone", { status: "" });
    expect(assessedCount(f)).toBe(0);
  });

  it("drops the rough flag when the source becomes 'seen' or the date is cleared", () => {
    let f = setMilestone(emptyPedsForm(), "standing_alone", {
      status: "achieved",
      source: "reported",
      date: "2026-08-01",
      approximate: true,
    });
    f = setMilestone(f, "standing_alone", { source: "seen" });
    expect(f.milestones.standing_alone.approximate).toBe(false);
    f = setMilestone(f, "standing_alone", {
      source: "reported",
      approximate: true,
    });
    f = setMilestone(f, "standing_alone", { date: "" });
    expect(f.milestones.standing_alone.approximate).toBe(false);
  });
});

describe("what the form posts", () => {
  it("is exactly what the validator accepts, for every shape the controls can make", () => {
    let f = emptyPedsForm();
    f = setMilestone(f, "sitting_without_support", {
      status: "achieved",
      source: "seen",
      date: "2026-01-10",
    });
    f = setMilestone(f, "hands_knees_crawling", {
      status: "achieved",
      source: "reported",
      date: "2026-03-01",
      approximate: true,
    });
    f = setMilestone(f, "standing_with_help", {
      status: "emerging",
      source: "reported",
    });
    f = setMilestone(f, "walking_with_help", { status: "not_yet" });
    f = { ...f, gmfcs: "3", equipment: " AFOs ", notes: " tires early " };
    const raw = pedsFormToRaw(f);
    const result = validatePedsFindings(raw, CTX);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.findings.milestones.hands_knees_crawling).toEqual({
      status: "achieved",
      firstSeenOn: "2026-03-01",
      source: "reported",
      approximate: true,
    });
    expect(result.findings.milestones.walking_with_help).toEqual({
      status: "not_yet",
    });
    expect(result.findings.milestones.standing_alone).toBeUndefined();
    expect(result.findings.gmfcsLevel).toBe(3);
    expect(result.findings.equipment).toBe("AFOs");
  });

  it("leaves an incomplete finding for the validator to name, in its words", () => {
    const noWho = setMilestone(emptyPedsForm(), "standing_alone", {
      status: "achieved",
      date: "2026-08-01",
    });
    const r1 = validatePedsFindings(pedsFormToRaw(noWho), CTX);
    expect(!r1.ok && r1.error).toMatch(
      /Standing alone: say whether you saw it/,
    );
    const noDate = setMilestone(emptyPedsForm(), "standing_alone", {
      status: "achieved",
      source: "seen",
    });
    const r2 = validatePedsFindings(pedsFormToRaw(noDate), CTX);
    expect(!r2.ok && r2.error).toMatch(/add the date it was first seen/);
    const r3 = validatePedsFindings(pedsFormToRaw(emptyPedsForm()), CTX);
    expect(!r3.ok && r3.error).toMatch(/at least one finding/);
  });

  it("reads 'last time' from the previous examination", () => {
    const previous = {
      id: "1",
      createdAt: "2026-08-01T00:00:00Z",
      submittedBy: null,
      submittedByRole: "therapist",
      findings: {
        milestones: {
          standing_alone: { status: "emerging", source: "reported" },
          walking_alone: { status: "not_yet" },
        },
      },
    } as ParsedPedsAssessment;
    expect(lastTimeLine(previous, "standing_alone")).toBe(
      "Emerging, parent reports",
    );
    expect(lastTimeLine(previous, "walking_alone")).toBe("Not yet");
    expect(lastTimeLine(previous, "sitting_without_support")).toBeNull();
    expect(lastTimeLine(null, "walking_alone")).toBeNull();
  });
});

describe("pedsExamErrorMessage", () => {
  it("keeps the route's sentence when it carries the reason", () => {
    expect(
      pedsExamErrorMessage(400, {
        error: "Standing alone: the date first seen is in the future.",
      }),
    ).toBe("Standing alone: the date first seen is in the future.");
    expect(
      pedsExamErrorMessage(403, {
        error:
          "You can only record findings for a patient you've been assigned to.",
      }),
    ).toMatch(/assigned/);
    expect(
      pedsExamErrorMessage(409, { error: "A session has not started yet." }),
    ).toBe("A session has not started yet.");
  });

  it("words the codes and statuses that would be a bare word", () => {
    expect(
      pedsExamErrorMessage(400, { error: "x", code: "not_paediatric" }),
    ).toMatch(/not recorded as a paediatric patient/);
    expect(pedsExamErrorMessage(401, {})).toMatch(/Sign in again/);
    expect(pedsExamErrorMessage(403, { error: "Forbidden" })).toMatch(
      /assigned to/,
    );
    expect(pedsExamErrorMessage(409, {})).toMatch(
      /session with this patient has started/,
    );
    expect(pedsExamErrorMessage(429, {})).toMatch(/too many saves/);
    expect(pedsExamErrorMessage(503, {})).toMatch(/nothing was saved/);
    expect(
      pedsExamErrorMessage(503, {
        error: "This database has not been updated yet.",
      }),
    ).toMatch(/not been updated/);
    expect(pedsExamErrorMessage(500, null)).toBe(
      "Could not save this examination. Please try again.",
    );
  });
});
