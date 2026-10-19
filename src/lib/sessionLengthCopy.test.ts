import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  closingSessionLine,
  durationRangeLabel,
  knownMinutes,
  programmeOpensWithLine,
  programmesLede,
  sharedDurationMinutes,
} from "./sessionLengthCopy";

const rows = (...m: (number | null | undefined)[]) => m.map((duration_minutes) => ({ duration_minutes }));

describe("session length copy", () => {
  it("names the length the catalogue sets, not a fixed 60", () => {
    expect(programmesLede(rows(30, 30))).toBe("Same 30-minute assessment. Different protocol.");
    expect(closingSessionLine(rows(30))).toBe("One 30-minute session. Leave with a plan.");
    expect(programmeOpensWithLine(30)).toBe(
      "Every programme opens with an assessment - 30 minutes, one-to-one."
    );
  });

  it("claims no shared length when the categories differ", () => {
    expect(sharedDurationMinutes(rows(30, 60))).toBeNull();
    expect(programmesLede(rows(30, 60))).toBe("One assessment to start. Different protocol.");
    expect(closingSessionLine(rows(30, 60))).toBe("One session. Leave with a plan.");
    expect(durationRangeLabel(rows(60, 30, 45))).toBe("30-60 min");
  });

  it("says no number at all when none is known", () => {
    expect(knownMinutes(null)).toBeNull();
    expect(knownMinutes(0)).toBeNull();
    expect(knownMinutes(Number.NaN)).toBeNull();
    expect(durationRangeLabel([])).toBeNull();
    expect(sharedDurationMinutes(rows(30, null))).toBeNull();
    expect(programmeOpensWithLine(undefined)).toBe(
      "Every programme opens with a one-to-one assessment."
    );
  });

  it("reads one length as a single figure", () => {
    expect(durationRangeLabel(rows(45, 45))).toBe("45 min");
    expect(sharedDurationMinutes(rows(45, 45))).toBe(45);
  });

  // The pages that printed a fixed length. Each now builds its copy from the
  // rows above (or names no length); a literal creeping back is the bug.
  it("no public page that quotes a session hard-codes its length", () => {
    const files = [
      "src/app/page.tsx",
      "src/app/conditions/page.tsx",
      "src/app/hospitals/page.tsx",
      "src/components/catalog/ProgramCards.tsx",
      "src/components/home/JourneySteps.tsx",
      "src/components/TeamTherapistPopup.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      const code = source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(code, file).not.toMatch(/\b\d+[- ]minutes?\b|"\d+ min"|\?\? 60\b/);
    }
  });
});
