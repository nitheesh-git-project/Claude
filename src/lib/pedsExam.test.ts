import { describe, expect, it } from "vitest";
import { WHO_MOTOR_MILESTONES } from "@/lib/outcomeMeasures";
import {
  comparePedsExams,
  describePedsChange,
  describePedsExamForText,
  GMFCS_LEVELS,
  isPedsExamEmpty,
  parseIsoDate,
  parsePedsAssessments,
  PEDS_EQUIPMENT_MAX,
  PEDS_EXAM_VERSION,
  PEDS_MILESTONE_KEYS,
  PEDS_MILESTONES,
  PEDS_NOTES_MAX,
  pedsExamTally,
  readStoredPedsFindings,
  validatePedsFindings,
  type PedsFindings,
  type PedsValidationContext,
} from "@/lib/pedsExam";

const CTX: PedsValidationContext = { todayIso: "2026-10-20", birthDate: "2025-06-01" };

function ok(raw: unknown, ctx: PedsValidationContext = CTX): PedsFindings {
  const result = validatePedsFindings(raw, ctx);
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result.findings;
}

function refused(raw: unknown, ctx: PedsValidationContext = CTX): string {
  const result = validatePedsFindings(raw, ctx);
  if (result.ok) throw new Error("expected a refusal");
  return result.error;
}

describe("the milestone list", () => {
  it("is the registry's six WHO milestones, in order, with their windows and definitions", () => {
    expect(PEDS_MILESTONE_KEYS).toEqual(WHO_MOTOR_MILESTONES.map((m) => m.key));
    expect(PEDS_MILESTONES.map((m) => m.windowMonths)).toEqual([
      [3.8, 9.2],
      [5.2, 13.5],
      [4.8, 11.4],
      [5.9, 13.7],
      [6.9, 16.9],
      [8.2, 17.6],
    ]);
    for (const m of PEDS_MILESTONES) expect(m.reachedWhen.length, m.key).toBeGreaterThan(20);
    expect(PEDS_EXAM_VERSION).toBe(1);
  });

  it("offers GMFCS as five levels, I to V", () => {
    expect(GMFCS_LEVELS.map((g) => g.label)).toEqual(["Level I", "Level II", "Level III", "Level IV", "Level V"]);
  });
});

describe("validatePedsFindings", () => {
  it("keeps a full examination exactly as sent, trimmed", () => {
    const findings = ok({
      milestones: {
        sitting_without_support: { status: "achieved", firstSeenOn: "2026-01-10", source: "seen" },
        hands_knees_crawling: { status: "achieved", firstSeenOn: "2026-03-02", source: "reported" },
        standing_with_help: { status: "emerging", source: "seen" },
        walking_alone: { status: "not_yet" },
      },
      gmfcsLevel: 2,
      equipment: "  Ankle splints both sides, fitted Aug 2026 ",
      notes: " Happy to play on the mat. ",
    });
    expect(findings).toEqual({
      milestones: {
        sitting_without_support: { status: "achieved", firstSeenOn: "2026-01-10", source: "seen" },
        hands_knees_crawling: { status: "achieved", firstSeenOn: "2026-03-02", source: "reported" },
        standing_with_help: { status: "emerging", source: "seen" },
        walking_alone: { status: "not_yet" },
      },
      gmfcsLevel: 2,
      equipment: "Ankle splints both sides, fitted Aug 2026",
      notes: "Happy to play on the mat.",
    });
  });

  it("stores a milestone nobody assessed as absent, never as a value", () => {
    const findings = ok({
      milestones: {
        sitting_without_support: { status: "achieved", firstSeenOn: "2026-01-10", source: "seen" },
        walking_alone: null,
        standing_alone: { status: "" },
        walking_with_help: {},
      },
    });
    expect(Object.keys(findings.milestones)).toEqual(["sitting_without_support"]);
  });

  it("keeps 'not yet' (looked, not there) distinct from not assessed", () => {
    const findings = ok({ milestones: { walking_alone: { status: "not_yet" } } });
    expect(findings.milestones.walking_alone).toEqual({ status: "not_yet" });
    expect(findings.milestones.standing_alone).toBeUndefined();
  });

  it("allows a source on 'not yet' (the family says it is not there) but no date", () => {
    expect(ok({ milestones: { walking_alone: { status: "not_yet", source: "reported" } } }).milestones.walking_alone).toEqual({
      status: "not_yet",
      source: "reported",
    });
    expect(refused({ milestones: { walking_alone: { status: "not_yet", firstSeenOn: "2026-05-01" } } })).toMatch(
      /not there yet has no date/
    );
  });

  it("needs who saw it for emerging and achieved", () => {
    expect(refused({ milestones: { standing_alone: { status: "emerging" } } })).toMatch(/saw it or the family reported it/);
    expect(refused({ milestones: { standing_alone: { status: "achieved", firstSeenOn: "2026-05-01" } } })).toMatch(
      /saw it or the family reported it/
    );
    expect(refused({ milestones: { standing_alone: { status: "achieved", firstSeenOn: "2026-05-01", source: "video" } } })).toMatch(
      /saw it or the family reported it/
    );
  });

  it("needs the date first seen for achieved, and it must be a real day between birth and today", () => {
    expect(refused({ milestones: { standing_alone: { status: "achieved", source: "seen" } } })).toMatch(/date it was first seen/);
    expect(refused({ milestones: { standing_alone: { status: "achieved", source: "seen", firstSeenOn: "2026-02-30" } } })).toMatch(
      /not a real date/
    );
    expect(refused({ milestones: { standing_alone: { status: "achieved", source: "seen", firstSeenOn: "12/05/2026" } } })).toMatch(
      /not a real date/
    );
    expect(refused({ milestones: { standing_alone: { status: "achieved", source: "seen", firstSeenOn: "2026-10-21" } } })).toMatch(
      /in the future/
    );
    expect(refused({ milestones: { standing_alone: { status: "achieved", source: "seen", firstSeenOn: "2025-05-31" } } })).toMatch(
      /before the child's date of birth/
    );
    // Today and the birthday itself are both possible days.
    expect(ok({ milestones: { standing_alone: { status: "achieved", source: "seen", firstSeenOn: "2026-10-20" } } })).toBeTruthy();
    expect(ok({ milestones: { standing_alone: { status: "emerging", source: "seen", firstSeenOn: "2025-06-01" } } })).toBeTruthy();
  });

  it("skips the birth check only when there is no date of birth to compare with", () => {
    const raw = { milestones: { standing_alone: { status: "achieved", source: "seen", firstSeenOn: "2020-01-01" } } };
    expect(ok(raw, { todayIso: "2026-10-20", birthDate: null }).milestones.standing_alone?.firstSeenOn).toBe("2020-01-01");
  });

  it("refuses a milestone, a status or a field the chart does not have", () => {
    expect(refused({ milestones: { running: { status: "achieved" } } })).toMatch(/milestone this chart does not have/);
    expect(refused({ milestones: { walking_alone: { status: "nearly" } } })).toMatch(/not one of the statuses/);
    expect(refused({ milestones: { walking_alone: { status: "not_yet", note: "x" } } })).toMatch(/only a status/);
    expect(refused({ milestones: { walking_alone: { source: "seen" } } })).toMatch(/choose Not yet, Emerging or Achieved/);
    expect(refused({ milestones: [] })).toMatch(/milestones are not readable/);
    expect(refused({ milestones: { walking_alone: "achieved" } })).toMatch(/not readable/);
    expect(refused({ milestones: {}, pain: 3 })).toMatch(/fields this chart does not have/);
    expect(refused(null)).toMatch(/missing or not readable/);
    expect(refused([])).toMatch(/missing or not readable/);
  });

  it("refuses the two timed counts and says where they are recorded", () => {
    for (const field of ["standingSeconds", "independentSteps", "standingAloneSeconds", "steps"]) {
      expect(refused({ milestones: {}, [field]: 8 })).toMatch(/Record a test/);
    }
  });

  it("takes GMFCS as a whole level from I to V and nothing else", () => {
    expect(ok({ gmfcsLevel: 5 }).gmfcsLevel).toBe(5);
    expect(ok({ gmfcsLevel: null, notes: "x" }).gmfcsLevel).toBeUndefined();
    for (const bad of [0, 6, 2.5, "II", "2"]) expect(refused({ gmfcsLevel: bad })).toMatch(/Level I to Level V/);
  });

  it("bounds and type-checks the two notes", () => {
    expect(refused({ equipment: "x".repeat(PEDS_EQUIPMENT_MAX + 1) })).toMatch(/too long/);
    expect(refused({ notes: "x".repeat(PEDS_NOTES_MAX + 1) })).toMatch(/too long/);
    expect(refused({ notes: 42 })).toMatch(/must be text/);
    expect(ok({ equipment: "x".repeat(PEDS_EQUIPMENT_MAX) }).equipment).toHaveLength(PEDS_EQUIPMENT_MAX);
  });

  it("refuses an examination with nothing in it", () => {
    expect(refused({})).toMatch(/at least one finding/);
    expect(refused({ milestones: { walking_alone: null }, notes: "   ", equipment: "" })).toMatch(/at least one finding/);
    expect(isPedsExamEmpty({ milestones: {} })).toBe(true);
    expect(isPedsExamEmpty({ milestones: {}, gmfcsLevel: 1 })).toBe(false);
  });
});

describe("parseIsoDate", () => {
  it("accepts real calendar days only", () => {
    expect(parseIsoDate("2024-02-29")).toBe("2024-02-29");
    expect(parseIsoDate("2025-02-29")).toBeNull();
    expect(parseIsoDate("2026-13-01")).toBeNull();
    expect(parseIsoDate("2026-1-1")).toBeNull();
    expect(parseIsoDate(20260101)).toBeNull();
    expect(parseIsoDate(null)).toBeNull();
  });
});

describe("readStoredPedsFindings", () => {
  it("reads a stored row without the write's date checks, and an unreadable one as empty", () => {
    const stored = { milestones: { walking_alone: { status: "achieved", firstSeenOn: "2099-01-01", source: "seen" } } };
    expect(readStoredPedsFindings(stored).milestones.walking_alone?.firstSeenOn).toBe("2099-01-01");
    expect(readStoredPedsFindings({ milestones: { flying: { status: "achieved" } } })).toEqual({ milestones: {} });
    expect(readStoredPedsFindings("nonsense")).toEqual({ milestones: {} });
  });
});

describe("pedsExamTally", () => {
  it("counts each status, the not assessed, and what rests on the family's word alone", () => {
    const tally = pedsExamTally({
      milestones: {
        sitting_without_support: { status: "achieved", firstSeenOn: "2026-01-10", source: "seen" },
        hands_knees_crawling: { status: "achieved", firstSeenOn: "2026-03-02", source: "reported" },
        standing_with_help: { status: "emerging", source: "reported" },
        walking_alone: { status: "not_yet", source: "reported" },
      },
    });
    expect(tally).toEqual({ achieved: 2, emerging: 1, notYet: 1, notAssessed: 2, reportedOnly: 2 });
  });
});

describe("comparePedsExams", () => {
  const before: PedsFindings = {
    milestones: {
      sitting_without_support: { status: "emerging", source: "seen" },
      standing_with_help: { status: "achieved", firstSeenOn: "2026-06-01", source: "reported" },
      walking_with_help: { status: "achieved", firstSeenOn: "2026-06-01", source: "seen" },
      standing_alone: { status: "not_yet" },
    },
    gmfcsLevel: 3,
    equipment: "Ankle splints",
  };

  it("reports a milestone moving along as better, back as worse, and a report now seen as changed", () => {
    const now: PedsFindings = {
      milestones: {
        sitting_without_support: { status: "achieved", firstSeenOn: "2026-09-01", source: "seen" },
        standing_with_help: { status: "achieved", firstSeenOn: "2026-06-01", source: "seen" },
        walking_with_help: { status: "emerging", source: "seen" },
        standing_alone: { status: "not_yet" },
      },
      gmfcsLevel: 2,
      equipment: "Ankle splints and a walker",
    };
    const changes = comparePedsExams(now, before);
    expect(changes).toEqual([
      { id: "milestone.sitting_without_support", label: "Sitting without support", from: "Emerging", to: "Achieved", direction: "better" },
      {
        id: "milestone.standing_with_help.source",
        label: "Standing with help: who saw it",
        from: "Parent reports",
        to: "Seen by the physiotherapist",
        direction: "changed",
      },
      { id: "milestone.walking_with_help", label: "Walking with help", from: "Achieved", to: "Emerging", direction: "worse" },
      { id: "gmfcs", label: "GMFCS level", from: "Level III", to: "Level II", direction: "changed" },
      { id: "equipment", label: "Orthoses and equipment", from: "Ankle splints", to: "Ankle splints and a walker", direction: "changed" },
    ]);
  });

  it("words each change in the clinician's voice, and the parent's for a status move", () => {
    const c = (id: string, label: string, from: string, to: string, direction: "better" | "worse" | "changed") => ({ id, label, from, to, direction });
    expect(describePedsChange(c("milestone.crawling", "Hands-and-knees crawling", "Emerging", "Achieved", "better"), "clinician")).toBe(
      "Hands-and-knees crawling: emerging \u2192 achieved"
    );
    expect(
      describePedsChange(
        c("milestone.sitting_without_support.source", "Sitting without support: who saw it", "Parent reports", "Seen by the physiotherapist", "changed"),
        "clinician"
      )
    ).toBe("Sitting without support: now seen by the physiotherapist (was parent report)");
    expect(describePedsChange(c("gmfcs", "GMFCS level", "Level III", "Level II", "changed"), "clinician")).toBe("GMFCS level: Level III \u2192 Level II");
    expect(describePedsChange(c("milestone.crawling", "Hands-and-knees crawling", "Emerging", "Achieved", "better"), "patient")).toBe(
      "Hands-and-knees crawling: emerging to achieved (progress)"
    );
  });

  it("never reports a finding new to this exam against a blank", () => {
    const now: PedsFindings = {
      milestones: { walking_alone: { status: "achieved", firstSeenOn: "2026-10-01", source: "seen" } },
    };
    expect(comparePedsExams(now, before)).toEqual([]);
    expect(comparePedsExams(before, before)).toEqual([]);
  });
});

describe("describePedsExamForText", () => {
  it("prints each assessed milestone with its source, names the ones not assessed, then the rest", () => {
    const lines = describePedsExamForText(
      {
        milestones: {
          sitting_without_support: { status: "achieved", firstSeenOn: "2026-01-10", source: "reported" },
          walking_alone: { status: "not_yet" },
        },
        gmfcsLevel: 1,
        equipment: "Splints",
        notes: "Loves the ball",
      },
      { achievedAgeLabel: (key) => (key === "sitting_without_support" ? "7.3 months corrected" : null) }
    );
    expect(lines[0]).toBe("Movement milestones (WHO):");
    expect(lines[1]).toBe("  Sitting without support: Achieved, first seen 10 Jan 2026, at 7.3 months corrected, parent reports");
    expect(lines[2]).toBe("  Walking alone: Not yet");
    expect(lines[3]).toMatch(/^Not assessed: Hands-and-knees crawling, Standing with help, Walking with help, Standing alone$/);
    expect(lines).toContain("GMFCS: Level I (walks without limitations)");
    expect(lines).toContain("Orthoses and equipment: Splints");
    expect(lines).toContain("Notes: Loves the ball");
  });
});

describe("parsePedsAssessments", () => {
  it("orders newest first and parses each row's findings", () => {
    const parsed = parsePedsAssessments([
      { id: "a", created_at: "2026-09-01T05:00:00Z", submitted_by: "t1", submitted_by_role: "therapist", schema_version: 1, findings: { gmfcsLevel: 2 } },
      { id: "b", created_at: "2026-10-01T05:00:00Z", submitted_by_role: "admin", schema_version: 1, findings: { notes: "Second" } },
    ]);
    expect(parsed.map((p) => p.id)).toEqual(["b", "a"]);
    expect(parsed[0]).toMatchObject({ submittedBy: null, submittedByRole: "admin", findings: { milestones: {}, notes: "Second" } });
    expect(parsed[1].findings.gmfcsLevel).toBe(2);
  });
});

describe("a rough date first seen (approximate)", () => {
  const reported = { status: "achieved", firstSeenOn: "2026-03-01", source: "reported", approximate: true } as const;

  it("is kept for a parent's report with a date", () => {
    const f = ok({ milestones: { sitting_without_support: reported } });
    expect(f.milestones.sitting_without_support).toEqual(reported);
  });

  it("is dropped when false, so an exact date and an old row read the same", () => {
    const f = ok({ milestones: { sitting_without_support: { ...reported, approximate: false } } });
    expect(f.milestones.sitting_without_support).toEqual({ status: "achieved", firstSeenOn: "2026-03-01", source: "reported" });
    expect("approximate" in f.milestones.sitting_without_support!).toBe(false);
  });

  it("is refused on a date the physiotherapist saw: a seen date is exact", () => {
    expect(refused({ milestones: { sitting_without_support: { ...reported, source: "seen" } } })).toMatch(/only a date the family reports/);
  });

  it("is refused with no date, and when it is not a boolean", () => {
    expect(
      refused({ milestones: { hands_knees_crawling: { status: "emerging", source: "reported", approximate: true } } })
    ).toMatch(/needs a date/);
    expect(refused({ milestones: { sitting_without_support: { ...reported, approximate: "yes" } } })).toMatch(/yes or no/);
  });

  it("still gets the date checks: a rough date cannot be in the future or before birth", () => {
    expect(refused({ milestones: { sitting_without_support: { ...reported, firstSeenOn: "2026-11-01" } } })).toMatch(/future/);
    expect(refused({ milestones: { sitting_without_support: { ...reported, firstSeenOn: "2025-01-01" } } })).toMatch(/before the child's date of birth/);
  });

  it("is read back from a stored row, and an old row without it is still valid", () => {
    const stored = readStoredPedsFindings({ milestones: { sitting_without_support: reported, standing_alone: { status: "achieved", firstSeenOn: "2026-08-01", source: "seen" } } });
    expect(stored.milestones.sitting_without_support?.approximate).toBe(true);
    expect(stored.milestones.standing_alone?.approximate).toBeUndefined();
  });

  it("is said as 'about' in the PDF lines, and only when it is", () => {
    const lines = describePedsExamForText({
      milestones: { sitting_without_support: reported, standing_alone: { status: "achieved", firstSeenOn: "2026-08-01", source: "seen" } },
    });
    expect(lines.find((l) => l.includes("Sitting"))).toMatch(/first seen about /);
    expect(lines.find((l) => l.includes("Standing alone"))).not.toMatch(/about/);
  });

  it("is not a change by itself: a firmer date for the same finding is not progress", () => {
    const rough = { milestones: { sitting_without_support: reported } };
    const exact = { milestones: { sitting_without_support: { status: "achieved" as const, firstSeenOn: "2026-03-01", source: "reported" as const } } };
    expect(comparePedsExams(exact, rough)).toEqual([]);
  });
});
