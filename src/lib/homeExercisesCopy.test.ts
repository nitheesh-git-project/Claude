import { describe, expect, it } from "vitest";
import { homeExercisesCopy } from "@/lib/homeExercisesCopy";
import { containsClinicWord } from "@/lib/sessionProtocols";

describe("homeExercisesCopy", () => {
  it("never says care plan, and has no clinic words", () => {
    for (const voice of ["patient", "parent"] as const) {
      const c = homeExercisesCopy(voice);
      for (const t of [c.heading, c.intro, c.empty, c.notMigrated, c.unreadable, c.set("27 Oct 2026")]) {
        expect(t.toLowerCase()).not.toContain("care plan");
        expect(containsClinicWord(t)).toBeNull();
      }
    }
  });
  it("says the calm empty line, and the parent's voice for a child", () => {
    expect(homeExercisesCopy("patient").empty).toBe("Your physiotherapist will teach you your exercises in your video session.");
    expect(homeExercisesCopy("parent").heading).toMatch(/your child/);
    expect(homeExercisesCopy("parent").empty).toMatch(/you and your child/);
  });
  it("tells 'could not load' apart from 'nothing yet'", () => {
    const c = homeExercisesCopy("patient");
    expect(c.unreadable).not.toBe(c.empty);
    expect(c.unreadable).toMatch(/couldn't load/);
  });
});
