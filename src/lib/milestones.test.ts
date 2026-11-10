import { describe, expect, it } from "vitest";
import {
  MILESTONE_TEMPLATES,
  PHASES_BY_PROFILE_KIND,
  draftMilestoneFromTemplate,
  milestoneTemplatesFor,
} from "@/lib/milestoneTemplates";
import {
  criterionDirection,
  deriveMilestone,
  isCriterionMet,
  isMilestoneOverdue,
  isMilestoneStatus,
  latestReadingFor,
  milestoneCounts,
  milestoneProgressPercent,
  sortMilestones,
  type MeasurementReading,
  type MilestoneRecord,
} from "@/lib/milestones";
import { PROFILE_KINDS, outcomeMeasure, validateMeasurementValue } from "@/lib/outcomeMeasures";

const base: MilestoneRecord = {
  status: "working",
  reachedAt: null,
  targetDate: "2026-11-02",
  sortOrder: 1,
  linkedMeasureKey: null,
  linkedVariant: null,
  linkedSide: null,
  targetValue: null,
  baselineValue: null,
};

const reading = (over: Partial<MeasurementReading>): MeasurementReading => ({
  id: "r1",
  measureKey: "six_minute_walk",
  variant: null,
  side: null,
  value: 300,
  measuredAt: "2026-10-01T10:00:00Z",
  ...over,
});

describe("milestone progress", () => {
  it("reproduces the mockups' bars when higher is better and the start is 0", () => {
    expect(milestoneProgressPercent({ direction: "higher", target: 5, current: 3 })).toBe(60);
    expect(milestoneProgressPercent({ direction: "higher", target: 5, current: 4 })).toBe(80);
    expect(milestoneProgressPercent({ direction: "higher", target: 30, current: 22 })).toBe(73);
    expect(milestoneProgressPercent({ direction: "higher", target: 150, current: 130 })).toBe(87);
  });

  it("measures from the baseline where there is one", () => {
    // Knee bend from 85 towards 125, now 122.
    expect(milestoneProgressPercent({ direction: "higher", target: 125, current: 122, baseline: 85 })).toBe(93);
  });

  it("needs a baseline for 'lower is better', and makes no figure up without one", () => {
    expect(milestoneProgressPercent({ direction: "lower", target: 11.5, current: 13 })).toBeNull();
    expect(milestoneProgressPercent({ direction: "lower", target: 11.5, current: 13, baseline: 16 })).toBe(67);
  });

  it("never draws a full bar on a criterion not yet met, and clamps to 0-100", () => {
    expect(milestoneProgressPercent({ direction: "higher", target: 1000, current: 999 })).toBe(99);
    expect(milestoneProgressPercent({ direction: "higher", target: 10, current: 12 })).toBe(100);
    expect(milestoneProgressPercent({ direction: "higher", target: 125, current: 80, baseline: 85 })).toBe(0);
    expect(milestoneProgressPercent({ direction: "lower", target: 3, current: 2, baseline: 7 })).toBe(100);
  });

  it("has no honest figure when the baseline is already past the target", () => {
    expect(milestoneProgressPercent({ direction: "higher", target: 5, current: 4, baseline: 6 })).toBeNull();
    expect(milestoneProgressPercent({ direction: "higher", target: 5, current: 7, baseline: 6 })).toBe(100);
  });

  it("meets a criterion at the target itself, in either direction", () => {
    expect(isCriterionMet("higher", 400, 400)).toBe(true);
    expect(isCriterionMet("lower", 11.5, 11.5)).toBe(true);
    expect(isCriterionMet("lower", 11.6, 11.5)).toBe(false);
  });
});

describe("criterionDirection", () => {
  it("follows the registry for higher and lower measures", () => {
    expect(criterionDirection("six_minute_walk", 400)).toBe("higher");
    expect(criterionDirection("tug", 11.5)).toBe("lower");
  });

  it("reads a toward-normal measure from where it started", () => {
    expect(criterionDirection("joint_range", 0, -8)).toBe("higher");
    expect(criterionDirection("joint_range", 125, 85)).toBe("higher");
    expect(criterionDirection("joint_range", 125)).toBeNull();
  });

  it("has no direction for a stage, an unknown measure or a bad target", () => {
    expect(criterionDirection("hoehn_yahr", 2)).toBeNull();
    expect(criterionDirection("nope", 2)).toBeNull();
    expect(criterionDirection("tug", Number.NaN)).toBeNull();
  });
});

describe("deriveMilestone", () => {
  const sixMinute: MilestoneRecord = { ...base, linkedMeasureKey: "six_minute_walk", targetValue: 400, baselineValue: 285 };

  it("works out progress from the newest matching reading", () => {
    const d = deriveMilestone(sixMinute, [
      reading({ id: "old", value: 300, measuredAt: "2026-09-01T10:00:00Z" }),
      reading({ id: "new", value: 360, measuredAt: "2026-10-01T10:00:00Z" }),
    ]);
    expect(d).toMatchObject({ status: "working", percent: 65, criterionMet: false, canMarkReached: false, provedBy: null });
    expect(d.latest?.id).toBe("new");
  });

  it("suggests 'reached' when the criterion is met, and names the proof -- it never writes it", () => {
    const d = deriveMilestone(sixMinute, [reading({ id: "proof", value: 410 })]);
    expect(d.status).toBe("working");
    expect(d.canMarkReached).toBe(true);
    expect(d.provedBy?.id).toBe("proof");
    expect(d.percent).toBe(100);
  });

  it("keeps a reached milestone reached, whatever a later reading says", () => {
    const d = deriveMilestone({ ...sixMinute, status: "reached", reachedAt: "2026-09-28T10:00:00Z" }, [reading({ value: 350 })]);
    expect(d).toMatchObject({ status: "reached", percent: 100, canMarkReached: false, criterionMet: false });
  });

  it("does not start a planned milestone just because a reading is partway there", () => {
    const d = deriveMilestone({ ...sixMinute, status: "planned" }, [reading({ value: 360 })]);
    expect(d.status).toBe("planned");
  });

  it("has no percentage or verdict with nothing linked or no reading yet", () => {
    expect(deriveMilestone(base)).toMatchObject({ percent: null, criterionMet: null, canMarkReached: false, latest: null });
    expect(deriveMilestone(sixMinute, [])).toMatchObject({ percent: null, criterionMet: null });
  });

  it("is met only by the same variant and side", () => {
    const knee: MilestoneRecord = {
      ...base,
      linkedMeasureKey: "joint_range",
      linkedVariant: "knee_flexion_active",
      linkedSide: "right",
      targetValue: 125,
      baselineValue: 85,
    };
    const readings = [
      reading({ id: "left", measureKey: "joint_range", variant: "knee_flexion_active", side: "left", value: 135 }),
      reading({ id: "passive", measureKey: "joint_range", variant: "knee_flexion_passive", side: "right", value: 130 }),
      reading({ id: "right", measureKey: "joint_range", variant: "knee_flexion_active", side: "right", value: 122 }),
    ];
    expect(latestReadingFor(knee, readings)?.id).toBe("right");
    expect(deriveMilestone(knee, readings)).toMatchObject({ percent: 93, canMarkReached: false });
  });
});

describe("overdue, counts and order", () => {
  // Midnight in the clinic's zone (IST, UTC+5:30) on 3 Nov.
  const clinicMidnight = Date.parse("2026-11-02T18:30:00Z");

  it("is overdue once the clinic's target day has ended, never once reached", () => {
    const working = { status: "working" as const, reachedAt: null, targetDate: "2026-11-02" };
    // 5:30 am IST on the 2nd is 00:00 UTC: still the target day in the clinic.
    expect(isMilestoneOverdue(working, Date.parse("2026-11-02T00:00:00Z"))).toBe(false);
    expect(isMilestoneOverdue(working, clinicMidnight - 1)).toBe(false);
    expect(isMilestoneOverdue(working, clinicMidnight)).toBe(true);
    expect(isMilestoneOverdue({ status: "reached", reachedAt: "2026-10-01", targetDate: "2026-10-02" }, clinicMidnight)).toBe(false);
    expect(isMilestoneOverdue({ status: "planned", reachedAt: null, targetDate: null }, clinicMidnight)).toBe(false);
    expect(isMilestoneOverdue({ status: "planned", reachedAt: null, targetDate: "soon" }, clinicMidnight)).toBe(false);
  });

  it("counts by status, with reached_at deciding reached", () => {
    expect(
      milestoneCounts([
        { status: "reached", reachedAt: "2026-08-24" },
        { status: "working", reachedAt: "2026-09-07" },
        { status: "working", reachedAt: null },
        { status: "planned", reachedAt: null },
        { status: "planned", reachedAt: null },
      ])
    ).toEqual({ reached: 2, working: 1, planned: 2 });
  });

  it("orders reached (oldest first), then working, then planned", () => {
    const list: MilestoneRecord[] = [
      { ...base, id: "planned-2", status: "planned", sortOrder: 6, targetDate: "2026-11-23" },
      { ...base, id: "working", status: "working", sortOrder: 4 },
      { ...base, id: "reached-late", status: "reached", reachedAt: "2026-09-28", sortOrder: 1 },
      { ...base, id: "planned-1", status: "planned", sortOrder: 5, targetDate: "2026-11-02" },
      { ...base, id: "reached-early", status: "reached", reachedAt: "2026-08-24", sortOrder: 3 },
      { ...base, id: "planned-undated", status: "planned", sortOrder: 6, targetDate: null },
    ];
    expect(sortMilestones(list).map((m) => m.id)).toEqual([
      "reached-early",
      "reached-late",
      "working",
      "planned-1",
      "planned-2",
      "planned-undated",
    ]);
    expect(list[0].id).toBe("planned-2");
  });

  it("knows its own statuses", () => {
    expect(isMilestoneStatus("working")).toBe(true);
    expect(isMilestoneStatus("done")).toBe(false);
  });
});

describe("milestone templates", () => {
  it("gives every profile kind at least six, in order, with unique keys", () => {
    expect(new Set(MILESTONE_TEMPLATES.map((t) => t.key)).size).toBe(MILESTONE_TEMPLATES.length);
    for (const kind of PROFILE_KINDS) {
      const list = milestoneTemplatesFor(kind);
      expect(list.length, kind).toBeGreaterThanOrEqual(6);
      expect(list.map((t) => t.order), kind).toEqual([...list.map((t) => t.order)].sort((a, b) => a - b));
    }
  });

  it("states a measurable criterion and a phase of its own kind on every template", () => {
    for (const t of MILESTONE_TEMPLATES) {
      expect(t.title.trim(), t.key).not.toBe("");
      expect(t.criterion.trim().length, t.key).toBeGreaterThan(5);
      expect(PHASES_BY_PROFILE_KIND[t.profileKind], t.key).toContain(t.phase);
    }
  });

  it("links only to a measure that exists, is used on that kind, and can hold the target", () => {
    for (const t of MILESTONE_TEMPLATES) {
      if (!t.linkedMeasureKey) {
        expect(t.targetValue, t.key).toBeUndefined();
        continue;
      }
      const m = outcomeMeasure(t.linkedMeasureKey);
      expect(m, t.key).not.toBeNull();
      expect(m!.profileKinds, t.key).toContain(t.profileKind);
      expect(t.targetValue, t.key).toBeDefined();
      expect(validateMeasurementValue(m!.key, t.targetValue).ok, t.key).toBe(true);
      if (m!.variants) expect(m!.variants.map((v) => v.key), t.key).toContain(t.linkedVariant);
      else expect(t.linkedVariant, t.key).toBeUndefined();
    }
  });

  it("gives every kind at least one milestone the maths can track", () => {
    for (const kind of PROFILE_KINDS) {
      expect(milestoneTemplatesFor(kind).some((t) => t.linkedMeasureKey), kind).toBe(true);
    }
  });

  it("drafts a planned milestone with no date and no side", () => {
    const t = MILESTONE_TEMPLATES.find((x) => x.key === "ortho_knee_bends_125")!;
    expect(draftMilestoneFromTemplate(t)).toEqual({
      title: t.title,
      criterion: t.criterion,
      status: "planned",
      linkedMeasureKey: "joint_range",
      linkedVariant: "knee_flexion_active",
      targetValue: 125,
      sortOrder: t.order,
      templateKey: t.key,
    });
  });
});
