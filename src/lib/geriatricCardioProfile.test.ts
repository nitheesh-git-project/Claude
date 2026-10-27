import { describe, expect, it } from "vitest";
import { geriatricCarerLine, geriatricExportSection, shapeGeriatricView, GERIATRIC_SUBJECT } from "./geriatricProfile";
import { cardioExportSection, shapeCardioView, vitalsRedFlagAtLatestReview, latestCardioVitals, CARDIO_SUBJECT } from "./cardioProfile";
import { activeMinutesWeeklySeries, WHO_ACTIVE_MINUTES_PER_WEEK, diaryKindsFor, type DiaryEntry } from "./patientDiary";
import { intakeTrendSeries } from "./healthProfileSummary";
import { parseEnabledIntakeSpecialties } from "./adminSettings";
import { answerFirstGivenAt, type MeasuredProfileReads } from "./progressProfileBase";
import { parseMeasurementRows, type OutcomeMeasurementRow } from "./outcomeSeries";
import { CARDIO_CONDITION_OPEN_HEART, CARDIO_MMRC_OPTIONS } from "./intakeCardio";
import { GERI_FALLS_TWO_PLUS } from "./intakeGeriatric";
import { serializeMultiSelect } from "./conditionIntake";

const NOW = Date.parse("2026-10-26T06:30:00.000Z"); // a Monday, 12:00 IST
const TODAY = "2026-10-26";
const fmt = (iso: string) => iso.slice(0, 10);

let seq = 0;
function row(measure_key: string, value: number, measured_at: string, extra: Partial<OutcomeMeasurementRow> = {}): OutcomeMeasurementRow {
  seq += 1;
  return {
    id: `00000000-0000-0000-0000-${String(seq).padStart(12, "0")}`,
    patient_id: "p1",
    appointment_id: null,
    measure_key,
    variant: null,
    side: null,
    value,
    items: null,
    conditions: { setting: "in_person" },
    recorded_by: "t1",
    recorded_by_role: "therapist",
    measured_at,
    schema_version: 1,
    created_at: measured_at,
    ...extra,
  };
}

function diary(kind: DiaryEntry["kind"], occurredAt: string, details: DiaryEntry["details"], confirmed = false): DiaryEntry {
  seq += 1;
  return {
    id: `d${seq}`,
    patientId: "p1",
    kind,
    occurredAt,
    details,
    note: null,
    enteredBy: "p1",
    enteredByRole: "patient",
    confirmedBy: confirmed ? "t1" : null,
    confirmedByRole: confirmed ? "therapist" : null,
    confirmedAt: confirmed ? occurredAt : null,
    createdAt: occurredAt,
  };
}

function reads(over: Partial<MeasuredProfileReads> = {}): MeasuredProfileReads {
  return {
    measurements: { status: "ok", rows: [] },
    goals: { status: "ok", activeGoal: null, goals: [], milestones: [] },
    careStatus: { status: "ok", events: [] },
    diary: { status: "ok", entries: [] },
    intakeHistory: { status: "ok", rows: [] },
    licence: { status: "ok", keys: [] },
    person: { status: "ok", birthDate: "1947-05-01", gender: "Female" },
    summaryAuthorName: null,
    nowMs: NOW,
    todayIso: TODAY,
    ...over,
  };
}

const geriIntake = {
  geri_concern: "Three falls this year, arthritis in both knees",
  geri_falls_12m: GERI_FALLS_TWO_PLUS,
  geri_unsteady: "Yes",
  geri_fall_worry: "Yes",
  geri_walking_aid: "A walking stick",
  geri_daily_help: serializeMultiSelect(["Bathing or washing"]),
  geri_carer_name: "Ramesh",
  geri_carer_relationship: "Son",
};

describe("the Strength and balance care view", () => {
  const measurementRows = [
    row("tug", 14.2, "2026-08-03T05:00:00.000Z"),
    row("tug", 11.1, "2026-10-12T05:00:00.000Z"),
    row("chair_stand_30s", 11, "2026-10-12T05:05:00.000Z"),
    row("four_stage_balance", 3, "2026-10-12T05:10:00.000Z"),
    row("gait_speed_4m", 0.62, "2026-08-03T05:15:00.000Z"),
    row("gait_speed_4m", 0.75, "2026-10-12T05:15:00.000Z"),
  ];
  const history = {
    status: "ok" as const,
    rows: [{ proposed_data: geriIntake, reviewed_at: "2026-08-03T06:00:00.000Z", created_at: "2026-08-03T06:00:00.000Z", status: "approved" }],
  };

  it("shows the STEADI level with its rule and the safer-range line apart, and speaks to the patient", () => {
    const view = shapeGeriatricView(reads({ measurements: { status: "ok", rows: measurementRows }, intakeHistory: history }), { intake: geriIntake, voice: "patient" });
    expect(view.subject).toBe("self");
    expect(GERIATRIC_SUBJECT).toBe("self");
    expect(view.fallRisk.level).toBe("high");
    expect(view.fallRiskText).toMatch(/^High because of 2 falls in the last 12 months/);
    expect(view.fallRisk.saferRangeLine).toBe("Tests in the safer range: 3 of 4");
    expect(view.keyTiles.map((t) => t.label)).toEqual(["Fall risk", "Tests in the safer range", "Daily living", "Walking speed"]);
    expect(view.keyTiles[2].valueText).toBe("5 of 6");
    expect(view.ageLine).toBe("79 years");
    expect(view.carerLine).toBe("Ramesh, your son, helps at home");
    expect(view.conditionLine).toBe("Three falls this year, arthritis in both knees");
  });

  it("moves the pill for a confirmed fall since the last review, never for an unconfirmed one", () => {
    const after = "2026-10-20T08:00:00.000Z";
    const r = reads({ measurements: { status: "ok", rows: measurementRows }, intakeHistory: history });
    const reported = shapeGeriatricView({ ...r, diary: { status: "ok", entries: [diary("fall", after, { injured: false })] } }, { intake: geriIntake, voice: "clinician" });
    expect(reported.statusInput.newFall).toBe(false);
    expect(reported.fallRisk.unconfirmedDiaryFalls).toBe(1);
    const confirmed = shapeGeriatricView({ ...r, diary: { status: "ok", entries: [diary("fall", after, { injured: false }, true)] } }, { intake: geriIntake, voice: "clinician" });
    expect(confirmed.computed).toMatchObject({ status: "needs_attention", reason: "new_fall" });
  });

  it("says when a read failed rather than reading as nothing", () => {
    const view = shapeGeriatricView(reads({ diary: { status: "unreadable" }, person: { status: "unreadable" }, measurements: { status: "unreadable" } }), {
      intake: geriIntake,
      voice: "patient",
    });
    expect(view.diary.status).toBe("unreadable");
    expect(view.notes).toHaveLength(2);
    expect(view.keyTiles[1].valueText).toBe("Unavailable");
    expect(view.keyTiles[3].valueText).toBe("Unavailable");
    // An unreadable history dates the falls today: they keep counting.
    expect(shapeGeriatricView(reads({ intakeHistory: { status: "unreadable" } }), { intake: geriIntake, voice: "patient" }).fallRisk.level).toBe("high");
  });

  it("words the carer line for a clinician, and prints none without a name", () => {
    expect(geriatricCarerLine({ geri_carer_name: "Ramesh", geri_carer_relationship: "My son" }, "clinician", "Female")).toBe("Her son, Ramesh, helps at home");
    expect(geriatricCarerLine({ geri_carer_name: "Anita" }, "patient")).toBe("Anita helps at home");
    expect(geriatricCarerLine({ geri_carer_relationship: "Daughter" }, "patient")).toBeNull();
  });

  it("prints the level, the tests and daily living in the PDF section", () => {
    const view = shapeGeriatricView(reads({ measurements: { status: "ok", rows: measurementRows }, intakeHistory: history }), { intake: geriIntake, voice: "clinician" });
    const section = geriatricExportSection(view, fmt);
    expect(section.heading).toBe("Fall risk and daily living");
    expect(section.lines[0]).toMatch(/^Fall risk \(CDC STEADI\): High\./);
    expect(section.lines).toContain("Tests in the safer range: 3 of 4.");
    expect(section.lines.some((l) => l.startsWith("Daily living (Katz): 5 of 6 without help"))).toBe(true);
  });

  it("dates an answer from when it was first given, not the latest re-save", () => {
    const rows = [
      { proposed_data: { geri_falls_12m: "No falls" }, reviewed_at: null, created_at: "2026-01-01T00:00:00.000Z", status: "approved" },
      { proposed_data: { geri_falls_12m: GERI_FALLS_TWO_PLUS }, reviewed_at: null, created_at: "2026-03-01T00:00:00.000Z", status: "approved" },
      { proposed_data: { geri_falls_12m: GERI_FALLS_TWO_PLUS }, reviewed_at: null, created_at: "2026-09-01T00:00:00.000Z", status: "approved" },
    ];
    expect(answerFirstGivenAt(rows, "geri_falls_12m", GERI_FALLS_TWO_PLUS)).toBe("2026-03-01T00:00:00.000Z");
    expect(answerFirstGivenAt(rows, "geri_falls_12m", "One fall, without an injury")).toBeNull();
  });
});

const cardioIntake = {
  cardio_condition: CARDIO_CONDITION_OPEN_HEART,
  cardio_condition_date: "July 2026",
  cardio_sternal_precautions: "No lifting over 4 kg",
  cardio_sternal_precautions_until: "20 Nov 2026",
  cardio_beta_blocker: "Yes",
  cardio_breathlessness: CARDIO_MMRC_OPTIONS[2],
  cardio_home_oxygen: "No",
};

describe("the Heart and lung rehabilitation view", () => {
  const rows = [
    row("six_minute_walk", 285, "2026-08-03T05:00:00.000Z", { items: [270, 285] }),
    row("six_minute_walk", 430, "2026-10-12T05:00:00.000Z", { items: [430] }),
    row("resting_heart_rate", 72, "2026-10-12T04:50:00.000Z"),
    row("blood_pressure", 124, "2026-10-12T04:51:00.000Z", { variant: "rest", items: { systolic: 124, diastolic: 78 } }),
    row("resting_spo2", 97, "2026-10-12T04:52:00.000Z"),
    row("lowest_spo2", 94, "2026-10-12T05:06:00.000Z"),
  ];
  const equation = { status: "ok" as const, key: "indian_adult_tbd" as const, chosen: false };

  it("uses the patient's own limit, the talk test on a beta-blocker, and the precautions until their date", () => {
    const view = shapeCardioView({ ...reads({ measurements: { status: "ok", rows } }), equation }, { intake: cardioIntake, voice: "patient" });
    expect(view.subject).toBe("self");
    expect(CARDIO_SUBJECT).toBe("self");
    expect(view.limit).toMatchObject({ percent: 90, source: "default" });
    expect(view.vitalsCheck.status).toBe("clear");
    expect(view.oxygenCheck.stop).toBe(false);
    expect(view.effort).toMatchObject({ mode: "talk_test", reason: "beta_blocker" });
    expect(view.precautions).toMatchObject({ status: "active", until: "2026-11-20" });
    expect(view.walk.prediction).toEqual({ status: "not_chosen", text: "Predicted distance: formula not chosen yet." });
    expect(view.mmrc).toEqual({ grade: 2, source: "intake" });
    expect(view.keyTiles.map((t) => t.label)).toEqual(["Six-minute walk", "Oxygen", "Resting heart rate", "Active minutes a week"]);
    expect(view.keyTiles[1].goalText).toMatch(/^Your stop limit: 90%/);
    expect(view.conditionLine).toBe(`${CARDIO_CONDITION_OPEN_HEART} · July 2026`);
  });

  it("raises the status rule's red flag for a flagged reading at the latest review only", () => {
    const flagged = [...rows, row("resting_heart_rate", 128, "2026-10-12T05:30:00.000Z")];
    const view = shapeCardioView({ ...reads({ measurements: { status: "ok", rows: flagged } }), equation }, { intake: cardioIntake, voice: "clinician" });
    expect(view.vitalsCheck.status).toBe("stop");
    expect(view.statusInput.redFlag).toBe(true);
    expect(view.computed.status).toBe("needs_attention");
    // The same reading under an older review is history, not today's flag.
    const later = [...flagged, row("six_minute_walk", 440, "2026-10-20T05:00:00.000Z")];
    const points = parseMeasurementRows(later);
    const vitals = latestCardioVitals(points);
    const check = shapeCardioView({ ...reads({ measurements: { status: "ok", rows: later } }), equation }, { intake: cardioIntake, voice: "clinician" }).vitalsCheck;
    expect(vitalsRedFlagAtLatestReview(vitals, check, "2026-10-20T05:00:00.000Z")).toBe(false);
  });

  it("judges a stored top number even when the bottom number was never stored", () => {
    const topOnly = [...rows.filter((r) => r.measure_key !== "blood_pressure"), row("blood_pressure", 196, "2026-10-12T04:51:00.000Z", { variant: "rest" })];
    const view = shapeCardioView({ ...reads({ measurements: { status: "ok", rows: topOnly } }), equation }, { intake: cardioIntake, voice: "clinician" });
    expect(view.vitalsCheck.status).toBe("stop");
    expect(view.vitalsCheck.flags.map((f) => f.code)).toEqual(["blood_pressure_high"]);
    expect(view.statusInput.redFlag).toBe(true);
    expect(view.statusInput.redFlagAt).toBe("2026-10-12T04:51:00.000Z");
    const fine = [...rows.filter((r) => r.measure_key !== "blood_pressure"), row("blood_pressure", 130, "2026-10-12T04:51:00.000Z", { variant: "rest" })];
    const calm = shapeCardioView({ ...reads({ measurements: { status: "ok", rows: fine } }), equation }, { intake: cardioIntake, voice: "clinician" });
    expect(calm.vitalsCheck.status).toBe("incomplete");
  });

  it("prints the limits and the vitals in the PDF section", () => {
    const view = shapeCardioView({ ...reads({ measurements: { status: "ok", rows } }), equation }, { intake: cardioIntake, voice: "clinician" });
    const section = cardioExportSection(view, fmt);
    expect(section.heading).toBe("Safety limits and vitals");
    expect(section.lines[0]).toMatch(/^Oxygen stop limit: 90% or a drop of 4/);
    expect(section.lines).toContain("Beta-blocker: yes. Exercise is paced by the talk test, not heart rate.");
    expect(section.lines.some((l) => l.startsWith("Surgeon's precautions, until 2026-11-20"))).toBe(true);
    expect(section.lines.some((l) => l.startsWith("Six-minute walk: 430 m"))).toBe(true);
  });
});

describe("the diary for the two new types", () => {
  it("keeps falls and near-misses for geriatric and active minutes for cardiopulmonary", () => {
    expect(diaryKindsFor("geriatric")).toEqual(["fall", "near_miss"]);
    expect(diaryKindsFor("cardiopulmonary")).toEqual(["active_minutes"]);
  });

  it("totals active minutes per clinic week against the WHO's 150, light minutes apart, the week in progress marked", () => {
    const entries = [
      diary("active_minutes", "2026-10-20T03:00:00.000Z", { minutes: 90, intensity: "moderate" }),
      diary("active_minutes", "2026-10-22T03:00:00.000Z", { minutes: 70 }),
      diary("active_minutes", "2026-10-23T03:00:00.000Z", { minutes: 40, intensity: "light" }),
      diary("active_minutes", "2026-10-26T03:00:00.000Z", { minutes: 20, intensity: "moderate" }),
    ];
    const { goal, weeks } = activeMinutesWeeklySeries(entries, { nowMs: NOW, weeks: 3 });
    expect(goal).toBe(WHO_ACTIVE_MINUTES_PER_WEEK);
    expect(weeks.map((w) => w.weekStart)).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(weeks[0]).toMatchObject({ written: false, minutes: 0, metGoal: false });
    expect(weeks[1]).toMatchObject({ written: true, minutes: 160, lightMinutes: 40, metGoal: true, patientReported: true, inProgress: false });
    expect(weeks[2]).toMatchObject({ minutes: 20, inProgress: true });
  });
});

describe("the intake trend and the settings for the two new types", () => {
  it("trends Katz from the intake for geriatric and the mMRC grade for cardiopulmonary", () => {
    const at = (d: string) => ({ reviewed_at: null, created_at: d, status: "approved" });
    expect(
      intakeTrendSeries(
        [
          { ...at("2026-08-01T00:00:00.000Z"), proposed_data: { geri_daily_help: serializeMultiSelect(["Bathing or washing", "Getting dressed"]) } },
          { ...at("2026-10-01T00:00:00.000Z"), proposed_data: { geri_daily_help: serializeMultiSelect(["Bathing or washing"]) } },
        ],
        "geriatric"
      )
    ).toEqual([
      { date: "2026-08-01", value: 4 },
      { date: "2026-10-01", value: 5 },
    ]);
    expect(intakeTrendSeries([{ ...at("2026-08-01T00:00:00.000Z"), proposed_data: { cardio_breathlessness: CARDIO_MMRC_OPTIONS[3] } }], "cardiopulmonary")).toEqual([
      { date: "2026-08-01", value: 3 },
    ]);
  });

  it("accepts the new types in the enabled list, keeps ortho, and keeps them off by default", () => {
    expect(parseEnabledIntakeSpecialties(["cardiopulmonary", "geriatric"])).toEqual(["ortho", "geriatric", "cardiopulmonary"]);
    expect(parseEnabledIntakeSpecialties(undefined)).toEqual(["ortho", "neuro", "pediatrics"]);
    expect(parseEnabledIntakeSpecialties(["elderly"])).toEqual(["ortho"]);
  });
});
