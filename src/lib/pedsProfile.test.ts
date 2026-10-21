import { describe, expect, it } from "vitest";
import {
  intakeChecklist,
  milestoneCounts,
  milestoneSeries,
  pedsConditionLine,
  pedsEquipmentChips,
  pedsKeyTiles,
  pedsLastReviewAt,
  pedsSeries,
  pedsStandSummary,
  pedsStatusInput,
} from "@/lib/pedsProfile";
import { shapePedsView, type PedsReads } from "@/lib/pedsProfileView";
import {
  buildMeasureSeries,
  parseMeasurementRows,
  type OutcomeMeasurementRow,
} from "@/lib/outcomeSeries";
import { computeProfileStatus } from "@/lib/profileStatus";
import { outcomeMeasure } from "@/lib/outcomeMeasures";
import type { ParsedPedsAssessment, PedsFindings } from "@/lib/pedsExam";

const exam = (
  id: string,
  createdAt: string,
  findings: PedsFindings,
): ParsedPedsAssessment => ({
  id,
  createdAt,
  submittedBy: "t1",
  submittedByRole: "therapist",
  findings,
});

const EXAMS: ParsedPedsAssessment[] = [
  // newest first, as parsePedsAssessments returns them
  exam("c", "2026-10-15T06:00:00Z", {
    milestones: {
      standing_alone: {
        status: "achieved",
        firstSeenOn: "2026-10-10",
        source: "seen",
      },
    },
  }),
  exam("b", "2026-08-01T06:00:00Z", {
    milestones: {
      sitting_without_support: {
        status: "achieved",
        firstSeenOn: "2026-01-10",
        source: "seen",
      },
      hands_knees_crawling: {
        status: "achieved",
        firstSeenOn: "2026-03-02",
        source: "reported",
      },
      standing_with_help: { status: "emerging", source: "seen" },
    },
  }),
  exam("a", "2026-06-01T06:00:00Z", {
    milestones: {
      sitting_without_support: { status: "emerging", source: "reported" },
      walking_alone: { status: "not_yet" },
    },
  }),
  exam("gmfcs-only", "2026-05-01T06:00:00Z", { milestones: {}, gmfcsLevel: 2 }),
];

const row = (
  id: string,
  key: string,
  value: number,
  at: string,
): OutcomeMeasurementRow =>
  ({
    id,
    patient_id: "p1",
    measure_key: key,
    variant: null,
    side: null,
    value,
    items: null,
    conditions: {},
    recorded_by: "t1",
    measured_at: at,
    schema_version: 1,
    created_at: at,
    recorded_by_role: "therapist",
    appointment_id: `appt-${id}`,
  }) as unknown as OutcomeMeasurementRow;

describe("milestones achieved over time", () => {
  it("counts the achieved milestones as at each examination, oldest first, skipping an exam that assessed none", () => {
    expect(milestoneCounts(EXAMS).map((c) => [c.examId, c.achieved])).toEqual([
      ["a", 0],
      ["b", 2],
      ["c", 3],
    ]);
  });

  it("keeps a skill achieved when a later exam did not look at it, and lets a later finding win", () => {
    const back = [
      exam("2", "2026-09-01T00:00:00Z", {
        milestones: { sitting_without_support: { status: "not_yet" } },
      }),
      exam("1", "2026-08-01T00:00:00Z", {
        milestones: {
          sitting_without_support: {
            status: "achieved",
            firstSeenOn: "2026-02-01",
            source: "seen",
          },
        },
      }),
    ];
    expect(milestoneCounts(back).map((c) => c.achieved)).toEqual([1, 0]);
  });

  it("is a registry-known series the examination owns, never a recorded measurement", () => {
    const line = milestoneSeries(EXAMS)!;
    expect(line).toMatchObject({
      measureKey: "peds_milestones_achieved",
      known: true,
      joinPoints: true,
      unit: "of 6",
      better: "higher",
    });
    expect(line.points.map((p) => p.value)).toEqual([0, 2, 3]);
    expect(outcomeMeasure("peds_milestones_achieved")?.source).toBe(
      "peds_exam",
    );
    expect(milestoneSeries([])).toBeNull();
    expect(milestoneSeries([EXAMS[3]])).toBeNull();
  });

  it("is merged with the recorded lines in registry order", () => {
    const recorded = buildMeasureSeries(
      parseMeasurementRows([
        row("1", "peds_independent_steps", 2, "2026-09-01T06:00:00Z"),
        row("2", "peds_independent_steps", 5, "2026-10-01T06:00:00Z"),
        row("3", "peds_standing_seconds", 8, "2026-10-01T06:00:00Z"),
      ]),
      { profileKind: "pediatrics" },
    );
    const all = pedsSeries({ recorded, exams: EXAMS });
    expect(all.map((s) => s.measureKey)).toEqual([
      "peds_milestones_achieved",
      "peds_standing_seconds",
      "peds_independent_steps",
    ]);
    expect(pedsLastReviewAt(all, EXAMS)).toBe("2026-10-15T06:00:00Z");
  });
});

describe("the status rule on a paediatric record", () => {
  it("reads independent steps first, then standing, then milestones", () => {
    const recorded = buildMeasureSeries(
      parseMeasurementRows([
        row("1", "peds_independent_steps", 2, "2026-09-01T06:00:00Z"),
        row("2", "peds_independent_steps", 6, "2026-10-01T06:00:00Z"),
      ]),
      { profileKind: "pediatrics" },
    );
    const input = pedsStatusInput(pedsSeries({ recorded, exams: EXAMS }));
    expect(input.main?.measureKey).toBe("peds_independent_steps");
    expect(computeProfileStatus(input).status).toBe("improving");
  });

  it("falls back to the milestone line, and to nothing", () => {
    const input = pedsStatusInput(pedsSeries({ recorded: [], exams: EXAMS }));
    expect(input.main?.measureKey).toBe("peds_milestones_achieved");
    expect(computeProfileStatus(input).status).toBe("improving");
    expect(pedsStatusInput([]).main).toBeNull();
    expect(computeProfileStatus(pedsStatusInput([])).status).toBe("unknown");
  });
});

describe("the four key numbers", () => {
  const recorded = buildMeasureSeries(
    parseMeasurementRows([
      row("1", "peds_independent_steps", 2, "2026-09-01T06:00:00Z"),
      row("2", "peds_independent_steps", 5, "2026-10-01T06:00:00Z"),
      row("3", "peds_standing_seconds", 15, "2026-10-01T06:00:00Z"),
    ]),
    { profileKind: "pediatrics" },
  );
  const series = pedsSeries({ recorded, exams: EXAMS });
  const base = {
    series,
    exams: EXAMS,
    examsFailed: false,
    measuresFailed: false,
    milestones: [],
    checklist: [],
    sessions: { done: 6, next: "2026-10-28T10:00:00Z" },
  };

  it("is always four, in order, in the parent's words for a parent", () => {
    const tiles = pedsKeyTiles({ ...base, voice: "patient" });
    expect(tiles.map((t) => t.key)).toEqual([
      "milestones",
      expect.stringContaining("peds_independent_steps"),
      expect.stringContaining("peds_standing_seconds"),
      "sessions",
    ]);
    expect(tiles.map((t) => t.label)).toEqual([
      "Milestones reached",
      "Steps on their own",
      "Standing on their own",
      "Sessions",
    ]);
    expect(tiles[0].valueText).toBe("3 of 6");
    expect(tiles[0].deltaText).toBe("Up 3 since the first examination");
    expect(tiles[1].valueText).toMatch(/5/);
    expect(tiles[2].valueText).toBe("15 s");
    expect(tiles[3].valueText).toBe("6");
    expect(tiles[3].goalText).toMatch(/^Next: /);
  });

  it("is in the clinician's words for a clinician", () => {
    const tiles = pedsKeyTiles({ ...base, voice: "clinician" });
    expect(tiles.map((t) => t.label)).toEqual([
      "Milestones achieved",
      "Independent steps",
      "Independent standing",
      "Sessions",
    ]);
  });

  it("uses the intake's list of skills until an examination has milestones", () => {
    const checklist = intakeChecklist(
      ["Rolls over", "Sits without support", "Crawls"],
      "Rolls over\nSits without support",
    );
    const tiles = pedsKeyTiles({
      ...base,
      series: [],
      exams: [],
      voice: "patient",
      checklist,
    });
    expect(tiles[0]).toMatchObject({
      label: "Things they do on their own",
      valueText: "2 of 3",
      deltaText: "As you told us",
    });
    expect(
      pedsKeyTiles({
        ...base,
        series: [],
        exams: [],
        voice: "clinician",
        checklist,
      })[0].deltaText,
    ).toMatch(/no milestones examined yet/);
  });

  it("says Not yet for nothing recorded and Unavailable for a source that could not be read", () => {
    const none = pedsKeyTiles({
      ...base,
      series: [],
      exams: [],
      voice: "patient",
      sessions: { done: 0, next: null },
    });
    expect(none[0].valueText).toBe("Not yet");
    expect(none[1].valueText).toBe("Not yet");
    expect(none[3]).toMatchObject({ valueText: "0", goalText: "None booked" });
    const failed = pedsKeyTiles({
      ...base,
      series: [],
      exams: [],
      examsFailed: true,
      measuresFailed: true,
      sessions: null,
      voice: "patient",
    });
    expect(failed.map((t) => t.valueText)).toEqual([
      "Unavailable",
      "Unavailable",
      "Unavailable",
      "Unavailable",
    ]);
    expect(failed[0].deltaText).toMatch(/not missing/);
  });
});

describe("the generated 'where things stand'", () => {
  const series = pedsSeries({ recorded: [], exams: EXAMS });
  it("is plain in the parent's voice and clinical in the clinician's", () => {
    expect(pedsStandSummary({ series, voice: "patient" })).toBe(
      "3 of the 6 movement milestones we follow are ticked off.",
    );
    expect(pedsStandSummary({ series, voice: "clinician" })).toBe(
      "3 of 6 WHO motor milestones recorded as achieved at the latest examination.",
    );
    expect(pedsStandSummary({ series: [], voice: "patient" })).toBeNull();
  });
  it("never uses clinician words for a parent", () => {
    expect(pedsStandSummary({ series, voice: "patient" })).not.toMatch(
      /WHO|window|referral|triage|specialty|case/i,
    );
  });
});

describe("small readers", () => {
  it("takes the first line of the concern", () => {
    expect(
      pedsConditionLine({
        peds_concern: "Not walking at 20 months\nmore detail",
      }),
    ).toBe("Not walking at 20 months");
    expect(pedsConditionLine({})).toBeNull();
  });
  it("ticks the intake list", () => {
    expect(intakeChecklist(["A", "B"], "B")).toEqual([
      { label: "A", done: false },
      { label: "B", done: true },
    ]);
  });
});

describe("shapePedsView", () => {
  const reads = (over: Partial<PedsReads> = {}): PedsReads => ({
    exams: { status: "ok", exams: EXAMS },
    birth: { status: "ok", birthDate: "2025-06-01", gender: "Female" },
    measurements: { status: "ok", rows: [] },
    goals: { status: "ok", activeGoal: null, goals: [], milestones: [] },
    careStatus: { status: "ok", events: [] },
    licence: { status: "ok", keys: [] },
    sessions: { status: "ok", done: 3, next: null },
    summaryAuthorName: null,
    nowMs: Date.parse("2026-10-20T06:00:00Z"),
    todayIso: "2026-10-20",
    ...over,
  });
  const ctx = (voice: "patient" | "clinician") => ({
    intake: {
      peds_concern: "Late to stand",
      peds_weeks_at_birth: "30 weeks",
      peds_milestones: "Crawls",
    },
    voice,
    milestoneOptions: ["Rolls over", "Crawls"],
  });

  it("shapes the page once for any reader", () => {
    const v = shapePedsView(reads(), ctx("clinician"));
    expect(v.conditionLine).toBe("Late to stand");
    expect(v.exam.ageLine).toMatch(/corrected, born at 30 weeks/);
    expect(v.keyTiles).toHaveLength(4);
    expect(v.checklist).toEqual([
      { label: "Rolls over", done: false },
      { label: "Crawls", done: true },
    ]);
    expect(v.computed.status).toBe("improving");
    expect(v.stand.source).toBe("generated");
    expect(v.dobImplausible).toBeNull();
  });

  it("flags an implausible date of birth so the chart is not drawn", () => {
    expect(
      shapePedsView(
        reads({
          birth: { status: "ok", birthDate: "1990-01-01", gender: null },
        }),
        ctx("clinician"),
      ).dobImplausible,
    ).toBe("adult");
    expect(
      shapePedsView(
        reads({
          birth: { status: "ok", birthDate: "2027-01-01", gender: null },
        }),
        ctx("patient"),
      ).dobImplausible,
    ).toBe("future");
    expect(
      shapePedsView(
        reads({ birth: { status: "ok", birthDate: null, gender: null } }),
        ctx("patient"),
      ).dobImplausible,
    ).toBeNull();
  });

  it("degrades only what could not be read, never as empty", () => {
    const v = shapePedsView(
      reads({
        exams: { status: "unreadable" },
        measurements: { status: "unreadable" },
        goals: { status: "unreadable" },
        careStatus: { status: "unreadable" },
        sessions: { status: "unreadable" },
        birth: { status: "unreadable" },
      }),
      ctx("patient"),
    );
    expect(v).toMatchObject({
      examsFailed: true,
      measuresFailed: true,
      goalsFailed: true,
      statusFailed: true,
      birthFailed: true,
    });
    expect(v.keyTiles.map((t) => t.valueText)).toEqual([
      "Unavailable",
      "Unavailable",
      "Unavailable",
      "Unavailable",
    ]);
  });
});

describe("pedsEquipmentChips", () => {
  it("prefers the latest examination's equipment over the intake's", () => {
    expect(pedsEquipmentChips("Old walker", "Ankle splints")).toEqual([
      "Ankle splints",
    ]);
    expect(pedsEquipmentChips("Old walker", "")).toEqual(["Old walker"]);
  });
  it("splits on semicolons and line breaks only, keeps a description together, and caps at three", () => {
    expect(
      pedsEquipmentChips(
        "Ankle splints, fitted last year; walker\nglasses; a fourth",
        null,
      ),
    ).toEqual(["Ankle splints, fitted last year", "walker", "glasses"]);
  });
  it("is no chip for none, and cuts a long one", () => {
    expect(pedsEquipmentChips("None", null)).toEqual([]);
    expect(pedsEquipmentChips(" n/a. ", "")).toEqual([]);
    expect(pedsEquipmentChips(null, null)).toEqual([]);
    const [chip] = pedsEquipmentChips("x".repeat(80), null);
    expect(chip.length).toBe(48);
    expect(chip.endsWith("…")).toBe(true);
  });
});
