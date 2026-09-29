import { describe, it, expect } from "vitest";

// Nothing in this app opens the operating system's own date picker.
//
// `<input type="date">` and `<input type="datetime-local">` hand the choice to
// a browser-drawn panel: unstyled, worded differently and placed differently on
// every browser and every phone, and the one piece of UI in this product nobody
// designed. Twenty-eight of them were replaced by `DateField`, which is the
// clinic's own control over the app's only month grid.
//
// The same shape and the same reasoning as `formatDateTime.test.ts`'s walk for
// unzoned dates: this is a mistake that produces no error, no failed request
// and no wrong row -- it is only visible to somebody looking at the screen, so
// a reviewer will not catch it and a walk will.
describe("no browser-drawn date picker", () => {
  const NATIVE = /type=["'](date|datetime-local|time|month|week)["']/;

  // Exactly one file is exempt, and it is the only one that renders such an
  // input at all: the pre-launch debug bar, which is deleted before launch and
  // is not a surface a patient or an admin reads -- it is also the one place a
  // developer genuinely wants to type an instant.
  //
  // The files that merely *name* these types -- `DateField`, `BookingCalendar`,
  // `AdminSlotPicker`, `bookingSlots` -- do so in comments recording what they
  // replaced, which the comment skip below already covers. They are deliberately
  // NOT listed: an exemption that protects nothing reads as a file this rule
  // does not apply to, and the next native input added to one of them would go
  // through unnoticed.
  const EXEMPT = ["src/components/DebugNav.tsx"];

  it("renders no native date or time input", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");

    function walk(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return walk(path);
        return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
      });
    }

    const offenders: string[] = [];
    for (const file of walk("src")) {
      const relative = file.replace(/\\/g, "/");
      if (relative.includes(".test.")) continue;
      if (EXEMPT.includes(relative)) continue;
      const source = readFileSync(file, "utf8");
      source.split("\n").forEach((line, index) => {
        // A comment naming the type is describing the thing that was removed,
        // which is exactly what this codebase's comments are for.
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
        if (NATIVE.test(line)) offenders.push(`${relative}:${index + 1}`);
      });
    }

    expect(
      offenders,
      `Use DateField instead of a native date input:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
