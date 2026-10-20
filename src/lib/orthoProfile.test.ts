import { describe, expect, it } from "vitest";
import { buildMeasureSeries, type MeasurementPoint, type MilestoneTarget } from "@/lib/outcomeSeries";
import { computeProfileStatus } from "@/lib/profileStatus";
import type { PainAssessmentRow } from "@/lib/painMap";
import {
  areaProgress,
  firstAssessmentsByRegionSide,
  kneeStraightening,
  latestReviewAt,
  orthoSeries,
  orthoStatusInput,
  painMapSeries,
  pickKneeBend,
  pickLegStrength,
  standSummary,
  straighteningText,
} from "@/lib/orthoProfile";

let n = 0;
function point(over: Partial<MeasurementPoint> & Pick<MeasurementPoint, "measureKey" | "value" | "measuredAt">): MeasurementPoint {
  n += 1;
  return {
    id: `m${n}`,
    patientId: "p",
    appointmentId: null,
    variant: null,
    side: null,
    items: null,
    conditions: { setting: "in_person" },
    recordedBy: "t1",
    recordedByRole: "therapist",
    createdAt: over.measuredAt,
    schemaVersion: 1,
    ...over,
  };
}

const pain = (region: string, side: string, percent: number, at: string): PainAssessmentRow => ({ region, side, pain_percent: percent, created_at: at });

const DAY1 = "2026-08-01T05:00:00.000Z";
const DAY2 = "2026-08-15T05:00:00.000Z";
const DAY3 = "2026-09-12T05:00:00.000Z";

const exams = [
  pain("knee", "right", 70, DAY1),
  pain("lower_back", "na", 40, DAY1),
  pain("knee", "right", 50, DAY2),
  pain("lower_back", "na", 40, DAY2),
  pain("knee", "right", 30, DAY3),
  pain("lower_back", "na", 20, DAY3),
];

describe("painMapSeries", () => {
  it("draws overall pain after each exam on a 0-10 scale", () => {
    const s = painMapSeries(exams)!;
    expect(s.measureKey).toBe("pain_nprs");
    expect(s.points.map((p) => p.value)).toEqual([5.5, 4.5, 2.5]);
    expect(s.better).toBe("lower");
    expect(s.decimals).toBe(1);
  });
  it("is null with no exam, and replaces any pain line from the table", () => {
    expect(painMapSeries([])).toBeNull();
    const table = buildMeasureSeries([point({ measureKey: "lefs", value: 40, measuredAt: DAY1 })], { profileKind: "ortho" });
    expect(orthoSeries(table, [])).toEqual(table);
    expect(orthoSeries(table, exams)[0].measureKey).toBe("pain_nprs");
    expect(orthoSeries(table, exams)).toHaveLength(2);
  });
});

describe("body map views", () => {
  it("keeps the earliest row per area", () => {
    const first = firstAssessmentsByRegionSide([...exams].reverse());
    expect(first).toHaveLength(2);
    expect(first.find((a) => a.region === "knee")!.pain_percent).toBe(70);
  });
  it("builds a first/now/change card per area, worst now first", () => {
    const cards = areaProgress(exams);
    expect(cards.map((c) => c.label)).toEqual(["Knee (right)", "Lower back"]);
    expect(cards[0]).toMatchObject({ firstText: "7/10", nowText: "3/10", change: "better", changeText: "Down 4 points" });
    expect(cards[1]).toMatchObject({ change: "better", changeText: "Down 2 points" });
  });
  it("says so when an area was examined once", () => {
    const cards = areaProgress([pain("knee", "left", 60, DAY1)]);
    expect(cards[0]).toMatchObject({ change: "only_one", changeText: "Not re-scored yet" });
  });
  it("names a worse and an unchanged area", () => {
    const c = areaProgress([pain("knee", "left", 20, DAY1), pain("knee", "left", 30, DAY2), pain("hip", "right", 40, DAY1), pain("hip", "right", 40, DAY2)]);
    expect(c.find((x) => x.label.startsWith("Knee"))).toMatchObject({ change: "worse", changeText: "Up 1 point" });
    expect(c.find((x) => x.label.startsWith("Hip"))).toMatchObject({ change: "same", changeText: "No change" });
  });
});

describe("the two visuals", () => {
  const points = [
    point({ measureKey: "joint_range", variant: "knee_flexion_active", side: "right", value: 85, measuredAt: DAY1 }),
    point({ measureKey: "joint_range", variant: "knee_flexion_active", side: "right", value: 122, measuredAt: DAY3 }),
    point({ measureKey: "joint_range", variant: "knee_flexion_passive", side: "right", value: 100, measuredAt: DAY2 }),
    point({ measureKey: "joint_range", variant: "knee_extension_passive", side: "right", value: -3, measuredAt: DAY1 }),
    point({ measureKey: "joint_range", variant: "knee_extension_passive", side: "right", value: 0, measuredAt: DAY3 }),
    point({ measureKey: "joint_range", variant: "knee_extension_active", side: "right", value: -8, measuredAt: DAY1 }),
    point({ measureKey: "joint_range", variant: "knee_extension_active", side: "right", value: 0, measuredAt: DAY3 }),
    point({ measureKey: "strength_symmetry", variant: "quadriceps", side: "right", value: 60, measuredAt: DAY1 }),
    point({ measureKey: "strength_symmetry", variant: "quadriceps", side: "right", value: 78, measuredAt: DAY3 }),
    point({ measureKey: "lefs", value: 40, measuredAt: DAY1 }),
    point({ measureKey: "lefs", value: 58, measuredAt: DAY3 }),
  ];
  const series = buildMeasureSeries(points, { profileKind: "ortho" });
  const milestone = (over: Partial<MilestoneTarget>): MilestoneTarget => ({
    id: "ms1",
    linkedMeasureKey: null,
    linkedVariant: null,
    linkedSide: null,
    targetValue: null,
    sortOrder: 1,
    status: "planned",
    reachedAt: null,
    ...over,
  });

  it("picks the newest knee-bend line and its goal", () => {
    const knee = pickKneeBend(series, [milestone({ linkedMeasureKey: "joint_range", linkedVariant: "knee_flexion_active", linkedSide: "right", targetValue: 135 })])!;
    expect(knee).toMatchObject({ mode: "active", side: "right", first: 85, now: 122, goal: 135, goalReached: false });
    expect(pickKneeBend([], [])).toBeNull();
  });
  it("prefers active on a tie and ignores extension lines", () => {
    const tie = buildMeasureSeries(
      [
        point({ measureKey: "joint_range", variant: "knee_flexion_passive", side: "left", value: 100, measuredAt: DAY1 }),
        point({ measureKey: "joint_range", variant: "knee_flexion_active", side: "left", value: 90, measuredAt: DAY1 }),
      ],
      { profileKind: "ortho" }
    );
    expect(pickKneeBend(tie, [])!.mode).toBe("active");
  });
  it("picks leg strength with the registry's 90% unless the plan sets one", () => {
    expect(pickLegStrength(series, [])).toMatchObject({ now: 78, first: 60, goal: 90, goalIsMilestone: false, group: "Thigh, front (quadriceps)" });
    const planned = pickLegStrength(series, [milestone({ linkedMeasureKey: "strength_symmetry", linkedVariant: "quadriceps", linkedSide: "right", targetValue: 85 })])!;
    expect(planned).toMatchObject({ goal: 85, goalIsMilestone: true });
  });
  it("derives the extension lag from active against passive", () => {
    const k = kneeStraightening(series, "right")!;
    expect(k.passive).toEqual({ now: 0, first: -3 });
    expect(k.active).toEqual({ now: 0, first: -8 });
    expect(k.lag).toEqual({ now: 0, first: 5 });
    expect(kneeStraightening(series, "left")).toBeNull();
  });
  it("has no lag until both lines exist", () => {
    const only = buildMeasureSeries([point({ measureKey: "joint_range", variant: "knee_extension_active", side: "right", value: -8, measuredAt: DAY1 })], { profileKind: "ortho" });
    expect(kneeStraightening(only, "right")!.lag).toBeNull();
  });
  it("words straightening with its sign", () => {
    expect(straighteningText(0)).toBe("0° (straight)");
    expect(straighteningText(-8)).toBe("-8° (8° short of straight)");
    expect(straighteningText(3)).toBe("+3° (past straight)");
  });
  it("summarises the numbers in the viewer's voice and says nothing for an empty record", () => {
    const all = orthoSeries(series, exams);
    expect(standSummary(all, [], "patient")).toBe(
      "Your pain is down from 5.5 to 2.5 out of 10. The right knee now bends to 122°. Your right leg strength is 78% of the other side (goal 90%). Everyday tasks with the legs score 58 out of 80 (it was 40)."
    );
    expect(standSummary(all, [], "clinician")).toMatch(/^Overall pain is down/);
    expect(standSummary([], [], "patient")).toBeNull();
  });
  it("finds the newest review across lines", () => {
    expect(latestReviewAt(orthoSeries(series, exams))).toBe(DAY3);
    expect(latestReviewAt([])).toBeNull();
  });
});

describe("the status input", () => {
  it("uses the pain line and the rule calls a fall from 5.5 to 2.5 improving", () => {
    const input = orthoStatusInput(orthoSeries([], exams));
    expect(input.main!.measureKey).toBe("pain_nprs");
    expect(computeProfileStatus(input).status).toBe("improving");
  });
  it("falls back to the recorded line with the most reviews, and to nothing", () => {
    const s = buildMeasureSeries(
      [
        point({ measureKey: "lefs", value: 40, measuredAt: DAY1 }),
        point({ measureKey: "lefs", value: 58, measuredAt: DAY3 }),
        point({ measureKey: "strength_symmetry", variant: "quadriceps", side: "right", value: 60, measuredAt: DAY1 }),
      ],
      { profileKind: "ortho" }
    );
    expect(orthoStatusInput(s).main!.measureKey).toBe("lefs");
    expect(computeProfileStatus(orthoStatusInput([])).status).toBe("unknown");
  });
});
