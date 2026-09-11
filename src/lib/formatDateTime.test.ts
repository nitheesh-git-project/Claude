import { describe, it, expect } from "vitest";
import {
  CLINIC_DISPLAY_TIMEZONE,
  formatClinicDate,
  formatClinicDateShort,
  formatClinicDateTime,
  formatClinicTime,
} from "@/lib/formatDateTime";

// 6 PM IST is 12:30 UTC. Any formatter without an explicit zone renders this
// as 12:30 on a UTC host -- which is exactly what the patient's Overview was
// showing for their next session.
const SIX_PM_IST = "2026-09-12T12:30:00.000Z";

describe("clinic time", () => {
  it("renders an instant in the clinic's zone, not the runtime's", () => {
    expect(formatClinicTime(SIX_PM_IST)).toMatch(/6:00/);
    expect(formatClinicTime(SIX_PM_IST)).not.toMatch(/12:30/);
  });

  it("keeps the date the clinic is on, across the UTC midnight boundary", () => {
    // 00:30 UTC on the 13th is 6:00 AM IST on the 13th; 19:00 UTC on the
    // 12th is 00:30 IST on the 13th -- the case where the naive answer is a
    // day out.
    expect(formatClinicDate("2026-09-12T19:00:00.000Z")).toContain("13");
    expect(formatClinicDate("2026-09-13T00:30:00.000Z")).toContain("13");
  });

  it("formats date, short date and date-time consistently", () => {
    // "Sept", not "Sep" -- that is what the en-IN locale actually produces,
    // and the strings here are the ones a patient reads.
    expect(formatClinicDate(SIX_PM_IST)).toBe("12 Sept 2026");
    expect(formatClinicDateShort(SIX_PM_IST)).toBe("12 Sept");
    expect(formatClinicDateTime(SIX_PM_IST)).toMatch(/^12 Sept 2026, 6:00/);
  });

  it("accepts a Date, a number and an ISO string alike", () => {
    const ms = Date.parse(SIX_PM_IST);
    expect(formatClinicDate(new Date(ms))).toBe(formatClinicDate(SIX_PM_IST));
    expect(formatClinicDate(ms)).toBe(formatClinicDate(SIX_PM_IST));
  });

  // "Invalid Date" is a developer's string, and these render on a patient's
  // screen.
  it("renders a dash for anything it cannot read", () => {
    for (const bad of [null, undefined, "", "not a date"]) {
      expect(formatClinicDate(bad)).toBe("—");
      expect(formatClinicDateTime(bad)).toBe("—");
      expect(formatClinicTime(bad)).toBe("—");
    }
  });

  it("is pinned to one zone, so two readers cannot disagree", () => {
    expect(CLINIC_DISPLAY_TIMEZONE).toBe("Asia/Kolkata");
  });
});

// The sweep that produced this module found 91 call sites formatting a date
// with no zone. Left to review, it comes back: the failure is invisible
// locally, because a developer's machine and the clinic are often in the
// same zone, and only shows on a UTC host.
describe("nothing renders a date in the runtime's own zone", () => {
  const CALL = /\.toLocale(String|DateString|TimeString)\(/g;

  /** The argument list of a call, scanned with balanced parens so a nested
   *  call inside the options does not end it early. */
  function argsAt(source: string, from: number): string {
    let depth = 0;
    let i = from - 1;
    for (; i < source.length; i += 1) {
      if (source[i] === "(") depth += 1;
      else if (source[i] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    // `from` is the index of the opening paren, so the args start after it.
    return source.slice(from + 1, i);
  }

  // Two files are exempt and both say why in their own comments: bookingSlots
  // formats wall-clock dates (`new Date(y, m, d)`, no instant behind them),
  // and the intake wizard's "Saved 3:42 pm" is the viewer's own clock for
  // their own draft.
  const EXEMPT = ["src/lib/bookingSlots.ts", "src/components/profile/ConditionIntakeWizard.tsx"];

  it("has no date formatting without an explicit timeZone", async () => {
    const { globSync } = await import("node:fs");
    const { readFileSync } = await import("node:fs");
    const files = globSync("src/**/*.{ts,tsx}").filter(
      (f) => !f.includes(".test.") && !f.endsWith("formatDateTime.ts") && !EXEMPT.includes(f)
    );

    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(CALL)) {
        const args = argsAt(source, match.index + match[0].length - 1);
        // A number format, not a date: money and counts.
        if (/(maximum|minimum)FractionDigits/.test(args)) continue;
        const before = source.slice(Math.max(0, match.index - 40), match.index);
        if (/\/\s*100\s*\)$/.test(before)) continue;
        // A locale and nothing else is number formatting -- money and
        // counts. Every date in this codebase either passes options or goes
        // through the helpers above, so this cannot hide a date.
        if (/^\s*"en-IN"\s*$/.test(args)) continue;
        if (args.includes("timeZone")) continue;
        offenders.push(`${file}: ${args.trim().slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
