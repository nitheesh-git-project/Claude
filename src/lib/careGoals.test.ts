import { describe, expect, it } from "vitest";
import {
  measurementProvesMilestone,
  milestoneFieldsToRow,
  parseCareGoalRow,
  parseCareMilestoneRow,
  readCalendarDate,
  shapeMilestones,
  validateGoalFields,
  validateMilestoneFields,
  type CareGoal,
  type CareMilestone,
} from "@/lib/careGoals";
import { parseMeasurementRows } from "@/lib/outcomeSeries";

const goalRow = {
  id: "g1",
  patient_id: "p1",
  profile_kind: "ortho",
  goal_text: "Play badminton with my friends on weekends again",
  target_date: "2026-12-01",
  status: "active",
  authored_by: "t1",
  authored_by_role: "therapist",
  created_at: "2026-09-01T05:00:00.000Z",
  updated_at: "2026-09-01T05:00:00.000Z",
};

const milestoneRow = {
  id: "ms1",
  goal_id: "g1",
  patient_id: "p1",
  title: "Bend the knee to 120 degrees",
  criterion: "Knee bends to 120 degrees or more, measured actively",
  phase: "Restore movement",
  linked_measure_key: "joint_range",
  linked_variant: "knee_flexion_active",
  linked_side: "right",
  target_value: "120",
  baseline_value: 90,
  status: "working",
  reached_at: null,
  reached_measurement_id: null,
  target_date: "2026-10-01",
  sort_order: 2,
  template_key: null,
  authored_by: "t1",
  created_at: "2026-09-01T05:00:00.000Z",
  updated_at: "2026-09-02T05:00:00.000Z",
};

describe("rows", () => {
  it("parses a goal and a milestone, numeric columns included", () => {
    const g = parseCareGoalRow(goalRow)!;
    expect(g).toMatchObject({ id: "g1", profileKind: "ortho", status: "active", targetDate: "2026-12-01" });
    const m = parseCareMilestoneRow(milestoneRow)!;
    expect(m).toMatchObject({ targetValue: 120, baselineValue: 90, linkedSide: "right", sortOrder: 2, status: "working" });
  });

  it("refuses a row it cannot trust", () => {
    expect(parseCareGoalRow({ ...goalRow, profile_kind: "cardiac" })).toBeNull();
    expect(parseCareGoalRow({ ...goalRow, status: "paused" })).toBeNull();
    expect(parseCareMilestoneRow({ ...milestoneRow, status: "done" })).toBeNull();
    expect(parseCareMilestoneRow(null)).toBeNull();
  });
});

describe("readCalendarDate", () => {
  it("takes a real day and refuses one that is not", () => {
    expect(readCalendarDate("2026-02-28", "d")).toEqual({ ok: true, value: "2026-02-28" });
    expect(readCalendarDate(null, "d")).toEqual({ ok: true, value: null });
    expect(readCalendarDate("", "d")).toEqual({ ok: true, value: null });
    expect(readCalendarDate("2026-02-31", "d").ok).toBe(false);
    expect(readCalendarDate("1/2/2026", "d").ok).toBe(false);
    expect(readCalendarDate("1900-01-01", "d").ok).toBe(false);
  });
});

describe("validateGoalFields", () => {
  const existing = parseCareGoalRow(goalRow) as CareGoal;

  it("creates an active goal in the patient's words", () => {
    const r = validateGoalFields({ goalText: "  Walk to the temple   without a stick ", targetDate: "2027-01-15" }, null);
    expect(r).toEqual({ ok: true, value: { goalText: "Walk to the temple without a stick", targetDate: "2027-01-15", status: "active" } });
  });

  it("refuses a new goal that is blank, too long, or not active", () => {
    expect(validateGoalFields({}, null).ok).toBe(false);
    expect(validateGoalFields({ goalText: "   " }, null).ok).toBe(false);
    expect(validateGoalFields({ goalText: "x".repeat(301) }, null).ok).toBe(false);
    expect(validateGoalFields({ goalText: "Walk again", status: "achieved" }, null).ok).toBe(false);
    expect(validateGoalFields({ goalText: "Walk again", colour: "red" }, null).ok).toBe(false);
  });

  it("edits only what was sent", () => {
    const r = validateGoalFields({ status: "achieved" }, existing);
    expect(r).toEqual({ ok: true, value: { goalText: existing.goalText, targetDate: "2026-12-01", status: "achieved" } });
    expect(validateGoalFields({ targetDate: null }, existing)).toMatchObject({ ok: true, value: { targetDate: null } });
    expect(validateGoalFields({ status: "paused" }, existing).ok).toBe(false);
  });
});

describe("validateMilestoneFields", () => {
  const ortho = { profileKind: "ortho" as const, existing: null };

  it("takes a milestone in words, planned by default", () => {
    const r = validateMilestoneFields({ title: "Walk without a limp", criterion: "Even steps over 100 m" }, ortho);
    expect(r).toMatchObject({ ok: true, value: { status: "planned", linkedMeasureKey: null, targetValue: null, sortOrder: 0 } });
  });

  it("checks a measured target against the registry", () => {
    const base = {
      title: "Bend the knee",
      criterion: "120 degrees",
      linkedMeasureKey: "joint_range",
      linkedVariant: "knee_flexion_active",
      linkedSide: "right",
      targetValue: 120,
      baselineValue: 90,
    };
    expect(validateMilestoneFields(base, ortho)).toMatchObject({ ok: true, value: { targetValue: 120, linkedSide: "right" } });
    expect(validateMilestoneFields({ ...base, linkedSide: null }, ortho)).toMatchObject({ ok: false, error: /which side/ });
    expect(validateMilestoneFields({ ...base, linkedVariant: "knee_flexion" }, ortho)).toMatchObject({ ok: false, error: /which one/ });
    // A joint range is "toward normal": without a starting point there is no way to know which way the target lies.
    expect(validateMilestoneFields({ ...base, baselineValue: null }, ortho)).toMatchObject({ ok: false, error: /starting point/ });
    expect(validateMilestoneFields({ ...base, targetValue: 500 }, ortho)).toMatchObject({ ok: false, error: /Target/ });
    expect(validateMilestoneFields({ ...base, linkedMeasureKey: "tug" }, ortho)).toMatchObject({ ok: false, error: /not used/ });
    expect(validateMilestoneFields({ title: "x", criterion: "y", targetValue: 3 }, ortho)).toMatchObject({
      ok: false,
      error: /needs a linked measure/,
    });
  });

  it("refuses a target on a measure with no direction, and a licensed one that is off", () => {
    const pd = { profileKind: "neuro_parkinsons" as const, existing: null };
    expect(
      validateMilestoneFields({ title: "Stage", criterion: "Stage 2", linkedMeasureKey: "hoehn_yahr", targetValue: 2 }, pd)
    ).toMatchObject({ ok: false, error: /no direction/ });
    const geri = { profileKind: "geriatric" as const, existing: null };
    const barthel = { title: "Independent", criterion: "Barthel 90", linkedMeasureKey: "barthel", targetValue: 90 };
    expect(validateMilestoneFields(barthel, geri)).toMatchObject({ ok: false, error: /licence/ });
    expect(validateMilestoneFields(barthel, { ...geri, enabledLicensed: new Set(["barthel"]) }).ok).toBe(true);
  });

  it("keeps phases and templates to the patient's own kind", () => {
    expect(validateMilestoneFields({ title: "a", criterion: "b", phase: "Restore movement" }, ortho).ok).toBe(true);
    expect(validateMilestoneFields({ title: "a", criterion: "b", phase: "Learn strategies" }, ortho).ok).toBe(false);
    expect(validateMilestoneFields({ title: "a", criterion: "b", templateKey: "ortho_pain_3_or_less" }, ortho).ok).toBe(true);
    expect(validateMilestoneFields({ title: "a", criterion: "b", templateKey: "pd_tug_under_11_5" }, ortho).ok).toBe(false);
  });

  it("never sets reached, which has its own action", () => {
    expect(validateMilestoneFields({ title: "a", criterion: "b", status: "reached" }, ortho)).toMatchObject({
      ok: false,
      error: /its own action/,
    });
    expect(validateMilestoneFields({ title: "a", criterion: "b", status: "working" }, ortho)).toMatchObject({
      ok: true,
      value: { status: "working" },
    });
  });

  it("merges an edit onto the stored plan, and a new measure drops the old one's details", () => {
    const existing = parseCareMilestoneRow(milestoneRow) as CareMilestone;
    const ctx = { profileKind: "ortho" as const, existing };
    expect(validateMilestoneFields({ status: "planned" }, ctx)).toMatchObject({
      ok: true,
      value: { title: existing.title, targetValue: 120, linkedSide: "right", status: "planned" },
    });
    // Switching to a measure in words only is fine once the old target goes with it.
    expect(validateMilestoneFields({ linkedMeasureKey: null }, ctx)).toMatchObject({
      ok: true,
      value: { linkedMeasureKey: null, targetValue: null, linkedVariant: null, linkedSide: null },
    });
    expect(validateMilestoneFields({ linkedMeasureKey: "lefs" }, ctx)).toMatchObject({ ok: true, value: { targetValue: null } });
    expect(validateMilestoneFields({ sortOrder: 1.5 }, ctx).ok).toBe(false);
  });

  it("maps fields to the columns it writes", () => {
    const r = validateMilestoneFields({ title: "a", criterion: "b" }, ortho);
    if (!r.ok) throw new Error(r.error);
    expect(Object.keys(milestoneFieldsToRow(r.value)).sort()).toEqual(
      [
        "baseline_value",
        "criterion",
        "linked_measure_key",
        "linked_side",
        "linked_variant",
        "phase",
        "sort_order",
        "status",
        "target_date",
        "target_value",
        "template_key",
        "title",
      ].sort()
    );
  });
});

describe("the proof of a reached milestone", () => {
  const ms = parseCareMilestoneRow(milestoneRow) as CareMilestone;
  const reading = { measureKey: "joint_range", variant: "knee_flexion_active", side: "right" as const, value: 121 };

  it("accepts exactly the linked line meeting the target", () => {
    expect(measurementProvesMilestone(ms, reading)).toEqual({ ok: true });
  });

  it("refuses another side, another variant, a short reading, or a milestone in words", () => {
    expect(measurementProvesMilestone(ms, { ...reading, side: "left" }).ok).toBe(false);
    expect(measurementProvesMilestone(ms, { ...reading, variant: "knee_flexion_passive" }).ok).toBe(false);
    expect(measurementProvesMilestone(ms, { ...reading, value: 119 })).toMatchObject({ ok: false, error: /does not meet/ });
    expect(measurementProvesMilestone({ ...ms, linkedMeasureKey: null, targetValue: null }, reading).ok).toBe(false);
  });

  it("reads lower-is-better targets the right way round", () => {
    const tug = { linkedMeasureKey: "tug", linkedVariant: null, linkedSide: null, targetValue: 12, baselineValue: null };
    expect(measurementProvesMilestone(tug, { measureKey: "tug", variant: null, side: null, value: 11.5 }).ok).toBe(true);
    expect(measurementProvesMilestone(tug, { measureKey: "tug", variant: null, side: null, value: 12.5 }).ok).toBe(false);
  });
});

describe("shapeMilestones", () => {
  it("derives progress and the proving reading, flags overdue, and orders the list", () => {
    const working = parseCareMilestoneRow(milestoneRow) as CareMilestone;
    const reached = parseCareMilestoneRow({
      ...milestoneRow,
      id: "ms0",
      linked_measure_key: null,
      linked_variant: null,
      linked_side: null,
      target_value: null,
      baseline_value: null,
      status: "reached",
      reached_at: "2026-09-10T05:00:00.000Z",
      sort_order: 1,
    }) as CareMilestone;
    const readings = parseMeasurementRows([
      {
        id: "r1",
        patient_id: "p1",
        appointment_id: null,
        measure_key: "joint_range",
        variant: "knee_flexion_active",
        side: "right",
        value: 122,
        items: null,
        conditions: { setting: "in_person" },
        recorded_by: "t1",
        recorded_by_role: "therapist",
        measured_at: "2026-10-05T05:00:00.000Z",
        schema_version: 1,
        created_at: "2026-10-05T05:00:00.000Z",
      },
    ]);
    const views = shapeMilestones([working, reached], readings, Date.parse("2026-10-20T05:00:00.000Z"));
    expect(views.map((v) => v.milestone.id)).toEqual(["ms0", "ms1"]);
    expect(views[1].derived.canMarkReached).toBe(true);
    expect(views[1].derived.provedBy?.id).toBe("r1");
    expect(views[1].overdue).toBe(true);
    expect(views[0].derived.status).toBe("reached");
    expect(views[0].overdue).toBe(false);
  });
});
