import { describe, expect, it } from "vitest";
import {
  checkGoalDraft,
  checkMilestoneDraft,
  draftFromMilestone,
  draftFromTemplate,
  emptyMilestoneDraft,
  linkSummary,
  linkableMeasures,
  milestoneInputFromDraft,
  needsProof,
  nextSortOrder,
  proofCandidates,
  suggestedBaseline,
  unusedTemplates,
} from "@/lib/milestonePlanner";
import type { CareMilestone } from "@/lib/careGoals";
import { milestoneTemplatesFor } from "@/lib/milestoneTemplates";
import type { MeasurementPoint } from "@/lib/outcomeSeries";

const none = new Set<string>();

const milestone = (over: Partial<CareMilestone> = {}): CareMilestone => ({
  id: "m1",
  goalId: "g1",
  patientId: "p1",
  title: "Knee bends to 125",
  criterion: "Bends to 125 degrees",
  phase: "Restore movement",
  status: "working",
  reachedAt: null,
  reachedMeasurementId: null,
  targetDate: null,
  sortOrder: 1,
  linkedMeasureKey: "joint_range",
  linkedVariant: "knee_flexion_active",
  linkedSide: "right",
  targetValue: 125,
  baselineValue: 85,
  templateKey: null,
  authoredBy: "t",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...over,
});

const point = (over: Partial<MeasurementPoint>): MeasurementPoint => ({
  id: "x",
  patientId: "p1",
  appointmentId: null,
  measureKey: "joint_range",
  variant: "knee_flexion_active",
  side: "right",
  value: 100,
  items: null,
  conditions: { setting: "in_person" },
  recordedBy: "t",
  recordedByRole: "therapist",
  measuredAt: "2026-10-01T00:00:00.000Z",
  createdAt: "2026-10-01T00:00:00.000Z",
  schemaVersion: 1,
  ...over,
});

describe("drafts", () => {
  it("round-trips a milestone through a draft", () => {
    const m = milestone();
    const input = milestoneInputFromDraft(draftFromMilestone(m));
    expect(input).toMatchObject({
      title: "Knee bends to 125",
      linkedMeasureKey: "joint_range",
      linkedVariant: "knee_flexion_active",
      linkedSide: "right",
      targetValue: 125,
      baselineValue: 85,
      status: "working",
      templateKey: null,
    });
  });

  it("sends nothing for a measure link that was not chosen", () => {
    const d = { ...emptyMilestoneDraft(3), title: "Walk without a limp", criterion: "Even steps over 100 m", targetText: "5", linkedVariant: "x", linkedSide: "left" as const };
    const input = milestoneInputFromDraft(d);
    expect(input).toMatchObject({ linkedMeasureKey: null, linkedVariant: null, linkedSide: null, targetValue: null, baselineValue: null });
  });

  it("starts from a template as an editable planned draft", () => {
    const t = milestoneTemplatesFor("ortho")[0];
    const d = draftFromTemplate(t, 4);
    expect(d).toMatchObject({ title: t.title, criterion: t.criterion, status: "planned", templateKey: t.key, sortOrder: 4, targetDate: "" });
  });

  it("offers only templates not already in the plan", () => {
    const all = milestoneTemplatesFor("ortho");
    const left = unusedTemplates("ortho", [{ templateKey: all[0].key }]);
    expect(left.map((t) => t.key)).not.toContain(all[0].key);
    expect(left).toHaveLength(all.length - 1);
  });

  it("orders a new milestone after the last", () => {
    expect(nextSortOrder([])).toBe(1);
    expect(nextSortOrder([{ sortOrder: 2 }, { sortOrder: 7 }])).toBe(8);
  });
});

describe("checkMilestoneDraft", () => {
  const ctx = { profileKind: "ortho" as const, existing: null, enabledLicensed: none };

  it("accepts every starter template for every kind as an unedited draft", () => {
    for (const kind of ["ortho", "neuro", "neuro_parkinsons", "pediatrics", "geriatric", "cardiopulmonary"] as const) {
      for (const t of milestoneTemplatesFor(kind)) {
        const d = draftFromTemplate(t, 1);
        // A sided or varianted link needs the clinician's choice before it can save.
        const checked = checkMilestoneDraft(d, { profileKind: kind, existing: null, enabledLicensed: new Set(["oswestry"]) });
        if (!checked.ok) expect(checked.error).toMatch(/side|which one|starting point/);
      }
    }
  });

  it("names a missing side rather than saving a milestone the left knee could meet", () => {
    const d = { ...draftFromMilestone(milestone()), linkedSide: "" as const };
    const checked = checkMilestoneDraft(d, { ...ctx, existing: milestone() });
    expect(checked).toMatchObject({ ok: false });
    if (!checked.ok) expect(checked.error).toMatch(/side/);
  });

  it("asks for the starting point for a toward-normal target", () => {
    const d = { ...draftFromMilestone(milestone()), baselineText: "" };
    const checked = checkMilestoneDraft(d, { ...ctx, existing: milestone() });
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.error).toMatch(/starting point/);
  });

  it("says a typed target that is not a number is not a number", () => {
    const d = { ...draftFromMilestone(milestone()), targetText: "abc" };
    const checked = checkMilestoneDraft(d, { ...ctx, existing: milestone() });
    expect(checked.ok).toBe(false);
  });

  it("refuses a switched-off licensed scale", () => {
    const d = { ...emptyMilestoneDraft(1), title: "Back pain easier", criterion: "Oswestry under 20%", linkedMeasureKey: "oswestry", targetText: "20" };
    const off = checkMilestoneDraft(d, ctx);
    expect(off.ok).toBe(false);
    const on = checkMilestoneDraft(d, { ...ctx, enabledLicensed: new Set(["oswestry"]) });
    expect(on.ok).toBe(true);
  });

  it("needs a title and a criterion", () => {
    expect(checkMilestoneDraft(emptyMilestoneDraft(1), ctx).ok).toBe(false);
  });
});

describe("checkGoalDraft", () => {
  it("trims and accepts a goal in the patient's own words", () => {
    expect(checkGoalDraft({ goalText: "  Play badminton again  ", targetDate: "2026-12-01" }, null)).toEqual({
      ok: true,
      goal: { goalText: "Play badminton again", targetDate: "2026-12-01" },
    });
  });
  it("refuses an empty goal and a bad date", () => {
    expect(checkGoalDraft({ goalText: "  ", targetDate: "" }, null).ok).toBe(false);
    expect(checkGoalDraft({ goalText: "Walk", targetDate: "01/12/2026" }, null).ok).toBe(false);
  });
});

describe("linkableMeasures", () => {
  it("skips measures with no direction a target can be met in", () => {
    const keys = linkableMeasures("neuro_parkinsons", { enabledLicensed: none }).map((l) => l.measure.key);
    expect(keys).not.toContain("hoehn_yahr");
    expect(keys).toContain("tug");
  });
  it("marks a measure the Pain Map holds and lists a switched-off licence with its reason", () => {
    const list = linkableMeasures("ortho", { enabledLicensed: none });
    expect(list.find((l) => l.measure.key === "pain_nprs")).toMatchObject({ heldElsewhere: true, selectable: true });
    expect(list.find((l) => l.measure.key === "oswestry")).toMatchObject({ selectable: false });
    expect(list.find((l) => l.measure.key === "oswestry")!.reason).toMatch(/licence/);
  });
  it("says it could not check when the switch was unreadable", () => {
    const list = linkableMeasures("ortho", { enabledLicensed: none, licenceUnreadable: true });
    expect(list.find((l) => l.measure.key === "oswestry")!.reason).toMatch(/couldn't check/);
  });
});

describe("proof", () => {
  it("needs a proving measurement only for a target on a measure stored here", () => {
    expect(needsProof(milestone(), "ortho")).toBe(true);
    expect(needsProof(milestone({ linkedMeasureKey: null, targetValue: null }), "ortho")).toBe(false);
    expect(needsProof(milestone({ linkedMeasureKey: "pain_nprs", targetValue: 2 }), "ortho")).toBe(false);
    expect(needsProof(milestone({ linkedMeasureKey: "joint_range", targetValue: null }), "ortho")).toBe(false);
  });

  it("offers only readings of exactly the line that meet the target, newest first", () => {
    const points = [
      point({ id: "a", value: 126, measuredAt: "2026-09-20T00:00:00.000Z" }),
      point({ id: "b", value: 130, measuredAt: "2026-10-05T00:00:00.000Z" }),
      point({ id: "c", value: 120 }),
      point({ id: "d", value: 140, side: "left" }),
      point({ id: "e", value: 140, variant: "knee_flexion_passive" }),
    ];
    expect(proofCandidates(milestone(), points).map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("finds none when no reading meets the target", () => {
    expect(proofCandidates(milestone(), [point({ value: 110 })])).toEqual([]);
  });
});

describe("suggestedBaseline", () => {
  it("is the newest reading of the line chosen", () => {
    const points = [
      point({ id: "a", value: 90, measuredAt: "2026-09-01T00:00:00.000Z" }),
      point({ id: "b", value: 104, measuredAt: "2026-10-01T00:00:00.000Z" }),
      point({ id: "c", value: 60, side: "left" }),
    ];
    expect(suggestedBaseline(points, { measureKey: "joint_range", variant: "knee_flexion_active", side: "right" })).toBe(104);
    expect(suggestedBaseline(points, { measureKey: "joint_range", variant: "knee_flexion_active", side: "left" })).toBe(60);
    expect(suggestedBaseline(points, { measureKey: "", variant: "", side: "" })).toBeNull();
    expect(suggestedBaseline([], { measureKey: "joint_range", variant: "knee_flexion_active", side: "right" })).toBeNull();
  });
});

describe("linkSummary", () => {
  it("names the line", () => {
    expect(linkSummary(milestone())).toMatch(/Goniometry|Joint|range/i);
    expect(linkSummary(milestone({ linkedMeasureKey: null }))).toBeNull();
  });
});
