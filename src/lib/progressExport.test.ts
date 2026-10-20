import { describe, expect, it } from "vitest";
import { buildProgressExport } from "@/lib/progressExport";
import { formatClinicDate } from "@/lib/formatDateTime";
import type { CareGoal, CareMilestone } from "@/lib/careGoals";
import type { MeasurementPoint } from "@/lib/outcomeSeries";

const NOW = Date.parse("2026-10-20T06:00:00.000Z");

const goal = (over: Partial<CareGoal> = {}): CareGoal => ({
  id: "g1",
  patientId: "p",
  profileKind: "ortho",
  goalText: "Play badminton with my friends again",
  targetDate: "2026-12-01",
  status: "active",
  authoredBy: "t",
  authoredByRole: "therapist",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...over,
});

const milestone = (over: Partial<CareMilestone> = {}): CareMilestone => ({
  id: "m1",
  goalId: "g1",
  patientId: "p",
  title: "Knee bends to 125",
  criterion: "Bends to 125 degrees",
  phase: null,
  status: "working",
  reachedAt: null,
  reachedMeasurementId: null,
  targetDate: "2026-10-01",
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

const point = (id: string, value: number, measuredAt: string): MeasurementPoint => ({
  id,
  patientId: "p",
  appointmentId: null,
  measureKey: "joint_range",
  variant: "knee_flexion_active",
  side: "right",
  value,
  items: null,
  conditions: { setting: "in_person", testerName: "Anil" },
  recordedBy: "t",
  recordedByRole: "therapist",
  measuredAt,
  createdAt: measuredAt,
  schemaVersion: 1,
});

describe("buildProgressExport", () => {
  const points = [point("a", 85, "2026-09-03T05:00:00.000Z"), point("b", 122, "2026-10-12T05:00:00.000Z")];

  it("prints the goal, its steps and a first / now / goal table", () => {
    const out = buildProgressExport({ profileKind: "ortho", points, goals: [goal()], milestones: [milestone()], nowMs: NOW });
    expect(out.goal).toEqual({ text: "Play badminton with my friends again", targetDate: formatClinicDate("2026-12-01"), status: "In progress" });
    expect(out.milestones).toHaveLength(1);
    expect(out.milestones[0]).toMatchObject({ title: "Knee bends to 125", status: "Working on it", when: `Target ${formatClinicDate("2026-10-01")} (past its date)` });
    expect(out.measures).toHaveLength(1);
    expect(out.measures[0]).toMatchObject({
      first: `85\u00b0 (${formatClinicDate("2026-09-03T05:00:00.000Z")})`,
      now: `122\u00b0 (${formatClinicDate("2026-10-12T05:00:00.000Z")})`,
      goal: "125°",
      reviews: 2,
    });
    expect(out.measures[0].name).toMatch(/right/);
    expect(out.measures[0].change).toBe("Better");
  });

  it("says first reading, not a change, with one review", () => {
    const out = buildProgressExport({ profileKind: "ortho", points: [points[0]], goals: [], milestones: [], nowMs: NOW });
    expect(out.measures[0]).toMatchObject({ now: "First reading", change: "First reading", goal: "Not set" });
    expect(out.goal).toBeNull();
    expect(out.milestones).toEqual([]);
  });

  it("marks a reached step with its date and a reached goal", () => {
    const reached = milestone({ status: "reached", reachedAt: "2026-10-05T05:00:00.000Z", targetDate: null });
    const out = buildProgressExport({ profileKind: "ortho", points, goals: [goal()], milestones: [reached], nowMs: NOW });
    expect(out.milestones[0]).toMatchObject({ status: "Reached", when: `Reached ${formatClinicDate("2026-10-05T05:00:00.000Z")}` });
    expect(out.measures[0].goal).toBe("125° (reached)");
  });

  it("falls back to the newest goal when none is active, and ignores other goals' steps", () => {
    const old = goal({ id: "g0", status: "achieved", goalText: "Walk to the shop", createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = goal({ id: "g2", status: "closed", goalText: "Climb stairs", createdAt: "2026-06-01T00:00:00.000Z" });
    const out = buildProgressExport({
      profileKind: "ortho",
      points: [],
      goals: [old, newer],
      milestones: [milestone({ goalId: "g0", title: "Other goal's step" })],
      nowMs: NOW,
    });
    expect(out.goal).toMatchObject({ text: "Climb stairs", status: "Closed" });
    expect(out.milestones).toEqual([]);
  });

  it("prints the phase and the overrule with their dates and the reason, and says when none is set", () => {
    const none = buildProgressExport({ profileKind: "ortho", points: [], goals: [], milestones: [], nowMs: NOW });
    expect(none.care).toEqual({ phase: null, override: null });

    const out = buildProgressExport({
      profileKind: "ortho",
      points: [],
      goals: [],
      milestones: [],
      nowMs: NOW,
      careStatus: {
        phase: { phase: "Strengthen", eventId: "e1", setAt: "2026-10-01T05:00:00.000Z", setBy: "t", setByRole: "therapist", reason: null },
        override: {
          status: "needs_attention",
          reason: "Swelling returned after the stairs test.",
          eventId: "e2",
          setAt: "2026-10-12T05:00:00.000Z",
          setBy: "t",
          setByRole: "therapist",
          stale: false,
        },
      },
    });
    expect(out.care.phase).toEqual({ name: "Strengthen", setOn: formatClinicDate("2026-10-01T05:00:00.000Z") });
    expect(out.care.override).toEqual({
      statusLabel: "Needs attention",
      reason: "Swelling returned after the stairs test.",
      setOn: formatClinicDate("2026-10-12T05:00:00.000Z"),
    });
  });
});
