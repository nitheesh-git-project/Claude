import { describe, it, expect } from "vitest";
import {
  MAX_MISSION_LENGTH,
  MAX_VISION_LENGTH,
  MISSION,
  VISION,
  resolveMissionCopy,
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
