import { describe, expect, it } from "vitest";
import { caregiverProvenance, shapePedsExamView } from "@/lib/pedsProfileView";
import type { ParsedPedsAssessment } from "@/lib/pedsExam";
import { DIARY_KINDS_BY_PROFILE_KIND } from "@/lib/patientDiary";

describe("caregiverProvenance", () => {
  it("says who told us, with the child's pronoun", () => {
    expect(caregiverProvenance({ name: "Priya Sharma", relationship: "Mother", childGender: "Female" })).toBe(
      "Told by Priya Sharma, her mother"
    );
    expect(caregiverProvenance({ name: "Rahul Verma", relationship: "father", childGender: "Male" })).toBe("Told by Rahul Verma, his father");
    expect(caregiverProvenance({ name: "Asha", relationship: "Grandmother", childGender: "Prefer not to say" })).toBe(
      "Told by Asha, their grandmother"
    );
    expect(caregiverProvenance({ name: "Asha", relationship: "Legal guardian", childGender: null })).toBe("Told by Asha, their legal guardian");
  });

  it("keeps the caregiver's own words for a relationship it does not know, or one already phrased", () => {
    expect(caregiverProvenance({ name: "Meena", relationship: "Aunt by marriage", childGender: "Female" })).toBe(
      "Told by Meena (Aunt by marriage)"
    );
    expect(caregiverProvenance({ name: "Meena", relationship: "Her aunt", childGender: "Female" })).toBe("Told by Meena, her aunt");
    // From the caregiver's side: never turned round into "her daughter".
    expect(caregiverProvenance({ name: "Meena", relationship: "My daughter", childGender: "Female" })).toBe("Told by Meena (My daughter)");
  });

  it("has no line without a name, and just the name without a relationship", () => {
    expect(caregiverProvenance({ name: "  ", relationship: "Mother" })).toBeNull();
    expect(caregiverProvenance({ name: null, relationship: null })).toBeNull();
    expect(caregiverProvenance({ name: " Priya  Sharma ", relationship: "" })).toBe("Told by Priya Sharma");
  });
});

const exam = (id: string, createdAt: string, findings: ParsedPedsAssessment["findings"]): ParsedPedsAssessment => ({
  id,
  createdAt,
  submittedBy: "t1",
  submittedByRole: "therapist",
  findings,
});

const EXAMS: ParsedPedsAssessment[] = [
  exam("new", "2026-10-15T06:00:00Z", {
    milestones: {
      sitting_without_support: { status: "achieved", firstSeenOn: "2026-01-10", source: "seen" },
      walking_alone: { status: "not_yet" },
    },
  }),
  exam("old", "2026-07-01T06:00:00Z", {
    milestones: { sitting_without_support: { status: "emerging", source: "reported" }, walking_alone: { status: "not_yet" } },
  }),
];

const INTAKE = {
  peds_caregiver_name: "Priya Sharma",
  peds_caregiver_relationship: "Mother",
  peds_weeks_at_birth: "30 weeks",
};

describe("shapePedsExamView", () => {
  const reads = {
    exams: { status: "ok" as const, exams: EXAMS },
    birth: { status: "ok" as const, birthDate: "2025-01-01", gender: "Female" },
    todayIso: "2026-10-20",
  };

  it("shapes the header, both charts, the tally and the change since the exam before", () => {
    const view = shapePedsExamView(reads, { intake: INTAKE, voice: "clinician" });
    expect(view.provenance).toBe("Told by Priya Sharma, her mother");
    expect(view.ageLine).toBe("21.6 months (19.3 months corrected, born at 30 weeks)");
    expect(view.latest?.id).toBe("new");
    expect(view.first?.id).toBe("old");
    expect(view.windows.rows.find((r) => r.key === "sitting_without_support")?.status).toBe("achieved");
    expect(view.firstWindows?.rows.find((r) => r.key === "sitting_without_support")?.status).toBe("emerging");
    expect(view.tally).toMatchObject({ achieved: 1, notYet: 1, notAssessed: 4 });
    expect(view.changes).toEqual([
      expect.objectContaining({ id: "milestone.sitting_without_support", direction: "better" }),
    ]);
    expect(view.birthFailed).toBe(false);
    expect(view.examsFailed).toBe(false);
  });

  it("gives the walking prompt to clinicians only", () => {
    expect(shapePedsExamView(reads, { intake: INTAKE, voice: "clinician" }).referral?.clinicianText).toMatch(/Not walking alone/);
    expect(shapePedsExamView(reads, { intake: INTAKE, voice: "patient" }).referral).toBeNull();
  });

  it("degrades each read on its own: an unreadable exam read is not 'no exams', an unreadable birth date not 'not on file'", () => {
    const view = shapePedsExamView(
      { exams: { status: "unreadable" }, birth: { status: "unreadable" }, todayIso: "2026-10-20" },
      { intake: INTAKE, voice: "clinician" }
    );
    expect(view.examsFailed).toBe(true);
    expect(view.birthFailed).toBe(true);
    expect(view.latest).toBeNull();
    expect(view.ageLine).toBeNull();
    // The provenance comes from the intake, so it survives both; with the
    // gender unreadable it says "their", never a guess.
    expect(view.provenance).toBe("Told by Priya Sharma, their mother");
  });

  it("has no first-exam chart and no changes with a single exam", () => {
    const view = shapePedsExamView({ ...reads, exams: { status: "ok", exams: [EXAMS[0]] } }, { intake: INTAKE, voice: "patient" });
    expect(view.first).toBeNull();
    expect(view.firstWindows).toBeNull();
    expect(view.changes).toEqual([]);
  });
});

describe("the paediatric profile keeps no diary (owner's decision)", () => {
  it("offers no diary kind to a paediatric record", () => {
    expect(DIARY_KINDS_BY_PROFILE_KIND.pediatrics).toEqual([]);
  });
});
