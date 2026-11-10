import { describe, expect, it } from "vitest";
import { initialsFor, teamInitials } from "./teamInitials";

describe("team avatar initials", () => {
  it("skips honorifics and uses first and last name", () => {
    expect(initialsFor("Dr. Pooja Sharma")).toBe("PS");
    expect(initialsFor("Ravi")).toBe("R");
    expect(initialsFor("  ")).toBe("");
    expect(initialsFor(null)).toBe("");
  });

  it("draws nobody when there are no profiles", () => {
    expect(teamInitials([])).toEqual([]);
    expect(teamInitials([null, ""])).toEqual([]);
  });

  it("caps the stack and drops repeats", () => {
    expect(teamInitials(["A B", "A B", "C D", "E F", "G H", "I J"], 4)).toEqual(["AB", "CD", "EF", "GH"]);
  });
});
