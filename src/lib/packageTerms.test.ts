import { describe, it, expect } from "vitest";
import { termsFromSnapshot } from "./packageTerms";

describe("termsFromSnapshot", () => {
  it("reads a session package's frozen terms", () => {
    expect(
      termsFromSnapshot({
        session_duration_minutes: 45,
        min_gap_hours: 48,
        max_sessions_per_week: 2,
      })
    ).toEqual({
      sessionDurationMinutes: 45,
      minGapHours: 48,
      maxSessionsPerWeek: 2,
      source: "snapshot",
    });
  });

  it("reads a home-visit package's differently-named columns", () => {
    // One resolver serves both catalogs, so a snapshot taken from either
    // table has to read. Two resolvers is how two screens grow two ideas of
    // what a frozen term means.
    expect(
      termsFromSnapshot({
        visit_duration_minutes: 60,
        min_gap_hours: 24,
        max_visits_per_week: 3,
      })
    ).toEqual({
      sessionDurationMinutes: 60,
      minGapHours: 24,
      maxSessionsPerWeek: 3,
      source: "snapshot",
    });
  });

  it("answers an absent key with null, never a default", () => {
    // The whole point: a programme sold with no weekly cap must not acquire
    // one the first time somebody sets one on the live row.
    expect(termsFromSnapshot({ min_gap_hours: 12 })).toEqual({
      sessionDurationMinutes: null,
      minGapHours: 12,
      maxSessionsPerWeek: null,
      source: "snapshot",
    });
  });

  it("treats an empty blob as no snapshot at all", () => {
    // `{}` is the column default -- it means nothing was ever written, not
    // "a package with no rules", so the caller must fall through to the
    // live row rather than booking against silence.
    expect(termsFromSnapshot({}).source).toBe("none");
  });

  it("refuses a non-object without throwing", () => {
    expect(termsFromSnapshot(null).source).toBe("none");
    expect(termsFromSnapshot(undefined).source).toBe("none");
    expect(termsFromSnapshot([]).source).toBe("none");
    expect(termsFromSnapshot("45").source).toBe("none");
  });

  it("ignores a value that is not a number", () => {
    // A snapshot is whatever the row held, including a column that has since
    // changed type. An unreadable figure is absent, not NaN.
    expect(termsFromSnapshot({ min_gap_hours: "soon" }).minGapHours).toBeNull();
  });

  it("reads a numeric string, which is how jsonb renders a numeric column", () => {
    expect(termsFromSnapshot({ min_gap_hours: "48" }).minGapHours).toBe(48);
  });
});
