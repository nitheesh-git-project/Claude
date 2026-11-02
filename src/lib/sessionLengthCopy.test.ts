import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  closingSessionLine,
  durationRangeLabel,
  hoursNoticeLabel,
  knownMinutes,
  oneToOneLine,
  refundWindowLine,
  programmeOpensWithLine,
  programmesLede,
  sharedDurationMinutes,
} from "./sessionLengthCopy";

const rows = (...m: (number | null | undefined)[]) => m.map((duration_minutes) => ({ duration_minutes }));

describe("session length copy", () => {
  it("names the length the catalogue sets, not a fixed 60", () => {
    expect(programmesLede(rows(30, 30))).toBe("Same 30-minute assessment. A different plan for each.");
    expect(closingSessionLine(rows(30))).toBe("One 30-minute session. Leave with a plan.");
    expect(programmeOpensWithLine(30)).toBe(
      "Every programme opens with an assessment - 30 minutes, one-to-one."
    );
  });

  it("claims no shared length when the categories differ", () => {
    expect(sharedDurationMinutes(rows(30, 60))).toBeNull();
    expect(programmesLede(rows(30, 60))).toBe("One assessment to start. A different plan for each.");
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

  it("says the one-to-one line from the catalogue, never a fixed hour", () => {
    expect(oneToOneLine(rows(60, 60))).toBe("An hour, one-to-one.");
    expect(oneToOneLine(rows(30))).toBe("30 minutes, one-to-one.");
    expect(oneToOneLine(rows(30, 60))).toBe("One-to-one, every session.");
    expect(oneToOneLine([])).toBe("One-to-one, every session.");
  });

  it("builds notice and refund sentences from the admin's hours", () => {
    expect(hoursNoticeLabel(12)).toBe("12 hours' notice");
    expect(hoursNoticeLabel(1)).toBe("1 hour's notice");
    expect(hoursNoticeLabel(0)).toBe("no advance notice");
    expect(refundWindowLine(24)).toBe("Cancel 24 hours ahead for a full refund.");
    expect(refundWindowLine(0)).toBe("Cancel any time before it starts for a full refund.");
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
      "src/app/how-it-works/page.tsx",
      "src/app/mission/page.tsx",
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
      // "An hour" / "1 hour" is a length too, and the hours of notice and
      // refund are admin settings (hoursNoticeLabel / refundWindowLine).
      expect(code, file).not.toMatch(/\ban hour\b|\b1[- ]hours?\b|\bone hour\b|\b\d+ hours?\b/i);
    }
  });
});
