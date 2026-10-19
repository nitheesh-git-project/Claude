import { describe, expect, it } from "vitest";
import {
  BERG_ITEMS,
  BILATERAL_SECTIONS,
  NEURO_ROWS,
  NEURO_SCALES,
  asymmetries,
  bergRiskBand,
  bergTotalFromItems,
  compareNeuroExams,
  describeNeuroExamForText,
  emptyNeuroFindings,
  gaitSpeedBand,
  gaitSpeedFromTenMetre,
  isNeuroExamEmpty,
  markSectionNormal,
  neuroHeadline,
  parseNeuroAssessments,
  readStoredFindings,
  sectionTallies,
  severityOf,
  validateNeuroFindings,
  type NeuroFindings,
} from "@/lib/neuroExam";

function ok(raw: unknown): NeuroFindings {
  const result = validateNeuroFindings(raw);
  if (!result.ok) throw new Error(`expected valid, got: ${result.error}`);
  return result.findings;
}

function refused(raw: unknown): string {
  const result = validateNeuroFindings(raw);
  if (result.ok) throw new Error("expected a refusal");
  return result.error;
}

const allBerg = (score: number) => Object.fromEntries(BERG_ITEMS.map((i) => [i.key, score]));

describe("the scales", () => {
  it("offer exactly the published grades, in order", () => {
    expect(NEURO_SCALES.mas.options.map((o) => o.value)).toEqual(["0", "1", "1+", "2", "3", "4"]);
    expect(NEURO_SCALES.mrc.options.map((o) => o.value)).toEqual(["0", "1", "2", "3", "4", "5"]);
    expect(NEURO_SCALES.reflex.options.map((o) => o.value)).toEqual(["0", "1+", "2+", "3+", "4+"]);
    expect(NEURO_SCALES.sensation.options.map((o) => o.value)).toEqual(["intact", "impaired", "absent"]);
    expect(NEURO_SCALES.coordination.options.map((o) => o.value)).toEqual(["normal", "impaired"]);
  });

  it("puts every scale's normal value at severity 0, and only that one", () => {
    for (const scale of Object.values(NEURO_SCALES)) {
      const zero = scale.options.filter((o) => o.severity === 0).map((o) => o.value);
      expect(zero, scale.key).toEqual([scale.normal]);
    }
  });

  it("gives every option a meaning, so the legend never has a blank", () => {
    for (const scale of Object.values(NEURO_SCALES)) {
      for (const option of scale.options) expect(option.meaning.length, `${scale.key} ${option.value}`).toBeGreaterThan(3);
    }
  });

  it("reads reflexes as a distance from 2+ in both directions", () => {
    expect(severityOf("reflex", "2+")).toBe(0);
    expect(severityOf("reflex", "1+")).toBe(severityOf("reflex", "3+"));
    expect(severityOf("reflex", "0")).toBe(severityOf("reflex", "4+"));
    expect(severityOf("reflex", "7")).toBeNull();
  });

  it("runs power the opposite way to tone", () => {
    expect(severityOf("mrc", "5")).toBe(0);
    expect(severityOf("mrc", "0")).toBeGreaterThan(severityOf("mrc", "4")!);
    expect(severityOf("mas", "0")).toBe(0);
    expect(severityOf("mas", "1+")).toBeGreaterThan(severityOf("mas", "1")!);
  });

  it("has a unique storage key for every row, and the plantar row on its own scale", () => {
    expect(new Set(NEURO_ROWS.map((r) => r.key)).size).toBe(NEURO_ROWS.length);
    expect(NEURO_ROWS.find((r) => r.key === "reflex_plantar")?.scale).toBe("plantar");
    expect(BILATERAL_SECTIONS.map((s) => s.key)).toEqual(["tone", "power", "reflexes", "sensation", "coordination"]);
  });
});

describe("validateNeuroFindings", () => {
  it("accepts a full, plausible exam and keeps only what was tested", () => {
    const findings = ok({
      bilateral: {
        tone_elbow_flexors: { left: "1+", right: "0" },
        power_shoulder_abduction: { left: "3", right: "" },
        reflex_plantar: { left: "extensor", right: "flexor" },
        sens_lt_foot: { left: "impaired" },
        coord_finger_nose: {},
      },
      balance: { romberg: "positive", sitting: "good", standing: "poor", bergTotal: 30 },
      gait: { patterns: ["hemiplegic"], aids: ["stick", "afo"], tenMetreWalkSeconds: 20.04, tugSeconds: 18.55 },
      notes: "  Left-sided weakness after stroke.  ",
    });
    expect(findings.bilateral.power_shoulder_abduction).toEqual({ left: "3" });
    // A row with neither side is "not tested" -- absent, not an empty object.
    expect(findings.bilateral.coord_finger_nose).toBeUndefined();
    expect(findings.gait.tenMetreWalkSeconds).toBe(20);
    expect(findings.gait.tugSeconds).toBe(18.6);
    expect(findings.notes).toBe("Left-sided weakness after stroke.");
  });

  it("refuses an empty exam", () => {
    expect(refused({})).toMatch(/at least one finding/);
    expect(refused({ bilateral: { tone_elbow_flexors: {} }, notes: "   " })).toMatch(/at least one finding/);
  });

  it("refuses a value its scale does not offer -- no free numbers", () => {
    expect(refused({ bilateral: { tone_elbow_flexors: { left: "2+" } } })).toMatch(/Modified Ashworth/);
    expect(refused({ bilateral: { power_hip_flexion: { right: 4 } } })).toMatch(/Oxford/);
    expect(refused({ bilateral: { power_hip_flexion: { right: "6" } } })).toMatch(/not on/);
    expect(refused({ bilateral: { reflex_plantar: { left: "2+" } } })).toMatch(/Plantar/);
  });

  it("refuses rows, sides and fields the chart does not have", () => {
    expect(refused({ bilateral: { tone_tail: { left: "0" } } })).toMatch(/does not have/);
    expect(refused({ bilateral: { tone_elbow_flexors: { centre: "0" } } })).toMatch(/left and a right/);
    expect(refused({ bilateral: {}, extra: 1 })).toMatch(/does not have/);
    expect(refused({ balance: { wobble: "x" } })).toMatch(/does not have/);
    expect(refused({ gait: { speed: 3 } })).toMatch(/does not have/);
    expect(refused(null)).toMatch(/missing/);
    expect(refused("exam")).toMatch(/missing/);
  });

  it("checks the balance grades", () => {
    expect(refused({ balance: { romberg: "maybe" } })).toMatch(/Romberg/);
    expect(refused({ balance: { sitting: "excellent" } })).toMatch(/Sitting balance/);
    expect(ok({ balance: { standing: "zero" } }).balance.standing).toBe("zero");
  });

  it("holds the Berg total to 0-56 and to its own item scores", () => {
    expect(refused({ balance: { bergTotal: 57 } })).toMatch(/0 to 56/);
    expect(refused({ balance: { bergTotal: 20.5 } })).toMatch(/whole number/);
    expect(refused({ balance: { bergItems: { "1": 5 } } })).toMatch(/0 to 4/);
    expect(refused({ balance: { bergItems: { "15": 2 } } })).toMatch(/does not have/);
    // All fourteen scored: the total is their sum or it is refused.
    expect(refused({ balance: { bergItems: allBerg(3), bergTotal: 40 } })).toMatch(/does not match/);
    expect(ok({ balance: { bergItems: allBerg(3), bergTotal: 42 } }).balance.bergTotal).toBe(42);
    // ...and derived when left blank.
    expect(ok({ balance: { bergItems: allBerg(2) } }).balance.bergTotal).toBe(28);
    // Some scored: the total has to be reachable from them.
    expect(refused({ balance: { bergItems: { "1": 4, "2": 4 }, bergTotal: 7 } })).toMatch(/cannot come from/);
    expect(refused({ balance: { bergItems: { "1": 0 }, bergTotal: 53 } })).toMatch(/cannot come from/);
    expect(ok({ balance: { bergItems: { "1": 4, "2": 4 }, bergTotal: 30 } }).balance.bergTotal).toBe(30);
  });

  it("keeps the gait choices to the chart's own, and the exclusive ones alone", () => {
    expect(refused({ gait: { patterns: ["moonwalk"] } })).toMatch(/does not offer/);
    expect(refused({ gait: { patterns: ["normal", "ataxic"] } })).toMatch(/"Normal" cannot be combined/);
    expect(refused({ gait: { aids: ["none", "stick"] } })).toMatch(/"No aid" cannot be combined/);
    expect(ok({ gait: { patterns: ["ataxic", "ataxic"] } }).gait.patterns).toEqual(["ataxic"]);
  });

  it("refuses an impossible or abandoned timed test, and timing someone who cannot walk", () => {
    expect(refused({ gait: { tugSeconds: 0.2 } })).toMatch(/between 1 and 600/);
    expect(refused({ gait: { tenMetreWalkSeconds: 900 } })).toMatch(/between 1 and 600/);
    expect(refused({ gait: { tugSeconds: "12" } })).toMatch(/number of seconds/);
    expect(refused({ gait: { patterns: ["unable"], tugSeconds: 30 } })).toMatch(/unable to walk/);
    expect(ok({ gait: { patterns: ["unable"], aids: ["wheelchair"] } }).gait.aids).toEqual(["wheelchair"]);
  });

  it("caps the notes", () => {
    expect(refused({ notes: "x".repeat(4001) })).toMatch(/too long/);
    expect(refused({ notes: 42 })).toMatch(/text/);
  });
});

describe("reading an exam", () => {
  const exam = ok({
    bilateral: {
      power_shoulder_abduction: { left: "3", right: "5" },
      power_hip_flexion: { left: "4", right: "5" },
      power_knee_extension: { left: "5", right: "5" },
      tone_elbow_flexors: { left: "2", right: "0" },
      reflex_biceps: { left: "1+", right: "3+" },
      sens_lt_foot: { left: "impaired" },
    },
    balance: { bergTotal: 38 },
    gait: { tugSeconds: 14, tenMetreWalkSeconds: 16 },
  });

  it("flags a one-grade difference between sides, and names the side further from normal", () => {
    const found = asymmetries(exam);
    expect(found.map((a) => a.rowKey)).toEqual([
      "tone_elbow_flexors",
      "power_shoulder_abduction",
      "power_hip_flexion",
      "reflex_biceps",
    ]);
    expect(found.find((a) => a.rowKey === "power_hip_flexion")?.moreAffected).toBe("left");
    expect(found.find((a) => a.rowKey === "tone_elbow_flexors")?.moreAffected).toBe("left");
    // 1+ against 3+: different, but equally far from normal.
    expect(found.find((a) => a.rowKey === "reflex_biceps")?.moreAffected).toBeNull();
    // A single side is never an asymmetry -- the other was not tested.
    expect(found.some((a) => a.rowKey === "sens_lt_foot")).toBe(false);
  });

  it("tallies tested and abnormal rows per section", () => {
    const t = sectionTallies(exam);
    expect(t.power).toMatchObject({ tested: 3, abnormal: 2, rows: 11 });
    expect(t.tone).toMatchObject({ tested: 1, abnormal: 1 });
    expect(t.coordination).toMatchObject({ tested: 0, abnormal: 0, rows: 3 });
  });

  it("builds the headline figures", () => {
    const h = neuroHeadline(exam);
    expect(h.berg).toEqual({ total: 38, band: "medium" });
    expect(h.tug).toEqual({ seconds: 14, atRisk: true });
    expect(h.walk).toEqual({ seconds: 16, speed: 0.63, band: "limited" });
    expect(h.asymmetryCount).toBe(4);
    expect(h.predominantSide).toBe("left");
    expect(neuroHeadline(emptyNeuroFindings()).berg).toBeNull();
  });

  it("uses Berg's own bands at their edges", () => {
    expect(bergRiskBand(0)).toBe("high");
    expect(bergRiskBand(20)).toBe("high");
    expect(bergRiskBand(21)).toBe("medium");
    expect(bergRiskBand(40)).toBe("medium");
    expect(bergRiskBand(41)).toBe("low");
    expect(bergRiskBand(56)).toBe("low");
  });

  it("bands walking speed from the 10-metre time", () => {
    expect(gaitSpeedFromTenMetre(8)).toBe(1.25);
    expect(gaitSpeedBand(0.39)).toBe("household");
    expect(gaitSpeedBand(0.4)).toBe("limited");
    expect(gaitSpeedBand(0.8)).toBe("community");
  });

  it("sums the Berg items only once all fourteen are in", () => {
    expect(bergTotalFromItems(allBerg(4))).toBe(56);
    expect(bergTotalFromItems({ "1": 4 })).toBeNull();
    expect(bergTotalFromItems(undefined)).toBeNull();
  });
});

describe("compareNeuroExams", () => {
  const previous = ok({
    bilateral: {
      power_shoulder_abduction: { left: "2", right: "5" },
      tone_elbow_flexors: { left: "3", right: "0" },
      reflex_knee: { left: "1+" },
      sens_lt_foot: { left: "absent" },
    },
    balance: { bergTotal: 30, romberg: "positive" },
    gait: { tugSeconds: 20, patterns: ["hemiplegic"], aids: ["walking_frame"] },
  });
  const current = ok({
    bilateral: {
      power_shoulder_abduction: { left: "4", right: "5" },
      tone_elbow_flexors: { left: "3", right: "1" },
      reflex_knee: { left: "3+" },
      coord_heel_shin: { left: "impaired" },
    },
    balance: { bergTotal: 41, romberg: "positive" },
    gait: { tugSeconds: 15.5, patterns: ["hemiplegic"], aids: ["stick"] },
  });

  it("reports only what was recorded both times, in the right direction", () => {
    const changes = compareNeuroExams(current, previous);
    const byId = Object.fromEntries(changes.map((c) => [c.id, c]));
    expect(byId["power_shoulder_abduction:left"]).toMatchObject({ from: "2", to: "4", direction: "better" });
    expect(byId["tone_elbow_flexors:right"]).toMatchObject({ from: "0", to: "1", direction: "worse" });
    expect(byId["reflex_knee:left"]).toMatchObject({ direction: "changed" });
    expect(byId["balance.bergTotal"]).toMatchObject({ from: "30/56", to: "41/56", direction: "better" });
    expect(byId["gait.tugSeconds"]).toMatchObject({ direction: "better" });
    expect(byId["gait.aids"]).toMatchObject({ from: "Walking frame", to: "Walking stick", direction: "changed" });
    // Unchanged, tested once, or only in one of the two: not a change.
    expect(byId["tone_elbow_flexors:left"]).toBeUndefined();
    expect(byId["power_shoulder_abduction:right"]).toBeUndefined();
    expect(byId["coord_heel_shin:left"]).toBeUndefined();
    expect(byId["sens_lt_foot:left"]).toBeUndefined();
    expect(byId["balance.romberg"]).toBeUndefined();
    expect(byId["gait.patterns"]).toBeUndefined();
  });

  it("reads a slower walk as worse", () => {
    const slower = compareNeuroExams(
      ok({ gait: { tenMetreWalkSeconds: 25 } }),
      ok({ gait: { tenMetreWalkSeconds: 18 } })
    );
    expect(slower).toEqual([expect.objectContaining({ id: "gait.tenMetreWalkSeconds", direction: "worse" })]);
  });
});

describe("helpers the form and the record lean on", () => {
  it("marks the rest of a section normal without touching a chosen value", () => {
    const next = markSectionNormal({ power_hip_flexion: { left: "3" } }, "power");
    expect(next.power_hip_flexion).toEqual({ left: "3", right: "5" });
    expect(next.power_shoulder_abduction).toEqual({ left: "5", right: "5" });
    expect(next.tone_elbow_flexors).toBeUndefined();
    const reflexes = markSectionNormal({}, "reflexes");
    expect(reflexes.reflex_biceps).toEqual({ left: "2+", right: "2+" });
    expect(reflexes.reflex_plantar).toEqual({ left: "flexor", right: "flexor" });
  });

  it("says when nothing was recorded", () => {
    expect(isNeuroExamEmpty(emptyNeuroFindings())).toBe(true);
    expect(isNeuroExamEmpty({ ...emptyNeuroFindings(), notes: "seen" })).toBe(false);
  });

  it("renders an unreadable stored row as an empty exam rather than throwing", () => {
    expect(readStoredFindings({ bilateral: { nonsense: { left: "x" } } })).toEqual(emptyNeuroFindings());
    expect(readStoredFindings(null)).toEqual(emptyNeuroFindings());
  });

  it("orders stored rows newest first", () => {
    const parsed = parseNeuroAssessments([
      { id: "a", created_at: "2026-10-01T05:00:00Z", submitted_by_role: "therapist", schema_version: 1, findings: { notes: "first" } },
      { id: "b", created_at: "2026-10-08T05:00:00Z", submitted_by_role: "therapist", schema_version: 1, findings: { notes: "second" } },
    ]);
    expect(parsed.map((p) => p.id)).toEqual(["b", "a"]);
    expect(parsed[0].findings.notes).toBe("second");
  });

  it("prints only what was examined, naming each scale once", () => {
    const lines = describeNeuroExamForText(
      ok({
        bilateral: { power_hip_flexion: { left: "3", right: "5" }, coord_finger_nose: { right: "impaired" } },
        balance: { bergTotal: 45 },
        gait: { aids: ["stick"], tugSeconds: 12 },
      })
    );
    expect(lines).toEqual([
      "Power (Oxford / MRC scale) - left / right:",
      "  Lower limb, Hip flexion: 3 / 5",
      "Coordination - left / right:",
      "  Finger-nose: not tested / Impaired",
      "Balance: Berg 45/56 (low fall risk)",
      "Gait: aids: walking stick; Timed Up and Go 12 s",
    ]);
  });
});
