import { describe, it, expect } from "vitest";
import {
  COMMITMENTS,
  DEFAULT_MISSION_ICON,
  MAX_MISSION_LENGTH,
  MAX_PRINCIPLE_BODY_LENGTH,
  MAX_PRINCIPLE_TITLE_LENGTH,
  MAX_VISION_LENGTH,
  MISSION,
  MISSION_ICONS,
  PRINCIPLES,
  VISION,
  missionIcon,
  resolveMissionCopy,
  resolveMissionPrinciples,
} from "@/lib/mission";

describe("resolveMissionCopy", () => {
  it("uses the stored lines when an admin has written them", () => {
    expect(
      resolveMissionCopy({
        mission_statement: "A physiotherapist, wherever you are.",
        vision_statement: "Care that does not depend on a postcode.",
      })
    ).toEqual({
      mission: "A physiotherapist, wherever you are.",
      vision: "Care that does not depend on a postcode.",
    });
  });

  it("trims what an admin typed rather than rendering their whitespace", () => {
    expect(resolveMissionCopy({ mission_statement: "  Seen properly.  " }).mission).toBe(
      "Seen properly."
    );
  });

  // Blank is the undo, not an error: it is how an admin goes back to the
  // shipped wording without retyping it out of a file they cannot read.
  it("treats blank and whitespace as 'use the line the site shipped with'", () => {
    for (const value of ["", "   ", "\n"]) {
      expect(resolveMissionCopy({ mission_statement: value, vision_statement: value })).toEqual({
        mission: MISSION,
        vision: VISION,
      });
    }
  });

  // A database that has never run the migration, and one whose read failed,
  // both arrive here as nothing. Either way the band must not render empty.
  it("falls back for a missing row, a null column and an absent column alike", () => {
    expect(resolveMissionCopy(null)).toEqual({ mission: MISSION, vision: VISION });
    expect(resolveMissionCopy(undefined)).toEqual({ mission: MISSION, vision: VISION });
    expect(resolveMissionCopy({})).toEqual({ mission: MISSION, vision: VISION });
    expect(
      resolveMissionCopy({ mission_statement: null, vision_statement: null })
    ).toEqual({ mission: MISSION, vision: VISION });
  });

  it("resolves each line independently, so one override does not clear the other", () => {
    expect(resolveMissionCopy({ mission_statement: "Ours." })).toEqual({
      mission: "Ours.",
      vision: VISION,
    });
    expect(resolveMissionCopy({ vision_statement: "Theirs." })).toEqual({
      mission: MISSION,
      vision: "Theirs.",
    });
  });
});

describe("the shipped copy", () => {
  // The defaults have to fit the fields that may replace them, or an admin
  // who clears a box gets a line the form would refuse to save back.
  it("fits inside the limits an admin's own wording is held to", () => {
    expect(MISSION.length).toBeLessThanOrEqual(MAX_MISSION_LENGTH);
    expect(VISION.length).toBeLessThanOrEqual(MAX_VISION_LENGTH);
  });

  // Not a rule the product enforces -- the form lets an owner past it with a
  // warning -- but the lines this repository ships should hold to the budget
  // the rest of the marketing copy is written against.
  it("keeps the shipped lines inside the fifteen-word budget", () => {
    for (const line of [MISSION, VISION]) {
      expect(line.trim().split(/\s+/).length).toBeLessThanOrEqual(15);
    }
  });
});

describe("resolveMissionPrinciples", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "r1",
    kind: "promise",
    title: "Assessed first",
    body: "Somebody watches you move before anything is written.",
    icon: "fa-user-check",
    active: true,
    display_order: 1,
    ...over,
  });

  it("renders the stored rows of that band, in their saved order", () => {
    const resolved = resolveMissionPrinciples("promise", [
      row({ id: "b", title: "Second", display_order: 2 }),
      row({ id: "a", title: "First", display_order: 1 }),
    ]);
    expect(resolved.map((r) => r.title)).toEqual(["First", "Second"]);
  });

  it("keeps the two bands apart", () => {
    const rows = [
      row({ id: "p", kind: "promise", title: "A promise" }),
      row({ id: "l", kind: "limit", title: "A limit" }),
    ];
    expect(resolveMissionPrinciples("promise", rows).map((r) => r.title)).toEqual(["A promise"]);
    expect(resolveMissionPrinciples("limit", rows).map((r) => r.title)).toEqual(["A limit"]);
  });

  // An empty table is a state nobody chose -- not migrated, freshly reset, or
  // never opened -- and on /mission these bands are the page.
  it("falls back to the shipped wording for an empty or unreadable table", () => {
    expect(resolveMissionPrinciples("promise", [])).toEqual(PRINCIPLES);
    expect(resolveMissionPrinciples("promise", null)).toEqual(PRINCIPLES);
    expect(resolveMissionPrinciples("limit", undefined)).toEqual(COMMITMENTS);
  });

  // A table holding the other band only is still an unwritten band for this
  // one. The bug this prevents: writing the promises empties the limits.
  it("falls back per band, not for the table as a whole", () => {
    const promisesOnly = [row({ kind: "promise" })];
    expect(resolveMissionPrinciples("limit", promisesOnly)).toEqual(COMMITMENTS);
    expect(resolveMissionPrinciples("promise", promisesOnly)).not.toEqual(PRINCIPLES);
  });

  // Switching every row off IS a decision, so it renders empty and the pages
  // drop the band -- deliberately different from an empty table.
  it("respects a band switched entirely off rather than falling back", () => {
    expect(resolveMissionPrinciples("promise", [row({ active: false })])).toEqual([]);
  });

  it("drops a row with no title rather than rendering a blank card", () => {
    expect(resolveMissionPrinciples("promise", [row({ title: "   " }), row({ id: "ok" })])).toHaveLength(
      1
    );
  });

  it("trims what an admin typed", () => {
    const [only] = resolveMissionPrinciples("promise", [
      row({ title: "  Spaced  ", body: "  Also spaced.  " }),
    ]);
    expect(only).toMatchObject({ title: "Spaced", body: "Also spaced." });
  });
});

describe("missionIcon", () => {
  it("keeps an icon this app can draw", () => {
    expect(missionIcon("fa-user-check")).toBe("fa-user-check");
  });

  // A class the app does not load renders an empty square, and nothing about a
  // blank box tells anybody whether the icon or the row failed.
  it("falls back for a retired, unknown, null or blank icon", () => {
    for (const value of ["fa-not-a-real-icon", "", null, undefined]) {
      expect(missionIcon(value)).toBe(DEFAULT_MISSION_ICON);
    }
  });
});

describe("the shipped promises and limits", () => {
  it("fit the fields and the picker an admin's own rows are held to", () => {
    for (const item of [...PRINCIPLES, ...COMMITMENTS]) {
      expect(item.title.length, item.title).toBeLessThanOrEqual(MAX_PRINCIPLE_TITLE_LENGTH);
      expect(item.body.length, item.title).toBeLessThanOrEqual(MAX_PRINCIPLE_BODY_LENGTH);
      // Or editing a shipped row would silently change its icon.
      expect(MISSION_ICONS, item.icon).toContain(item.icon);
    }
  });
});
