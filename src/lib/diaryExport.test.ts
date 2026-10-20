import { describe, expect, it } from "vitest";
import { buildDiaryExport } from "@/lib/diaryExport";
import type { DiaryEntry } from "@/lib/patientDiary";

const NOW = Date.parse("2026-10-20T06:30:00Z");
const e = (over: Partial<DiaryEntry>): DiaryEntry =>
  ({
    id: "x",
    patientId: "p",
    kind: "fall",
    occurredAt: "2026-10-14T05:00:00Z",
    details: { injured: false },
    note: "a private note that must never be printed",
    enteredBy: "p",
    enteredByRole: "patient",
    confirmedBy: null,
    confirmedByRole: null,
    confirmedAt: null,
    createdAt: "2026-10-14T05:00:00Z",
    ...over,
  }) as DiaryEntry;
const confirmed = { confirmedBy: "t", confirmedByRole: "therapist", confirmedAt: "2026-10-15T05:00:00Z" } as const;

describe("buildDiaryExport", () => {
  it("is null for a record that keeps no diary", () => {
    expect(buildDiaryExport([], { profileKind: "ortho", nowMs: NOW })).toBeNull();
    expect(buildDiaryExport([], { profileKind: "pediatrics", nowMs: NOW })).toBeNull();
  });

  it("counts falls and near-misses, split into patient reported and confirmed, and prints no note", () => {
    const out = buildDiaryExport(
      [e({ id: "1" }), e({ id: "2", ...confirmed }), e({ id: "3", kind: "near_miss", details: {} }), e({ id: "4", enteredByRole: "therapist" })],
      { profileKind: "neuro", nowMs: NOW }
    )!;
    expect(out.lines).toEqual([
      { label: "Falls", unit: "falls", total: 3, patientReported: 1, confirmed: 2 },
      { label: "Near-misses", unit: "near misses", total: 1, patientReported: 1, confirmed: 0 },
    ]);
    expect(JSON.stringify(out)).not.toContain("private note");
    expect(out.freezingWeeks).toEqual([]);
  });

  it("adds Parkinson's freezing: episodes (not entries), and the weeks somebody wrote in", () => {
    const out = buildDiaryExport(
      [
        e({ id: "1", kind: "freezing", occurredAt: "2026-10-07T05:00:00Z", details: { period: "week", count: 5 } }),
        e({ id: "2", kind: "freezing", occurredAt: "2026-10-14T05:00:00Z", details: { period: "episode", count: 1 }, ...confirmed }),
      ],
      { profileKind: "neuro_parkinsons", nowMs: NOW }
    )!;
    expect(out.lines[0]).toEqual({ label: "Freezing of gait", unit: "episodes", total: 6, patientReported: 5, confirmed: 1 });
    expect(out.freezingWeeks).toEqual([
      { weekOf: "5 Oct 2026", episodes: 5, confirmed: false, partial: false },
      { weekOf: "12 Oct 2026", episodes: 1, confirmed: true, partial: false },
    ]);
    expect(out.firstOn).toBe("7 Oct 2026");
    expect(out.lastOn).toBe("14 Oct 2026");
  });

  it("says an empty diary is empty, not that nothing happened", () => {
    const out = buildDiaryExport([], { profileKind: "neuro", nowMs: NOW })!;
    expect(out.firstOn).toBeNull();
    expect(out.lines.every((l) => l.total === 0)).toBe(true);
  });
});
