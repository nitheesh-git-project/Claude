import { describe, expect, it } from "vitest";
import { exerciseByKey } from "@/lib/exerciseLibrary";
import type { ExercisePlan, TeachingEvent } from "@/lib/exercisePlan";
import { chartMarkText, exerciseChartView } from "@/lib/exerciseChart";

const dose = (k: string) => ({ ...exerciseByKey(k)!.defaultDose });
const plan = (id: string, version: number, status: "active" | "replaced", keys: string[]): ExercisePlan => ({
  id, patientId: "p", version, authoredBy: "t1", runId: null, appointmentId: null, profileKind: "ortho", status,
  createdAt: `2026-10-${10 + version}T10:00:00Z`, replacedAt: status === "replaced" ? "2026-10-20T10:00:00Z" : null,
  items: keys.map((k, i) => ({ id: `${id}-${i}`, planId: id, exerciseKey: k, dose: dose(k), milestoneId: null, sortOrder: i })),
});
const ev = (o: Partial<TeachingEvent>): TeachingEvent => ({
  id: "e", runId: "r", planId: "a", patientId: "p", exerciseKey: "bridge", outcome: "performed_correctly", cueKey: null, reasonKey: null,
  helperPresent: false, actor: "t1", createdAt: "2026-10-12T10:00:00Z", ...o,
});

describe("exerciseChartView", () => {
  it("lists versions newest first with each exercise, its dose and its marks", () => {
    const view = exerciseChartView(
      [plan("a", 1, "replaced", ["bridge"]), plan("b", 2, "active", ["bridge", "heel_slide"])],
      [
        ev({ id: "1", planId: "a", outcome: "needs_practice", cueKey: "back_flat", createdAt: "2026-10-11T10:00:00Z" }),
        ev({ id: "2", planId: "a", exerciseKey: "bridge", outcome: "performed_correctly", createdAt: "2026-10-12T10:00:00Z" }),
        ev({ id: "3", planId: "b", exerciseKey: "heel_slide", outcome: "not_attempted", reasonKey: "no_space" }),
      ],
      new Map([["t1", "Dr Rao"]])
    );
    expect(view.map((v) => v.version)).toEqual([2, 1]);
    expect(view[0].status).toBe("active");
    expect(view[0].items[0].marks).toEqual([]);
    expect(view[0].items[0].latest).toBeNull();
    expect(view[0].items[1].latest).toMatchObject({ text: "Not attempted: Not enough space", by: "Dr Rao" });
    // Both marks stay in the history; the latest is the headline.
    expect(view[1].items[0].marks.map((m) => m.text)).toEqual(["Needs practice: Keep your back flat.", "Performed correctly"]);
    expect(view[1].items[0].latest?.text).toBe("Performed correctly");
    expect(view[0].authoredBy).toBe("Dr Rao");
  });
  it("drops an exercise that left the library and names an unknown author plainly", () => {
    const p = plan("a", 1, "active", ["bridge"]);
    p.items.push({ ...p.items[0], id: "x", exerciseKey: "gone_exercise", sortOrder: 1 });
    const view = exerciseChartView([p], [], new Map());
    expect(view[0].items).toHaveLength(1);
    expect(view[0].authoredBy).toBe("A physiotherapist");
  });
  it("words a mark in the clinician's terms", () => {
    expect(chartMarkText({ outcome: "performed_correctly", cueKey: null, reasonKey: null })).toBe("Performed correctly");
  });
});
