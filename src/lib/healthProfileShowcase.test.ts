import { describe, expect, it } from "vitest";
import {
  PROGRESS_STEPS,
  SAMPLE_NOTE,
  SHOWCASE_PROFILES,
  enabledShowcaseProfiles,
  type ShowcaseProfile,
} from "./healthProfileShowcase";
import {
  SAMPLE_GERIATRIC_INTAKE,
  SAMPLE_NOW_MS,
  SAMPLE_PEDS_BIRTH_DATE,
  SAMPLE_PEDS_WEEKS_AT_BIRTH,
  SAMPLE_REVIEW_DAYS,
  SAMPLE_TODAY,
  sampleCardio,
  sampleGeriatric,
  sampleNeuroParkinsons,
  sampleNeuroStroke,
  sampleOrtho,
  samplePeds,
} from "./healthProfileSamples";
import { CONDITION_SPECIALTY_KEYS, DEFAULT_ENABLED_INTAKE_SPECIALTIES, specialtyPatientLabel } from "./conditionSpecialty";
import { geriatricFallRisk } from "./geriatricRisk";
import { clinicDateKey } from "./clinicWeek";
import { goalForSeries, type MeasureSeries } from "./outcomeSeries";
import { OUTCOME_MEASURES, WHO_MOTOR_MILESTONES, outcomeMeasure } from "./outcomeMeasures";
import { pedsMilestoneWindows } from "./pedsMilestoneWindows";
import { MILESTONE_TEMPLATES } from "./milestoneTemplates";
import type { MilestoneView } from "./careGoals";

const profile = (specialty: string): ShowcaseProfile => SHOWCASE_PROFILES.find((p) => p.specialty === specialty)!;
const line = (s: MeasureSeries | undefined) => ({ first: s!.points[0].value, last: s!.points[s!.points.length - 1].value });
/** The value of a measure's fixed cut-off line for a profile kind. */
function fixedCut(measureKey: string, kind?: string): number {
  const cut = outcomeMeasure(measureKey)!.cutOffs!.find((c) => c.type === "fixed" && (kind ? c.profileKinds?.includes(kind as never) : true));
  if (!cut || cut.type !== "fixed") throw new Error(`No fixed cut-off for ${measureKey} ${kind ?? ""}`);
  return cut.value;
}
const find = (series: MeasureSeries[], key: string, variant: string | null = null) =>
  series.find((s) => s.measureKey === key && s.variant === variant);

const ortho = sampleOrtho();
const stroke = sampleNeuroStroke();
const parkinsons = sampleNeuroParkinsons();
const peds = samplePeds();
const geri = sampleGeriatric();
const cardio = sampleCardio();

const ALL_VIEWS = [ortho.view, stroke.view, parkinsons.view, peds.view, geri.view, cardio.view];

describe("which profiles the showcase advertises", () => {
  it("has one profile per condition type, in the triage picker's order", () => {
    expect(SHOWCASE_PROFILES.map((p) => p.specialty)).toEqual([...CONDITION_SPECIALTY_KEYS]);
  });

  it("shows the three original types by default, and the two new ones only once they are switched on", () => {
    expect(enabledShowcaseProfiles(DEFAULT_ENABLED_INTAKE_SPECIALTIES).map((p) => p.specialty)).toEqual(["ortho", "neuro", "pediatrics"]);
    expect(enabledShowcaseProfiles([...CONDITION_SPECIALTY_KEYS]).map((p) => p.specialty)).toEqual([...CONDITION_SPECIALTY_KEYS]);
    expect(enabledShowcaseProfiles(["ortho", "neuro", "pediatrics", "geriatric"]).map((p) => p.specialty)).toEqual(["ortho", "neuro", "pediatrics", "geriatric"]);
    expect(enabledShowcaseProfiles(["ortho", "cardiopulmonary"]).map((p) => p.specialty)).toEqual(["ortho", "cardiopulmonary"]);
  });

  it("always has the orthopaedic profile, so the band is never empty", () => {
    expect(enabledShowcaseProfiles([]).map((p) => p.specialty)).toEqual(["ortho"]);
    expect(enabledShowcaseProfiles(["neuro"]).map((p) => p.specialty)).toEqual(["ortho", "neuro"]);
  });
});

describe("the words", () => {
  const text = (p: ShowcaseProfile) => [p.label, p.forWho, ...p.watches, p.headline.metric, p.headline.from, p.headline.to, p.picture].join(" | ");

  it("calls each type by the patient's name for the care", () => {
    for (const p of SHOWCASE_PROFILES) expect(p.label).toBe(specialtyPatientLabel(p.specialty));
    expect(profile("geriatric").label).toBe("Strength and balance care");
    expect(profile("cardiopulmonary").label).toBe("Heart and lung rehabilitation");
    expect(profile("pediatrics").label).toBe("Paediatric physiotherapy");
  });

  it("never uses the clinic's own vocabulary or promises an outcome", () => {
    for (const p of SHOWCASE_PROFILES) {
      expect(text(p), p.specialty).not.toMatch(/\b(geriatric|elderly|triage|specialty|specialities|case|cases)\b/i);
      expect(text(p), p.specialty).not.toMatch(/\b(cure|cured|guarantee|guaranteed|will recover|will get better|promise|results)\b/i);
      // British spelling, no emoji.
      expect(text(p), p.specialty).not.toMatch(/pediatric|orthopedic|\p{Extended_Pictographic}/u);
    }
  });

  it("names the invented patient each profile draws, matching the sample record", () => {
    expect(SHOWCASE_PROFILES.map((p) => p.sample.name)).toEqual([ortho.person.name, stroke.person.name, peds.person.name, geri.person.name, cardio.person.name]);
  });

  it("names three things each profile watches, and who it is for in one line", () => {
    for (const p of SHOWCASE_PROFILES) {
      expect(p.watches, p.specialty).toHaveLength(3);
      expect(p.forWho.split(/\n/)).toHaveLength(1);
    }
  });

  it("labels every sample as made up", () => {
    expect(SAMPLE_NOTE).toMatch(/Sample patient/);
    expect(SAMPLE_NOTE).toMatch(/figures are made up/);
  });

  it("describes the five steps, from the goal and milestones to the PDF record", () => {
    expect(PROGRESS_STEPS).toHaveLength(5);
    const all = PROGRESS_STEPS.map((s) => `${s.title} ${s.body}`).join(" ");
    expect(all).toMatch(/goal/i);
    expect(all).toMatch(/milestone/i);
    expect(all).toMatch(/scores/i);
    expect(all).toMatch(/PDF/);
  });
});

describe("the headline figures are the ones the sample's own charts draw", () => {
  it("orthopaedic: the Pain Map score, 7/10 to 3/10", () => {
    const pain = find(ortho.view.series, "pain_nprs");
    expect(`${line(pain).first}/10`).toBe(profile("ortho").headline.from);
    expect(`${line(pain).last}/10`).toBe(profile("ortho").headline.to);
  });

  it("neurological: the walking ladder, 2 of 5 to 4 of 5", () => {
    const h = profile("neuro").headline;
    expect(`${stroke.view.ladder!.first} of 5`).toBe(h.from);
    expect(`${stroke.view.ladder!.now} of 5`).toBe(h.to);
  });

  it("paediatric: milestones reached, 1 of 6 to 4 of 6, and the chart agrees", () => {
    const m = find(peds.view.series, "peds_milestones_achieved");
    const h = profile("pediatrics").headline;
    expect(`${line(m).first} of 6`).toBe(h.from);
    expect(`${line(m).last} of 6`).toBe(h.to);
    expect(peds.view.exam.windows.rows.filter((r) => r.status === "achieved")).toHaveLength(line(m).last);
  });

  it("strength and balance: tests in the safer range, 0 of 4 to 3 of 4", () => {
    const h = profile("geriatric").headline;
    const firstDay = SAMPLE_REVIEW_DAYS[0];
    const atFirst = geriatricFallRisk({
      intake: SAMPLE_GERIATRIC_INTAKE,
      intakeAnsweredAt: `${firstDay}T05:30:00.000Z`,
      points: geri.view.points.filter((p) => p.measuredAt.startsWith(firstDay)),
      diary: [],
      ageYears: geri.view.person.ageYears,
      sex: geri.view.person.sex,
      onDate: firstDay,
      clinicDate: clinicDateKey,
    });
    expect(`${atFirst.testsInSaferRange.safer} of ${atFirst.testsInSaferRange.done}`).toBe(h.from);
    expect(geri.view.fallRisk.saferRangeLine).toBe(`Tests in the safer range: ${h.to}`);
  });

  it("heart and lung: the six-minute walk, 285 m to 372 m", () => {
    const walk = find(cardio.view.series, "six_minute_walk");
    const h = profile("cardiopulmonary").headline;
    expect(`${line(walk).first} m`).toBe(h.from);
    expect(`${line(walk).last} m`).toBe(h.to);
    expect(cardio.view.walk.first?.value).toBe(line(walk).first);
    expect(cardio.view.walk.latest?.value).toBe(line(walk).last);
  });
});

describe("the sample records are real records", () => {
  it("use only measures the registry holds, and none of the licensed ones", () => {
    const licensed = new Set(OUTCOME_MEASURES.filter((m) => m.licence === "licensed").map((m) => m.key));
    for (const view of ALL_VIEWS) {
      for (const s of view.series) {
        expect(outcomeMeasure(s.measureKey), s.measureKey).toBeTruthy();
        expect(s.known, s.measureKey).toBe(true);
        expect(licensed.has(s.measureKey), s.measureKey).toBe(false);
      }
      for (const v of view.views) {
        if (v.milestone.linkedMeasureKey) {
          expect(outcomeMeasure(v.milestone.linkedMeasureKey), v.milestone.linkedMeasureKey).toBeTruthy();
          expect(licensed.has(v.milestone.linkedMeasureKey)).toBe(false);
        }
      }
    }
  });

  it("take every milestone and its bar from the product's starter templates", () => {
    for (const view of ALL_VIEWS) {
      for (const { milestone } of view.views) {
        const t = MILESTONE_TEMPLATES.find((x) => x.key === milestone.templateKey);
        expect(t, milestone.title).toBeTruthy();
        expect(milestone.title).toBe(t!.title);
        expect(milestone.criterion).toBe(t!.criterion);
        expect(milestone.targetValue).toBe(t!.targetValue ?? null);
        expect(milestone.linkedMeasureKey).toBe(t!.linkedMeasureKey ?? null);
      }
    }
  });

  it("take thresholds from the registry, not from the page", () => {
    const target = (view: { views: MilestoneView[] }, template: string) => view.views.find((v) => v.milestone.templateKey === template)!.milestone.targetValue;
    // Parkinson's Up and Go: the registry's own Parkinson's line.
    expect(target(parkinsons.view, "pd_tug_under_11_5")).toBe(fixedCut("tug", "neuro_parkinsons"));
    // Strength and balance: the bar sits just under the registry's 12 second line.
    expect(target(geri.view, "geri_tug_under_12")!).toBeLessThan(fixedCut("tug", "geriatric"));
    // Heel-to-toe: stage 3 is the registry's safer-range line.
    expect(target(geri.view, "geri_heel_to_toe")).toBe(fixedCut("four_stage_balance"));
    // Orthopaedic strength: the registry's fixed 90% norm.
    expect(target(ortho.view, "ortho_strength_90")).toBe(outcomeMeasure("strength_symmetry")!.norm!.value);
    // The graph's risk line for the stroke Up and Go comes from the same registry.
    expect(outcomeMeasure("tug")!.cutOffs!.some((c) => c.profileKinds?.includes("neuro"))).toBe(true);
  });

  it("show a goal band on at least one line of every profile", () => {
    for (const view of ALL_VIEWS) {
      const targets = view.views.map((v) => v.milestone);
      const withGoal = view.series.filter((s) => goalForSeries(s, targets)?.source === "milestone");
      expect(withGoal.length, view.series.map((s) => s.measureKey).join()).toBeGreaterThan(0);
    }
  });

  it("show a milestone reached, one being worked on and one planned, with a goal in the patient's words", () => {
    for (const view of ALL_VIEWS) {
      const statuses = new Set(view.views.map((v) => v.derived.status));
      expect([...statuses].sort(), view.goal?.goalText).toEqual(["planned", "reached", "working"]);
      expect(view.goal?.goalText.length).toBeGreaterThan(10);
      // Nothing overdue on the day the sample is read.
      expect(view.views.some((v) => v.overdue)).toBe(false);
    }
  });

  it("give every line at least two readings, so each draws a trend", () => {
    for (const view of ALL_VIEWS) {
      const lines = view.series.filter((s) => ["pain_nprs", "joint_range", "strength_symmetry", "fac", "berg_balance", "ten_metre_walk", "tug", "mini_bestest", "peds_milestones_achieved", "peds_standing_seconds", "chair_stand_30s", "four_stage_balance", "gait_speed_4m", "six_minute_walk", "breathlessness_nrs", "resting_heart_rate"].includes(s.measureKey));
      expect(lines.length).toBeGreaterThan(0);
      for (const s of lines) expect(s.points.length, s.key).toBeGreaterThanOrEqual(2);
    }
  });

  it("draw the same output on the server and in the browser", () => {
    expect(JSON.stringify(sampleOrtho().view)).toBe(JSON.stringify(ortho.view));
    expect(JSON.stringify(sampleGeriatric().view)).toBe(JSON.stringify(geri.view));
    expect(JSON.stringify(samplePeds().view)).toBe(JSON.stringify(peds.view));
    expect(SAMPLE_NOW_MS).toBe(Date.parse(`${SAMPLE_TODAY}T06:30:00.000Z`));
  });

  it("use invented names, one per sample", () => {
    const names = [ortho.person.name, stroke.person.name, parkinsons.person.name, peds.person.name, geri.person.name, cardio.person.name];
    expect(names).toEqual(["Riya", "Arun", "Sunil", "Meera", "Lakshmi", "Dinesh"]);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("the neurological samples", () => {
  it("shows a stroke recovery with no falls, a walking ladder and a speed zone", () => {
    expect(stroke.view.kind).toBe("neuro");
    expect(stroke.view.ladder).toMatchObject({ first: 2, now: 4 });
    expect(stroke.view.speed?.nowBand).toBe("household");
    expect(stroke.view.diary.status === "ok" && stroke.view.diary.falls.falls).toBe(0);
    const independence = stroke.view.keyTiles[0];
    expect(independence.valueText).toBe("7 / 10");
  });

  it("tests Parkinson's in ON time, and only ever joins dots taken in the same state", () => {
    expect(parkinsons.view.kind).toBe("neuro_parkinsons");
    expect(parkinsons.view.parkinsons?.onTimeChip).toMatch(/^Tested in ON time/);
    const timed = parkinsons.view.series.filter((s) => outcomeMeasure(s.measureKey)?.medicationStateRequired);
    expect(timed.length).toBeGreaterThan(0);
    for (const s of timed) {
      expect(s.medicationState, s.key).toBe("on");
      expect(s.joinPoints, s.key).toBe(true);
    }
    // The Parkinson's stage is a fact about the condition, never a goal.
    expect(parkinsons.view.parkinsons?.stage?.value).toBe(2);
    expect(parkinsons.view.parkinsons?.symptoms?.total).toEqual({ first: 14, now: 10 });
  });
});

describe("the paediatric sample", () => {
  it("is a child born early, with her age corrected and every unreached milestone still inside its WHO window", () => {
    const { ageLine } = peds.view.exam;
    expect(ageLine).toMatch(/corrected, born at 30 weeks\)$/);
    const chronological = Number(/^([\d.]+) months/.exec(ageLine!)![1]);
    const corrected = Number(/\(([\d.]+) months corrected/.exec(ageLine!)![1]);
    // Ten weeks early is about 2.3 months.
    expect(chronological - corrected).toBeGreaterThan(2);
    expect(chronological - corrected).toBeLessThan(2.6);
    expect(SAMPLE_PEDS_WEEKS_AT_BIRTH).toBe(30);

    const windows = pedsMilestoneWindows({
      findings: peds.view.exam.latest!.findings,
      birthDate: SAMPLE_PEDS_BIRTH_DATE,
      weeksAtBirth: SAMPLE_PEDS_WEEKS_AT_BIRTH,
      todayIso: SAMPLE_TODAY,
    });
    for (const row of windows.rows) {
      const who = WHO_MOTOR_MILESTONES.find((m) => m.key === row.key)!;
      expect(row.windowMonths, row.key).toEqual(who.windowMonths);
      if (row.status !== "achieved") expect(row.band, row.key).toMatch(/^not_yet_within_window$|^not_assessed$/);
    }
    // Nothing the chart would raise with a parent.
    expect(windows.referral).toBeNull();
    expect(windows.walkingNotAssessed).toBeNull();
    expect(peds.view.dobImplausible).toBeNull();
  });
});

describe("the strength and balance sample", () => {
  it("is High because of the falls, whatever the tests show, and says the tests separately", () => {
    expect(geri.view.fallRisk.level).toBe("high");
    expect(geri.view.fallRisk.fallsInPastYear).toBe(3);
    expect(geri.view.fallRiskText).toMatch(/^High because of 3 falls in the last 12 months/);
    expect(geri.view.fallRisk.saferRangeLine).toBe("Tests in the safer range: 3 of 4");
    expect(geri.view.keyTiles.map((t) => t.label)).toEqual(["Fall risk", "Tests in the safer range", "Daily living", "Walking speed"]);
    expect(geri.view.keyTiles[2].valueText).toBe("5 of 6");
  });
});

describe("the heart and lung sample", () => {
  it("shows the patient's own oxygen limit, set by their doctor, and no expected distance", () => {
    expect(cardio.view.limit).toMatchObject({ percent: 92, source: "doctor" });
    expect(cardio.view.keyTiles[1].goalText).toMatch(/^Your stop limit: 92%/);
    expect(cardio.view.vitalsCheck.status).toBe("clear");
    expect(cardio.view.walk.prediction).toEqual({ status: "not_chosen", text: "" });
    expect(cardio.view.predictionNeeds).toEqual([]);
  });
});
