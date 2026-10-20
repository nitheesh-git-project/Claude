import { describe, expect, it } from "vitest";
import {
  DIARY_BACKDATE_MAX_DAYS,
  clinicWeekStart,
  confirmationRefusal,
  diaryKindsFor,
  diaryProvenance,
  diaryProvenanceLabel,
  entriesAwaitingConfirmation,
  fallsSince,
  freezingWeeklySeries,
  parseDiaryEntryRow,
  sameDiaryContent,
  validateDiaryDetails,
  validateDiaryEntry,
  weeklyDiaryTotals,
  type DiaryEntry,
} from "@/lib/patientDiary";

// 2026-10-20 is a Tuesday; noon IST.
const NOW = Date.parse("2026-10-20T06:30:00Z");
const PD = { profileKind: "neuro_parkinsons" as const, nowMs: NOW };

function entry(over: Partial<DiaryEntry>): DiaryEntry {
  return {
    id: over.id ?? "e1",
    patientId: "p1",
    kind: "freezing",
    occurredAt: "2026-10-19T05:00:00Z",
    details: { period: "episode", count: 1 },
    note: null,
    enteredBy: "p1",
    enteredByRole: "patient",
    confirmedBy: null,
    confirmedByRole: null,
    confirmedAt: null,
    createdAt: "2026-10-19T05:01:00Z",
    ...over,
  };
}

describe("which kinds a profile's diary offers", () => {
  it("offers freezing only on the Parkinson's sub-profile", () => {
    expect(diaryKindsFor("neuro_parkinsons")).toEqual(["freezing", "fall", "near_miss"]);
    expect(diaryKindsFor("neuro")).not.toContain("freezing");
    expect(diaryKindsFor("ortho")).toEqual([]);
    expect(diaryKindsFor("cardiopulmonary")).toEqual(["active_minutes"]);
  });
});

describe("validateDiaryEntry", () => {
  it("accepts a freezing episode and normalises the time", () => {
    const r = validateDiaryEntry({ kind: "freezing", occurredAt: "2026-10-20T10:00:00+05:30", details: { period: "episode", count: 1, trigger: "doorway", medicationState: "off" } }, PD);
    expect(r).toEqual({
      ok: true,
      entry: { kind: "freezing", occurredAt: "2026-10-20T04:30:00.000Z", details: { period: "episode", count: 1, trigger: "doorway", medicationState: "off" }, note: null },
    });
  });

  it("refuses a kind the profile does not offer, with a code", () => {
    const r = validateDiaryEntry({ kind: "freezing", occurredAt: "2026-10-20T04:00:00Z", details: { period: "episode", count: 1 } }, { ...PD, profileKind: "neuro" });
    expect(r).toMatchObject({ ok: false, code: "diary_kind_not_offered" });
    expect(validateDiaryEntry({ kind: "active_minutes", occurredAt: "2026-10-20T04:00:00Z", details: { minutes: 20 } }, PD)).toMatchObject({ ok: false });
  });

  it("refuses a future time and one older than the backdate window", () => {
    expect(validateDiaryEntry({ kind: "fall", occurredAt: "2026-10-21T04:00:00Z", details: { injured: false } }, PD)).toMatchObject({ ok: false });
    const old = new Date(NOW - (DIARY_BACKDATE_MAX_DAYS + 1) * 86_400_000).toISOString();
    expect(validateDiaryEntry({ kind: "fall", occurredAt: old, details: { injured: false } }, PD)).toMatchObject({ ok: false });
    // A phone a minute fast is fine.
    expect(validateDiaryEntry({ kind: "near_miss", occurredAt: new Date(NOW + 60_000).toISOString() }, PD)).toMatchObject({ ok: true });
  });

  it("trims the note, treats blank as none and refuses one too long", () => {
    const ok = validateDiaryEntry({ kind: "near_miss", occurredAt: "2026-10-20T04:00:00Z", note: "  caught the  rail  " }, PD);
    expect(ok.ok && ok.entry.note).toBe("caught the rail");
    const blank = validateDiaryEntry({ kind: "near_miss", occurredAt: "2026-10-20T04:00:00Z", note: "   " }, PD);
    expect(blank.ok && blank.entry.note).toBeNull();
    expect(validateDiaryEntry({ kind: "near_miss", occurredAt: "2026-10-20T04:00:00Z", note: "x".repeat(501) }, PD)).toMatchObject({ ok: false });
  });

  it("refuses an unknown kind or a missing time", () => {
    expect(validateDiaryEntry({ kind: "tremor", occurredAt: "2026-10-20T04:00:00Z" }, PD)).toMatchObject({ ok: false });
    expect(validateDiaryEntry({ kind: "fall", details: { injured: true } }, PD)).toMatchObject({ ok: false });
    expect(validateDiaryEntry(null, PD)).toMatchObject({ ok: false });
  });
});

describe("validateDiaryDetails", () => {
  it("refuses an unknown key rather than storing it", () => {
    expect(validateDiaryDetails("fall", { injured: false, severity: 3 })).toMatchObject({ ok: false });
  });

  it("insists one episode is a count of one, and a tally is a whole number in range", () => {
    expect(validateDiaryDetails("freezing", { period: "episode", count: 3 })).toMatchObject({ ok: false });
    expect(validateDiaryDetails("freezing", { period: "week", count: 3 })).toMatchObject({ ok: true });
    expect(validateDiaryDetails("freezing", { period: "day", count: 2.5 })).toMatchObject({ ok: false });
    expect(validateDiaryDetails("freezing", { period: "day", count: 0 })).toMatchObject({ ok: false });
    expect(validateDiaryDetails("freezing", { count: 1 })).toMatchObject({ ok: false });
  });

  it("needs to know whether a fall hurt, and keeps unsaid choices absent", () => {
    expect(validateDiaryDetails("fall", {})).toMatchObject({ ok: false });
    expect(validateDiaryDetails("fall", { injured: true })).toEqual({ ok: true, details: { injured: true } });
    expect(validateDiaryDetails("fall", { injured: true, place: "garden" })).toMatchObject({ ok: false });
    expect(validateDiaryDetails("near_miss", undefined)).toEqual({ ok: true, details: {} });
  });

  it("bounds active minutes", () => {
    expect(validateDiaryDetails("active_minutes", { minutes: 30, intensity: "moderate" })).toMatchObject({ ok: true });
    expect(validateDiaryDetails("active_minutes", { minutes: 0 })).toMatchObject({ ok: false });
    expect(validateDiaryDetails("active_minutes", { minutes: 2000 })).toMatchObject({ ok: false });
  });
});

describe("provenance and confirmation", () => {
  it("is patient reported until confirmed, and stays patient reported after", () => {
    expect(diaryProvenance(entry({}))).toBe("patient_reported");
    expect(diaryProvenance(entry({ confirmedAt: "2026-10-20T05:00:00Z" }))).toBe("patient_reported_confirmed");
    expect(diaryProvenance(entry({ enteredByRole: "therapist" }))).toBe("clinician_recorded");
    expect(diaryProvenanceLabel("patient_reported", "clinician")).toBe("Patient reported");
    expect(diaryProvenanceLabel("patient_reported", "patient")).toBe("You noted this");
  });

  it("lets a therapist confirm a patient's unconfirmed entry once", () => {
    expect(confirmationRefusal(entry({}))).toBeNull();
    expect(confirmationRefusal(entry({ confirmedAt: "2026-10-20T05:00:00Z" }))).toEqual({ code: "already_confirmed" });
    expect(confirmationRefusal(entry({ enteredByRole: "admin" }))).toEqual({ code: "not_patient_reported" });
  });

  it("lists what still needs confirming, oldest first", () => {
    const list = entriesAwaitingConfirmation([
      entry({ id: "b", occurredAt: "2026-10-19T05:00:00Z" }),
      entry({ id: "a", occurredAt: "2026-10-12T05:00:00Z" }),
      entry({ id: "c", confirmedAt: "2026-10-19T06:00:00Z" }),
    ]);
    expect(list.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("clinic weeks", () => {
  it("starts on Monday in the clinic's zone, not UTC's", () => {
    // 00:30 IST on Monday 19 October is still Sunday in UTC.
    expect(clinicWeekStart("2026-10-18T19:00:00Z")).toBe("2026-10-19");
    expect(clinicWeekStart("2026-10-18T18:00:00Z")).toBe("2026-10-12");
    expect(clinicWeekStart(NOW)).toBe("2026-10-19");
  });
});

describe("weeklyDiaryTotals", () => {
  it("adds episodes, falls and near-misses per week and fills empty weeks with zero", () => {
    const weeks = weeklyDiaryTotals(
      [
        entry({ id: "1", occurredAt: "2026-10-05T05:00:00Z", details: { period: "week", count: 6 } }),
        entry({ id: "2", occurredAt: "2026-10-19T05:00:00Z", details: { period: "episode", count: 1 } }),
        entry({ id: "3", occurredAt: "2026-10-20T05:00:00Z", kind: "fall", details: { injured: false }, confirmedAt: "2026-10-20T06:00:00Z" }),
        entry({ id: "4", occurredAt: "2026-10-20T05:30:00Z", kind: "near_miss", details: {} }),
      ],
      { nowMs: NOW }
    );
    expect(weeks.map((w) => w.weekStart)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(weeks[0].totals.freezing).toBe(6);
    expect(weeks[0].entries.freezing).toBe(1);
    expect(weeks[1].totals).toEqual({ freezing: 0, fall: 0, near_miss: 0, active_minutes: 0 });
    expect(weeks[2].totals).toMatchObject({ freezing: 1, fall: 1, near_miss: 1 });
    expect(weeks[2].unconfirmed).toBe(2);
  });

  it("answers the current week alone when nothing is written", () => {
    expect(weeklyDiaryTotals([], { nowMs: NOW })).toHaveLength(1);
  });

  it("sums active minutes as minutes", () => {
    const weeks = weeklyDiaryTotals(
      [entry({ kind: "active_minutes", details: { minutes: 25 } }), entry({ id: "2", kind: "active_minutes", details: { minutes: 15 } })],
      { nowMs: NOW, kinds: ["active_minutes"] }
    );
    expect(weeks.at(-1)?.totals.active_minutes).toBe(40);
  });
});

describe("freezingWeeklySeries", () => {
  it("gives the last N weeks, saying which had nothing written down", () => {
    const series = freezingWeeklySeries(
      [
        entry({ id: "1", occurredAt: "2026-10-13T05:00:00Z", details: { period: "day", count: 4 } }),
        entry({ id: "2", occurredAt: "2026-10-14T05:00:00Z", details: { period: "day", count: 2 }, enteredByRole: "therapist" }),
        entry({ id: "3", occurredAt: "2026-07-01T05:00:00Z", details: { period: "day", count: 9 } }),
      ],
      { nowMs: NOW, weeks: 3 }
    );
    expect(series.map((p) => p.weekStart)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(series[1]).toEqual({ weekStart: "2026-10-12", episodes: 6, written: true, patientReported: false });
    expect(series[0]).toEqual({ weekStart: "2026-10-05", episodes: 0, written: false, patientReported: false });
  });
});

describe("fallsSince", () => {
  it("counts falls, injuries and near-misses on or after a date", () => {
    const r = fallsSince(
      [
        entry({ id: "1", kind: "fall", occurredAt: "2026-09-01T05:00:00Z", details: { injured: true } }),
        entry({ id: "2", kind: "fall", occurredAt: "2026-10-15T05:00:00Z", details: { injured: true }, confirmedAt: "2026-10-16T05:00:00Z" }),
        entry({ id: "3", kind: "fall", occurredAt: "2026-10-18T05:00:00Z", details: { injured: false } }),
        entry({ id: "4", kind: "near_miss", occurredAt: "2026-10-18T06:00:00Z", details: {} }),
      ],
      "2026-10-01T00:00:00Z"
    );
    expect(r).toEqual({ falls: 2, injured: 1, nearMisses: 1, latestFallAt: "2026-10-18T05:00:00Z", unconfirmedFalls: 1 });
  });
});

describe("parseDiaryEntryRow", () => {
  it("reads a stored row and refuses one missing what it needs", () => {
    const row = {
      id: "e1", patient_id: "p1", kind: "fall", occurred_at: "2026-10-19T05:00:00Z", details: { injured: false },
      note: "kitchen", entered_by: "p1", entered_by_role: "patient", confirmed_by: null, confirmed_by_role: null,
      confirmed_at: null, created_at: "2026-10-19T05:01:00Z",
    };
    expect(parseDiaryEntryRow(row)).toMatchObject({ kind: "fall", details: { injured: false }, note: "kitchen", enteredByRole: "patient" });
    expect(parseDiaryEntryRow({ ...row, kind: "tremor" })).toBeNull();
    expect(parseDiaryEntryRow({ ...row, entered_by_role: "hospital" })).toBeNull();
    // Details from a later shape are kept rather than dropping the fall.
    expect(parseDiaryEntryRow({ ...row, details: { injured: false, newField: 1 } })?.details).toEqual({ injured: false, newField: 1 });
  });
});

describe("sameDiaryContent (the double-tap answer)", () => {
  it("ignores key order and the time's spelling", () => {
    const stored = entry({ kind: "fall", occurredAt: "2026-10-19T05:00:00+00:00", details: { place: "other", injured: true } as never, note: "stairs" });
    expect(sameDiaryContent(stored, { kind: "fall", occurredAt: "2026-10-19T05:00:00.000Z", details: { injured: true, place: "other" }, note: "stairs" })).toBe(true);
    expect(sameDiaryContent(stored, { kind: "fall", occurredAt: "2026-10-19T05:00:00.000Z", details: { injured: false, place: "other" }, note: "stairs" })).toBe(false);
  });
});
