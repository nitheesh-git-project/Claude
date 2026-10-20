import { describe, expect, it } from "vitest";
import {
  affectedParts,
  examOwnedKeys,
  fallsInWindow,
  filledInLine,
  freezingBars,
  freezingDiaryPoints,
  freezingTriggers,
  graphSeries,
  neuroExamSeries,
  neuroKeyTiles,
  neuroLastReviewAt,
  neuroSeries,
  neuroStandSummary,
  neuroStatusInput,
  newConfirmedFall,
  parkinsonStage,
  pickStateLine,
  symptomProfile,
  testedInOnTimeChip,
  walkingLadder,
  walkingSpeedZones,
} from "@/lib/neuroProfile";
import { emptyNeuroFindings, type ParsedNeuroAssessment } from "@/lib/neuroExam";
import { computeProfileStatus } from "@/lib/profileStatus";
import { buildMeasureSeries, parseMeasurementRows, type OutcomeMeasurementRow } from "@/lib/outcomeSeries";
import type { DiaryEntry } from "@/lib/patientDiary";

// 2026-10-20 is a Tuesday; noon IST.
const NOW = Date.parse("2026-10-20T06:30:00Z");

const exam = (id: string, at: string, over: { berg?: number; tug?: number; walk?: number } = {}): ParsedNeuroAssessment => {
  const findings = emptyNeuroFindings();
  if (over.berg !== undefined) findings.balance.bergTotal = over.berg;
  if (over.tug !== undefined) findings.gait.tugSeconds = over.tug;
  if (over.walk !== undefined) findings.gait.tenMetreWalkSeconds = over.walk;
  return { id, createdAt: at, submittedByRole: "therapist", findings };
};

const row = (
  id: string,
  key: string,
  value: number,
  at: string,
  extra: { conditions?: Record<string, unknown>; items?: unknown; recordedBy?: string } = {}
): OutcomeMeasurementRow =>
  ({
    id,
    patient_id: "p1",
    appointment_id: null,
    measure_key: key,
    variant: null,
    side: null,
    value,
    items: extra.items ?? null,
    conditions: { setting: "in_person", ...(extra.conditions ?? {}) },
    recorded_by: extra.recordedBy ?? "t1",
    recorded_by_role: "therapist",
    measured_at: at,
    schema_version: 1,
    created_at: at,
  }) as OutcomeMeasurementRow;

const ON = { medicationState: "on", lastDoseAt: "2026-08-01T01:30:00.000Z" };
const OFF = { medicationState: "off", lastDoseAt: "2026-08-01T01:30:00.000Z" };

function diaryEntry(over: Partial<DiaryEntry>): DiaryEntry {
  return {
    id: over.id ?? "d1",
    patientId: "p1",
    kind: "fall",
    occurredAt: "2026-10-15T05:00:00Z",
    details: { injured: false },
    note: null,
    enteredBy: "p1",
    enteredByRole: "patient",
    confirmedBy: null,
    confirmedByRole: null,
    confirmedAt: null,
    createdAt: "2026-10-15T05:05:00Z",
    ...over,
  } as DiaryEntry;
}
const confirmedFall = (over: Partial<DiaryEntry> = {}) =>
  diaryEntry({ confirmedBy: "t1", confirmedByRole: "therapist", confirmedAt: "2026-10-16T05:00:00Z", ...over });

describe("the exam owns Berg, walking speed and TUG for a neurological record - and only there", () => {
  it("names the owned lines by profile kind", () => {
    expect(examOwnedKeys("neuro").sort()).toEqual(["berg_balance", "ten_metre_walk", "tug"]);
    // On Parkinson's the ON/OFF measurements are recorded, never read from the exam.
    expect(examOwnedKeys("neuro_parkinsons")).toEqual([]);
  });

  it("draws one point per exam, walking speed in m/s, and skips an exam that did not test a thing", () => {
    const exams = [
      exam("b", "2026-09-01T05:00:00Z", { berg: 41, walk: 12.5, tug: 20 }),
      exam("a", "2026-08-01T05:00:00Z", { berg: 28, walk: 25 }),
      exam("c", "2026-10-01T05:00:00Z", { walk: 10 }),
    ];
    const s = neuroExamSeries(exams, "neuro");
    const berg = s.find((l) => l.measureKey === "berg_balance")!;
    expect(berg.points.map((p) => p.value)).toEqual([28, 41]);
    const walk = s.find((l) => l.measureKey === "ten_metre_walk")!;
    expect(walk.points.map((p) => p.value)).toEqual([0.4, 0.8, 1]);
    expect(walk.unit).toBe("m/s");
    expect(s.find((l) => l.measureKey === "tug")!.points).toHaveLength(1);
    expect(neuroExamSeries(exams, "neuro_parkinsons")).toEqual([]);
  });

  it("never draws a measure from both stores: the recorded copy of an owned line is dropped", () => {
    const rows = parseMeasurementRows([
      row("1", "berg_balance", 30, "2026-08-01T05:00:00Z"),
      row("2", "fac", 2, "2026-08-01T05:00:00Z"),
    ]);
    const recorded = buildMeasureSeries(rows, { profileKind: "neuro" });
    const merged = neuroSeries({ recorded, exams: [exam("a", "2026-09-01T05:00:00Z", { berg: 41 })], kind: "neuro", diary: null, nowMs: NOW });
    const berg = merged.filter((l) => l.measureKey === "berg_balance");
    expect(berg).toHaveLength(1);
    expect(berg[0].points.map((p) => p.value)).toEqual([41]);
    expect(merged.some((l) => l.measureKey === "fac")).toBe(true);
  });

  it("keeps the stage out of the graph's tabs (it describes the condition)", () => {
    const rows = parseMeasurementRows([row("1", "hoehn_yahr", 2.5, "2026-08-01T05:00:00Z", { conditions: ON })]);
    const series = buildMeasureSeries(rows, { profileKind: "neuro_parkinsons" });
    expect(graphSeries(series)).toEqual([]);
  });
});

describe("the freezing line", () => {
  const diary = [
    diaryEntry({ id: "f1", kind: "freezing", occurredAt: "2026-09-28T05:00:00Z", details: { period: "week", count: 9 } }),
    diaryEntry({ id: "f2", kind: "freezing", occurredAt: "2026-10-06T05:00:00Z", details: { period: "week", count: 6 } }),
    // this week: not a finished count
    diaryEntry({ id: "f3", kind: "freezing", occurredAt: "2026-10-19T05:00:00Z", details: { period: "week", count: 1 } }),
  ];

  it("counts completed weeks somebody wrote in, never the week in progress or an empty week", () => {
    const points = freezingDiaryPoints(diary, NOW);
    expect(points.map((p) => p.value)).toEqual([9, 6]);
    expect(points.every((p) => p.recordedBy === "patient")).toBe(true);
  });

  it("is one point per clinic week: the therapist's own count stands over the diary's for that week", () => {
    const recorded = buildMeasureSeries(parseMeasurementRows([row("m1", "freezing_episodes", 7, "2026-09-29T05:00:00Z")]), { profileKind: "neuro_parkinsons" });
    const merged = neuroSeries({ recorded, exams: [], kind: "neuro_parkinsons", diary, nowMs: NOW });
    const line = merged.find((l) => l.measureKey === "freezing_episodes")!;
    expect(line.points.map((p) => p.value)).toEqual([7, 6]);
  });

  it("is not drawn on a record that is not Parkinson's, and is not a review", () => {
    const merged = neuroSeries({ recorded: [], exams: [], kind: "neuro", diary, nowMs: NOW });
    expect(merged).toEqual([]);
    const pd = neuroSeries({ recorded: [], exams: [exam("a", "2026-09-01T05:00:00Z", { berg: 40 })], kind: "neuro_parkinsons", diary, nowMs: NOW });
    expect(neuroLastReviewAt(pd)).toBeNull();
  });
});

describe("a new fall for the status rule", () => {
  const review = "2026-10-10T05:00:00Z";
  it("needs a confirmed fall after the last review", () => {
    expect(newConfirmedFall([confirmedFall({ occurredAt: "2026-10-14T05:00:00Z" })], review)).toBe(true);
    expect(newConfirmedFall([confirmedFall({ occurredAt: "2026-10-05T05:00:00Z" })], review)).toBe(false);
  });
  it("ignores a patient's unconfirmed report, which is shown but does not move the pill", () => {
    expect(newConfirmedFall([diaryEntry({ occurredAt: "2026-10-14T05:00:00Z" })], review)).toBe(false);
  });
  it("counts a clinician-recorded fall, and any confirmed fall when there has been no review", () => {
    expect(newConfirmedFall([diaryEntry({ enteredByRole: "therapist", occurredAt: "2026-10-14T05:00:00Z" })], review)).toBe(true);
    expect(newConfirmedFall([confirmedFall({ occurredAt: "2026-01-01T05:00:00Z" })], null)).toBe(true);
  });
  it("ignores near-misses", () => {
    expect(newConfirmedFall([confirmedFall({ kind: "near_miss", details: {} })], review)).toBe(false);
  });

  it("turns the pill to Needs attention only with a confirmed one", () => {
    const rows = parseMeasurementRows([
      row("1", "fac", 2, "2026-08-01T05:00:00Z"),
      row("2", "fac", 4, "2026-10-01T05:00:00Z"),
    ]);
    const series = buildMeasureSeries(rows, { profileKind: "neuro" });
    const status = (diary: DiaryEntry[]) =>
      computeProfileStatus(neuroStatusInput({ series, kind: "neuro", barthelEnabled: false, diary, lastReviewAt: "2026-10-01T05:00:00Z" })).status;
    expect(status([])).toBe("improving");
    expect(status([diaryEntry({ occurredAt: "2026-10-10T05:00:00Z" })])).toBe("improving");
    expect(status([confirmedFall({ occurredAt: "2026-10-10T05:00:00Z" })])).toBe("needs_attention");
  });
});

describe("the status rule's main measure", () => {
  it("is the Parkinson's ON line, never a line whose state was not recorded", () => {
    const rows = parseMeasurementRows([
      row("1", "tug", 14, "2026-08-01T05:00:00Z", { conditions: ON }),
      row("2", "tug", 11, "2026-09-01T05:00:00Z", { conditions: ON }),
      row("3", "tug", 20, "2026-09-02T05:00:00Z", { conditions: OFF }),
      row("4", "ten_metre_walk", 0.5, "2026-07-01T05:00:00Z"),
      row("5", "ten_metre_walk", 0.9, "2026-08-01T05:00:00Z"),
    ]);
    const series = buildMeasureSeries(rows, { profileKind: "neuro_parkinsons" });
    const input = neuroStatusInput({ series, kind: "neuro_parkinsons", barthelEnabled: false, diary: [], lastReviewAt: null });
    expect(input.main?.measureKey).toBe("tug");
    expect(input.main?.values).toEqual([14, 11]);
    const onlyUnrecorded = buildMeasureSeries(parseMeasurementRows([row("4", "ten_metre_walk", 0.5, "2026-07-01T05:00:00Z"), row("5", "ten_metre_walk", 0.9, "2026-08-01T05:00:00Z")]), { profileKind: "neuro_parkinsons" });
    expect(neuroStatusInput({ series: onlyUnrecorded, kind: "neuro_parkinsons", barthelEnabled: false, diary: [], lastReviewAt: null }).main).toBeNull();
  });

  it("leaves a licensed Barthel out while its licence is off", () => {
    const rows = parseMeasurementRows([row("1", "barthel", 45, "2026-08-01T05:00:00Z"), row("2", "barthel", 80, "2026-10-01T05:00:00Z"), row("3", "fac", 2, "2026-08-01T05:00:00Z")]);
    const series = buildMeasureSeries(rows, { profileKind: "neuro" });
    const off = neuroStatusInput({ series, kind: "neuro", barthelEnabled: false, diary: null, lastReviewAt: null });
    expect(off.main?.measureKey).toBe("fac");
    const on = neuroStatusInput({ series, kind: "neuro", barthelEnabled: true, diary: null, lastReviewAt: null });
    expect(on.main?.measureKey).toBe("barthel");
  });

  it("does not claim a fall check it could not make", () => {
    expect(neuroStatusInput({ series: [], kind: "neuro", barthelEnabled: false, diary: null, lastReviewAt: null })).toEqual({ main: null, newFall: false });
  });
});

describe("the four key numbers", () => {
  const baseline = "One";
  const tiles = (over: Partial<Parameters<typeof neuroKeyTiles>[0]> = {}) =>
    neuroKeyTiles({
      series: [],
      kind: "neuro",
      milestones: [],
      voice: "patient",
      barthelEnabled: false,
      intakeIndependence: [],
      diary: [],
      nowMs: NOW,
      baselineFalls: baseline,
      ...over,
    });

  it("is always four, and says 'Not yet' rather than leaving one out", () => {
    const t = tiles();
    expect(t).toHaveLength(4);
    expect(t.slice(0, 3).map((x) => x.valueText)).toEqual(["Not yet", "Not yet", "Not yet"]);
    expect(t[3].valueText).toBe("0");
    expect(tiles({ kind: "neuro_parkinsons" })).toHaveLength(4);
  });

  it("uses the intake's 0-10 independence unless the Barthel Index is licensed on and recorded", () => {
    const intake = [
      { date: "2026-08-01", value: 4 },
      { date: "2026-10-01", value: 7 },
    ];
    expect(tiles({ intakeIndependence: intake })[0].valueText).toBe("7 / 10");
    expect(tiles({ intakeIndependence: intake })[0].deltaText).toBe("Up 3 from 4");
    const rows = parseMeasurementRows([row("1", "barthel", 45, "2026-08-01T05:00:00Z"), row("2", "barthel", 80, "2026-10-01T05:00:00Z")]);
    const series = buildMeasureSeries(rows, { profileKind: "neuro" });
    expect(tiles({ series, barthelEnabled: true, intakeIndependence: intake })[0].valueText).toBe("80");
    expect(tiles({ series, barthelEnabled: false, intakeIndependence: intake })[0].valueText).toBe("7 / 10");
  });

  it("says 'Unavailable' for a source that could not be read, apart from 'Not yet'", () => {
    const t = tiles({ unavailable: new Set(["berg_balance", "independence-intake"]), diary: null });
    expect(t[0].valueText).toBe("Unavailable");
    expect(t[1].valueText).toBe("Unavailable");
    expect(t[3].valueText).toBe("Unavailable");
  });

  it("counts falls in the last three months and names what is not yet confirmed", () => {
    const d = [confirmedFall({ id: "a", occurredAt: "2026-10-01T05:00:00Z" }), diaryEntry({ id: "b", occurredAt: "2026-10-10T05:00:00Z" }), diaryEntry({ id: "c", occurredAt: "2025-01-01T05:00:00Z" })];
    const falls = tiles({ diary: d })[3];
    expect(falls.valueText).toBe("2");
    expect(falls.deltaText).toBe("1 confirmed, 1 you noted, not yet seen");
    expect(falls.deltaTone).toBe("bad");
    expect(tiles({ diary: d, voice: "clinician" })[3].deltaText).toBe("1 confirmed, 1 patient reported");
    const w = fallsInWindow(d, NOW);
    expect(w).toMatchObject({ falls: 2, confirmed: 1, patientReported: 1 });
  });

  it("shows the Parkinson's tiles in their ON line, labelled so", () => {
    const rows = parseMeasurementRows([
      row("1", "tug", 14.2, "2026-08-03T05:00:00Z", { conditions: ON }),
      row("2", "tug", 10.8, "2026-10-12T05:00:00Z", { conditions: ON }),
      row("3", "ten_metre_walk", 0.8, "2026-10-12T05:00:00Z", { conditions: ON }),
    ]);
    const series = buildMeasureSeries(rows, { profileKind: "neuro_parkinsons" });
    const t = tiles({ series, kind: "neuro_parkinsons" });
    expect(t.map((x) => x.label)).toEqual(["Up-and-go (ON)", "Feet getting stuck, per week", "Walking speed (ON)", "Falls, last 3 months"]);
    expect(t[0].valueText).toBe("10.8 s");
  });
});

describe("the generated sentences", () => {
  it("are built from the numbers and mention falls only when the diary was read", () => {
    const exams = [exam("a", "2026-08-01T05:00:00Z", { berg: 28, walk: 25 }), exam("b", "2026-10-01T05:00:00Z", { berg: 46, walk: 14 })];
    const series = neuroExamSeries(exams, "neuro");
    const base = { series, kind: "neuro" as const, voice: "patient" as const, barthelEnabled: false, intakeIndependence: [], nowMs: NOW };
    const text = neuroStandSummary({ ...base, diary: [] })!;
    expect(text).toMatch(/Your balance score has improved from 28 to 46 out of 56/);
    expect(text).toMatch(/above the fall-risk line of 45/);
    expect(text).toMatch(/Walking speed has improved from 0.4 m\/s to 0.71 m\/s/);
    expect(text).toMatch(/No falls are written down/);
    expect(neuroStandSummary({ ...base, diary: null })).not.toMatch(/falls/);
    expect(neuroStandSummary({ ...base, series: [], diary: null })).toBeNull();
  });
});

describe("the picture", () => {
  it("maps the intake's affected side to the limbs, and draws nothing for 'not sure'", () => {
    expect(affectedParts("Left side")).toMatchObject({ leftArm: true, leftLeg: true, rightArm: false, rightLeg: false });
    expect(affectedParts("Legs only")).toMatchObject({ leftLeg: true, rightLeg: true, leftArm: false });
    expect(affectedParts("Whole body")?.trunk).toBe(true);
    expect(affectedParts("Not sure")).toBeNull();
    expect(affectedParts("")).toBeNull();
    expect(affectedParts(undefined)).toBeNull();
  });

  it("builds the walking ladder from FAC and keeps the first reading only when it differs", () => {
    const rows = parseMeasurementRows([row("1", "fac", 2, "2026-08-01T05:00:00Z"), row("2", "fac", 4, "2026-10-01T05:00:00Z")]);
    const series = buildMeasureSeries(rows, { profileKind: "neuro" });
    const ladder = walkingLadder(series)!;
    expect(ladder.rungs).toHaveLength(6);
    expect(ladder).toMatchObject({ now: 4, first: 2 });
    const single = walkingLadder(buildMeasureSeries(rows.slice(0, 1), { profileKind: "neuro" }))!;
    expect(single.first).toBeNull();
    expect(walkingLadder([])).toBeNull();
  });

  it("puts walking speed in the exam's own three zones", () => {
    const series = neuroExamSeries([exam("a", "2026-08-01T05:00:00Z", { walk: 25 }), exam("b", "2026-10-01T05:00:00Z", { walk: 14 })], "neuro");
    const z = walkingSpeedZones(series)!;
    expect(z).toMatchObject({ now: 0.71, first: 0.4, nowBand: "limited" });
    expect(z.nowPercent).toBeGreaterThan(z.firstPercent!);
    expect(walkingSpeedZones([])).toBeNull();
  });

  it("prefers the ON line for a Parkinson's walking speed", () => {
    const rows = parseMeasurementRows([row("1", "ten_metre_walk", 0.5, "2026-08-01T05:00:00Z", { conditions: OFF }), row("2", "ten_metre_walk", 0.9, "2026-08-01T05:00:00Z", { conditions: ON }), row("3", "ten_metre_walk", 1, "2026-09-01T05:00:00Z", { conditions: ON })]);
    const series = buildMeasureSeries(rows, { profileKind: "neuro_parkinsons" });
    expect(pickStateLine(series, "ten_metre_walk")?.medicationState).toBe("on");
    expect(walkingSpeedZones(series)?.medicationState).toBe("on");
  });
});

describe("Parkinson's: symptoms, stage, freezing card", () => {
  it("draws the symptom profile only when the clinic's rating exists, in one state", () => {
    expect(symptomProfile([])).toBeNull();
    const points = parseMeasurementRows([
      row("1", "pd_symptom_rating", 12, "2026-08-03T05:00:00Z", { conditions: ON, items: [2, 3, 3, 2, 1, 1] }),
      row("2", "pd_symptom_rating", 9, "2026-10-12T05:00:00Z", { conditions: ON, items: [2, 2, 2, 1, 1, 1] }),
      row("3", "pd_symptom_rating", 20, "2026-10-13T05:00:00Z", { conditions: OFF, items: [3, 4, 4, 3, 3, 3] }),
    ]);
    const p = symptomProfile(points)!;
    expect(p.medicationState).toBe("on");
    expect(p.total).toEqual({ first: 12, now: 9 });
    expect(p.rows[0]).toEqual({ label: "Tremor", first: 2, now: 2 });
    expect(p.rows[2]).toEqual({ label: "Slowness", first: 3, now: 2 });
    // One rating only: no first to compare with.
    expect(symptomProfile(points.slice(0, 1))!.rows[0].first).toBeNull();
  });

  it("reads the stage as a fact with how long it has stood", () => {
    expect(parkinsonStage([])).toBeNull();
    const points = parseMeasurementRows([
      row("1", "hoehn_yahr", 2, "2026-01-01T05:00:00Z", { conditions: ON }),
      row("2", "hoehn_yahr", 2.5, "2026-03-01T05:00:00Z", { conditions: ON }),
      row("3", "hoehn_yahr", 2.5, "2026-10-01T05:00:00Z", { conditions: ON }),
    ]);
    const stage = parkinsonStage(points)!;
    expect(stage.value).toBe(2.5);
    expect(stage.since).toBe("2026-03-01T05:00:00Z");
    expect(stage.label).toMatch(/^2.5: both sides/);
  });

  it("draws twelve weeks of freezing with what is confirmed, and counts triggers", () => {
    const d = [
      diaryEntry({ id: "a", kind: "freezing", occurredAt: "2026-10-07T05:00:00Z", details: { period: "week", count: 5, trigger: "turning" } }),
      diaryEntry({ id: "b", kind: "freezing", occurredAt: "2026-10-14T05:00:00Z", details: { period: "day", count: 2, trigger: "doorway" }, confirmedBy: "t1", confirmedByRole: "therapist", confirmedAt: "2026-10-15T05:00:00Z" }),
      diaryEntry({ id: "c", kind: "freezing", occurredAt: "2026-10-15T05:00:00Z", details: { period: "episode", count: 1, trigger: "turning" } }),
      diaryEntry({ id: "e", kind: "freezing", occurredAt: "2026-10-16T05:00:00Z", details: { period: "episode", count: 1 } }),
    ];
    const bars = freezingBars(d, NOW);
    expect(bars).toHaveLength(12);
    const byWeek = Object.fromEntries(bars.map((b) => [b.weekStart, b]));
    expect(byWeek["2026-10-05"]).toMatchObject({ episodes: 5, written: true, confirmed: false, partial: false });
    // Mixed within a week: the week is only as confirmed as its weakest entry.
    expect(byWeek["2026-10-12"]).toMatchObject({ episodes: 4, written: true, confirmed: false });
    expect(byWeek["2026-10-19"].partial).toBe(true);
    expect(bars[0].written).toBe(false);
    expect(freezingTriggers(d, NOW)).toEqual([
      { trigger: "turning", label: "Turning round", episodes: 6 },
      { trigger: "doorway", label: "Doorways", episodes: 2 },
    ]);
  });

  it("claims 'Tested in ON time' only when every ON/OFF reading was ON, with the dose if recorded", () => {
    const points = parseMeasurementRows([
      row("1", "tug", 14, "2026-08-03T05:00:00Z", { conditions: { medicationState: "on", lastDoseAt: "2026-08-03T01:30:00.000Z" } }),
      row("2", "tug", 11, "2026-10-12T05:00:00Z", { conditions: { medicationState: "on", lastDoseAt: "2026-10-12T04:00:00.000Z" } }),
    ]);
    const series = buildMeasureSeries(points, { profileKind: "neuro_parkinsons" });
    expect(testedInOnTimeChip(series, points, () => "9:30 am")).toBe("Tested in ON time, about an hour after the 9:30 am dose");
    const mixed = parseMeasurementRows([...points.map((p) => row(p.id, p.measureKey, p.value, p.measuredAt, { conditions: p.conditions as Record<string, unknown> })), row("3", "tug", 20, "2026-10-13T05:00:00Z", { conditions: OFF })]);
    expect(testedInOnTimeChip(buildMeasureSeries(mixed, { profileKind: "neuro_parkinsons" }), mixed, () => "x")).toBeNull();
    expect(testedInOnTimeChip([], [], () => "x")).toBeNull();
  });
});

describe("filledInLine", () => {
  it("says who wrote the record by reader, and nothing when it is not known", () => {
    expect(filledInLine("therapist", "patient")).toBe("Filled in with your physiotherapist");
    expect(filledInLine("patient", "patient")).toBe("Filled in by you");
    expect(filledInLine("patient", "clinician")).toBe("Filled in by the patient");
    expect(filledInLine("admin", "clinician")).toBe("Filled in by the clinic");
    expect(filledInLine(null, "patient")).toBeNull();
    expect(filledInLine("", "clinician")).toBeNull();
  });
});
