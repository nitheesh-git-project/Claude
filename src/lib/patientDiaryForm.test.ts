import { describe, expect, it } from "vitest";
import { buildDiaryRequest, diaryEntrySummary, emptyDiaryDraft, offeredDiaryKinds } from "@/lib/patientDiaryForm";

// 2026-10-20 is a Tuesday; 12:00 noon IST.
const NOW = Date.parse("2026-10-20T06:30:00Z");
const PD = { profileKind: "neuro_parkinsons" as const, nowMs: NOW };
const NEURO = { profileKind: "neuro" as const, nowMs: NOW };

describe("the diary form", () => {
  it("is dated now in the clinic's zone", () => {
    const d = emptyDiaryDraft(NOW);
    expect(d.date).toBe("2026-10-20");
    expect(d.time).toBe("12:00");
    expect(emptyDiaryDraft(Date.parse("2026-10-19T18:30:00Z")).time).toBe("00:00");
  });

  it("offers only what the profile kind keeps: active minutes to a heart and lung record alone", () => {
    expect(offeredDiaryKinds("neuro")).toEqual(["fall", "near_miss"]);
    expect(offeredDiaryKinds("neuro_parkinsons")).toEqual(["freezing", "fall", "near_miss"]);
    expect(offeredDiaryKinds("cardiopulmonary")).toEqual(["active_minutes"]);
    expect(offeredDiaryKinds("geriatric")).toEqual(["fall", "near_miss"]);
    expect(offeredDiaryKinds("ortho")).toEqual([]);
  });

  it("refuses freezing on a record that is not Parkinson's, in the route's own words", () => {
    const r = buildDiaryRequest({ ...emptyDiaryDraft(NOW, "freezing"), period: "episode" }, NEURO);
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.error).toMatch(/not part of your care plan/);
  });

  it("builds a single freezing episode, and a tally that needs a whole number", () => {
    const one = buildDiaryRequest({ ...emptyDiaryDraft(NOW, "freezing"), period: "episode", trigger: "turning", medicationState: "off" }, PD);
    expect(one).toEqual({
      ok: true,
      body: { kind: "freezing", occurredAt: "2026-10-20T06:30:00.000Z", details: { period: "episode", count: 1, trigger: "turning", medicationState: "off" } },
    });
    const week = emptyDiaryDraft(NOW, "freezing");
    expect(buildDiaryRequest({ ...week, period: "week", count: "" }, PD).ok).toBe(false);
    expect(buildDiaryRequest({ ...week, period: "week", count: "2.5" }, PD).ok).toBe(false);
    expect(buildDiaryRequest({ ...week, period: "week", count: "0" }, PD).ok).toBe(false);
    expect(buildDiaryRequest({ ...week, period: "week", count: "201" }, PD).ok).toBe(false);
    expect(buildDiaryRequest({ ...week, period: "week", count: "9" }, PD)).toMatchObject({ ok: true, body: { details: { period: "week", count: 9 } } });
    expect(buildDiaryRequest({ ...week, period: "" }, PD).ok).toBe(false);
  });

  it("builds a fall: hurt or not is required, got-up-alone and place are optional and 'not said' stays absent", () => {
    const base = emptyDiaryDraft(NOW, "fall");
    expect(buildDiaryRequest(base, NEURO).ok).toBe(false);
    expect(buildDiaryRequest({ ...base, injured: "no" }, NEURO)).toMatchObject({ ok: true, body: { details: { injured: false } } });
    const full = buildDiaryRequest({ ...base, injured: "yes", gotUp: "no", place: "indoors_home", note: "  Slipped on the mat.  " }, NEURO);
    expect(full).toMatchObject({ ok: true, body: { note: "Slipped on the mat.", details: { injured: true, gotUpAlone: false, place: "indoors_home" } } });
    expect(JSON.stringify((full as { body: unknown }).body)).not.toContain("medicationState");
  });

  it("builds a near miss with nothing else", () => {
    expect(buildDiaryRequest(emptyDiaryDraft(NOW, "near_miss"), NEURO)).toMatchObject({ ok: true, body: { kind: "near_miss", details: {} } });
  });

  it("refuses a time in the future or too far back, and a missing or malformed one", () => {
    const base = emptyDiaryDraft(NOW, "near_miss");
    expect(buildDiaryRequest({ ...base, date: "2026-10-21", time: "12:00" }, NEURO).ok).toBe(false);
    expect(buildDiaryRequest({ ...base, date: "2026-01-01" }, NEURO).ok).toBe(false);
    expect(buildDiaryRequest({ ...base, date: "" }, NEURO)).toMatchObject({ ok: false, error: "Say when it happened." });
    expect(buildDiaryRequest({ ...base, time: "25:00" }, NEURO)).toMatchObject({ ok: false });
    expect(buildDiaryRequest({ ...base, kind: "" }, NEURO)).toMatchObject({ ok: false });
  });

  it("refuses a note over 500 characters", () => {
    expect(buildDiaryRequest({ ...emptyDiaryDraft(NOW, "near_miss"), note: "x".repeat(501) }, NEURO).ok).toBe(false);
  });

  it("reads an entry back in plain words, and says nothing that was not written down", () => {
    expect(diaryEntrySummary({ kind: "freezing", details: { period: "week", count: 9, trigger: "turning", medicationState: "off" } }, "patient")).toBe(
      "Feet got stuck 9 times in a week, turning round, medicine wearing off (OFF)"
    );
    expect(diaryEntrySummary({ kind: "freezing", details: { period: "episode", count: 1 } }, "clinician")).toBe("Freezing of gait: 1 episode");
    expect(diaryEntrySummary({ kind: "fall", details: { injured: false, gotUpAlone: true, place: "indoors_home" } }, "patient")).toBe("A fall, not hurt, got up alone, indoors at home");
    expect(diaryEntrySummary({ kind: "fall", details: { injured: true } }, "clinician")).toBe("Fall, hurt");
    expect(diaryEntrySummary({ kind: "near_miss", details: {} }, "patient")).toBe("Nearly fell");
  });
});
