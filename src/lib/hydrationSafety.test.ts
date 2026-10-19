// Guards for the server/client mismatches found behind the repeated React
// #418 on the public pages (F-06). Each is a mistake that produces no error
// anywhere but the browser console, so the source is where to catch it --
// the same reasoning as formatDateTime.test.ts's walk.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Source with comments removed, so a comment explaining a rule is not read
 *  as breaking it. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const clientFiles = walk(join(ROOT, "src")).filter((f) =>
  /^\s*["']use client["']/.test(readFileSync(f, "utf8"))
);

describe("hydration safety", () => {
  it("no client component formats a date in the runtime's locale", () => {
    // A client component is rendered on the server too. Node's locale and
    // the browser's differ ("Oct 5" vs "5 Oct"), and a text mismatch makes
    // React throw away and re-render the subtree. Use formatDateTime.ts.
    const offenders = clientFiles.filter((f) =>
      /toLocale(Date|Time)?String\(\s*(undefined|\[\])/.test(code(f))
    );
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it("the debug bar reads the browser's clock and storage after mount, not in render", () => {
    // It is in the root layout, on every page; the server has neither.
    const source = code(join(ROOT, "src/components/DebugNav.tsx"));
    expect(source).not.toMatch(/useState\(\s*\(\)\s*=>[^)]*(debugNow|getDebugNowOffsetMs|localStorage)/);
  });

  it("public components that render differently under reduced motion use the hydration-safe hook", () => {
    for (const file of [
      "src/components/marketing/HealthProfileShowcase.tsx",
      "src/components/marketing/CareAreaShowcase.tsx",
    ]) {
      const source = code(join(ROOT, file));
      expect(source, file).not.toMatch(/\buseReducedMotion\b/);
      expect(source, file).toMatch(/useHydrationSafeReducedMotion\(\)/);
    }
  });
});
