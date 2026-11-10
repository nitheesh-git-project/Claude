import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROFILE_KINDS } from "@/lib/outcomeMeasures";
import {
  LOCKED_WIDGET_KEYS,
  PROFILE_WIDGETS,
  cleanOverrideReason,
  filterGraphLines,
  graphLineWidgetKey,
  hiddenForPatientText,
  resolveProfileWidgets,
  sectionsShownText,
  validateWidgetChoice,
  widgetShown,
  widgetsForKind,
} from "@/lib/profileWidgets";

const ok = (choices: { widgetKey: string; visible: boolean }[]) => ({ status: "ok" as const, choices });

describe("the registry", () => {
  it("gives every profile kind the sections a Health Profile always has", () => {
    for (const kind of PROFILE_KINDS) {
      const keys = widgetsForKind(kind).map((w) => w.key);
      for (const k of ["status_header", "home_exercises", "key_numbers", "progress_graph", "steps", "measures_table", "condition_answers", "reports_scans", "care_plan_history"]) {
        expect(keys, `${kind} lacks ${k}`).toContain(k);
      }
      // Each kind has its own condition picture.
      expect(widgetsForKind(kind).some((w) => w.group === "picture"), kind).toBe(true);
    }
  });

  it("has unique keys, a label and a description for every widget", () => {
    const keys = PROFILE_WIDGETS.map((w) => w.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const w of PROFILE_WIDGETS) {
      expect(w.label.trim(), w.key).not.toBe("");
      expect(w.description.trim(), w.key).not.toBe("");
      expect(w.key).toMatch(/^[a-z0-9_.:]{1,80}$/);
      if (w.locked) expect(w.lockedReason, w.key).toBeTruthy();
    }
  });

  it("locks the safety sections, and the schema's CHECK lists exactly the same keys", () => {
    const locked = PROFILE_WIDGETS.filter((w) => w.locked).map((w) => w.key).sort();
    expect(locked).toEqual([...LOCKED_WIDGET_KEYS].sort());
    expect(locked).toEqual(["cardio_safety", "fall_risk", "home_exercises", "orthostatic", "precautions", "status_header"]);
    const schema = readFileSync("supabase/schema.sql", "utf8");
    for (const name of ["profile_widget_kind_settings_locked_shown", "patient_profile_widget_overrides_locked_shown"]) {
      const at = schema.lastIndexOf(`constraint ${name} check`);
      expect(at, name).toBeGreaterThan(0);
      const body = schema.slice(at, schema.indexOf(")\n", at));
      const listed = [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
      expect(listed, name).toEqual(locked);
    }
  });

  it("gives the geriatric and heart and lung graphs only the lines they draw", () => {
    expect(widgetsForKind("geriatric").filter((w) => w.group === "graph_line").map((w) => w.key).sort()).toEqual(
      ["graph:chair_stand_30s", "graph:gait_speed_4m", "graph:tug"]
    );
    expect(widgetsForKind("cardiopulmonary").filter((w) => w.group === "graph_line").map((w) => w.key).sort()).toEqual(
      ["graph:breathlessness_nrs", "graph:resting_heart_rate", "graph:six_minute_walk"]
    );
  });
});

describe("resolveProfileWidgets", () => {
  it("shows the defaults when nothing is chosen", () => {
    const layout = resolveProfileWidgets({ kind: "ortho" });
    expect(layout.hiddenSections).toEqual([]);
    expect(layout.sectionsShown).toBe(layout.sectionsTotal);
    expect(layout.widgets.every((r) => r.source === "default" || r.source === "locked")).toBe(true);
  });

  it("lets the patient override beat the condition kind, which beats the default", () => {
    const layout = resolveProfileWidgets({
      kind: "ortho",
      kindChoices: ok([{ widgetKey: "measures_table", visible: false }, { widgetKey: "body_map", visible: false }]),
      patientChoices: ok([{ widgetKey: "body_map", visible: true }, { widgetKey: "reports_scans", visible: false }]),
    });
    const by = Object.fromEntries(layout.widgets.map((r) => [r.widget.key, r]));
    expect(by.measures_table).toMatchObject({ visible: false, source: "kind", inherited: false });
    expect(by.body_map).toMatchObject({ visible: true, source: "patient", inherited: false });
    expect(by.reports_scans).toMatchObject({ visible: false, source: "patient", inherited: true });
    expect(by.steps).toMatchObject({ visible: true, source: "default" });
    expect(layout.hiddenSections.map((r) => r.widget.key).sort()).toEqual(["measures_table", "reports_scans"]);
    expect(sectionsShownText(layout)).toBe(`${layout.sectionsTotal - 2} of ${layout.sectionsTotal} sections shown`);
  });

  it("never hides a locked widget, whatever a row says", () => {
    const layout = resolveProfileWidgets({
      kind: "geriatric",
      kindChoices: ok([{ widgetKey: "fall_risk", visible: false }, { widgetKey: "status_header", visible: false }]),
      patientChoices: ok([{ widgetKey: "orthostatic", visible: false }, { widgetKey: "home_exercises", visible: false }]),
    });
    for (const k of ["fall_risk", "status_header", "orthostatic", "home_exercises"]) {
      expect(widgetShown(layout, k), k).toBe(true);
      expect(layout.widgets.find((r) => r.widget.key === k)?.source).toBe("locked");
    }
    expect(resolveProfileWidgets({ kind: "cardiopulmonary", patientChoices: ok([{ widgetKey: "cardio_safety", visible: false }, { widgetKey: "precautions", visible: false }]) }).hiddenSections).toEqual([]);
  });

  it("ignores unknown keys and keys of another kind", () => {
    const layout = resolveProfileWidgets({
      kind: "ortho",
      kindChoices: ok([{ widgetKey: "no_such_thing", visible: false }, { widgetKey: "diary", visible: false }, { widgetKey: "fall_risk", visible: false }]),
    });
    expect(layout.hiddenSections).toEqual([]);
    expect(widgetShown(layout, "no_such_thing")).toBe(true);
  });

  it("skips an unreadable layer and says so, rather than hiding anything", () => {
    const layout = resolveProfileWidgets({
      kind: "neuro",
      kindChoices: { status: "unreadable" },
      patientChoices: ok([{ widgetKey: "diary", visible: false }]),
    });
    expect(layout.kindUnreadable).toBe(true);
    expect(layout.patientUnreadable).toBe(false);
    expect(layout.hiddenSections.map((r) => r.widget.key)).toEqual(["diary"]);
    const both = resolveProfileWidgets({ kind: "neuro", kindChoices: { status: "unreadable" }, patientChoices: { status: "unreadable" } });
    expect(both.hiddenSections).toEqual([]);
    expect(both.patientUnreadable).toBe(true);
  });

  it("hides a graph line with its graph, and filters only the patient's lines", () => {
    const series = [{ measureKey: "pain_nprs" }, { measureKey: "joint_range" }, { measureKey: "unknown_line" }];
    const layout = resolveProfileWidgets({ kind: "ortho", kindChoices: ok([{ widgetKey: graphLineWidgetKey("joint_range"), visible: false }]) });
    const knee = PROFILE_WIDGETS.find((w) => w.key === graphLineWidgetKey("joint_range"));
    expect(knee).toBeTruthy();
    expect(filterGraphLines(series, layout).map((s) => s.measureKey)).toEqual(["pain_nprs", "unknown_line"]);
    expect(layout.hiddenGraphLines.map((r) => r.widget.key)).toEqual([knee!.key]);
    expect(filterGraphLines(series, null)).toEqual(series);
    const noGraph = resolveProfileWidgets({ kind: "geriatric", kindChoices: ok([{ widgetKey: "progress_graph", visible: false }]) });
    expect(noGraph.widgets.filter((r) => r.widget.parent === "progress_graph").every((r) => !r.visible)).toBe(true);
    // Graph lines are counted apart from the sections.
    expect(noGraph.hiddenSections.map((r) => r.widget.key)).toEqual(["progress_graph"]);
  });
});

describe("the routes' checks", () => {
  it("refuses an unknown section, hiding a locked one, and a value that is not yes, no or reset", () => {
    expect(validateWidgetChoice({ widgetKey: "nope", visible: false }, "ortho")).toMatchObject({ ok: false, code: "unknown_widget" });
    expect(validateWidgetChoice({ widgetKey: "fall_risk", visible: false }, "ortho")).toMatchObject({ ok: false, code: "unknown_widget" });
    expect(validateWidgetChoice({ widgetKey: "fall_risk", visible: false }, "geriatric")).toMatchObject({ ok: false, code: "locked_widget" });
    expect(validateWidgetChoice({ widgetKey: "measures_table", visible: "no" }, "ortho")).toMatchObject({ ok: false, code: "bad_value" });
    expect(validateWidgetChoice({ widgetKey: "measures_table", visible: false }, "ortho")).toMatchObject({ ok: true, visible: false });
    expect(validateWidgetChoice({ widgetKey: "measures_table", visible: null }, "ortho")).toMatchObject({ ok: true, visible: null });
  });

  it("tidies a reason and refuses a long one", () => {
    expect(cleanOverrideReason("  too   much  ")).toEqual({ ok: true, reason: "too much" });
    expect(cleanOverrideReason("")).toEqual({ ok: true, reason: null });
    expect(cleanOverrideReason("x".repeat(201)).ok).toBe(false);
    expect(cleanOverrideReason(4).ok).toBe(false);
  });

  it("words the therapist's disclosure", () => {
    expect(hiddenForPatientText(1)).toBe("1 section hidden for this patient");
    expect(hiddenForPatientText(3)).toBe("3 sections hidden for this patient");
  });
});

describe("the admin routes' gates", () => {
  const routes: [string, string][] = [
    ["src/app/api/admin/profile-widgets/kind/route.ts", "settings"],
    ["src/app/api/admin/profile-widgets/patient/route.ts", "people"],
  ];
  it("guard with requireAdminScope on the capability's section and parse the body safely", () => {
    for (const [file, section] of routes) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain(`requireAdminScope("${section}")`);
      expect(source, file).not.toContain("getAdminUser");
      expect(source, file).toContain("parseJsonBody");
      expect(source, file).not.toMatch(/request\.json\(\)/);
      // The audit row is written after the change.
      expect(source, file).toContain("recordAdminActivity");
      // The patient's kind comes from the server, never the body.
      if (section === "people") expect(source).toContain("loadPatientProfileKind(admin, patientId)");
    }
  });
});

describe("exportPlan", () => {
  it("prints everything with no note when nothing is hidden", async () => {
    const { exportPlan } = await import("@/lib/profileWidgets");
    const plan = exportPlan(resolveProfileWidgets({ kind: "ortho" }));
    expect(plan).toMatchObject({ answers: true, bodyMap: true, reports: true, steps: true, measures: true, note: null });
    expect(exportPlan(null).note).toBeNull();
  });
  it("leaves out what the page hides, and says so", async () => {
    const { exportPlan } = await import("@/lib/profileWidgets");
    const plan = exportPlan(
      resolveProfileWidgets({ kind: "geriatric", patientChoices: ok([{ widgetKey: "measures_table", visible: false }, { widgetKey: "diary", visible: false }, { widgetKey: "fall_risk", visible: false }]) })
    );
    expect(plan.measures).toBe(false);
    expect(plan.diary).toBe(false);
    expect(plan.steps).toBe(true);
    expect(plan.note).toContain("Measures table");
    expect(plan.note).toContain("Diary");
    expect(plan.note).not.toContain("Fall-risk");
  });
});
