import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPLASH_CONFIG,
  SPLASH_FADE_MS,
  SPLASH_FADE_VAR,
  SPLASH_HOLD_VAR,
  SPLASH_PUBLIC_TOTAL_MS,
  SPLASH_SKIP_PATH,
  splashBootScript,
  splashIsCapped,
  splashSkipsPath,
  splashTimings,
} from "@/lib/splashScreen";

describe("the splash never covers the patient's companion screen", () => {
  it("skips that page and below it, nothing else", () => {
    expect(splashSkipsPath(SPLASH_SKIP_PATH)).toBe(true);
    expect(splashSkipsPath(`${SPLASH_SKIP_PATH}/x`)).toBe(true);
    expect(splashSkipsPath("/patient/dashboard")).toBe(false);
    expect(splashSkipsPath("/patient/dashboard/sessions")).toBe(false);
    expect(splashSkipsPath("/")).toBe(false);
  });
  it("the boot script checks the same path before it sets the attribute", () => {
    const script = splashBootScript(DEFAULT_SPLASH_CONFIG);
    expect(script).toContain(JSON.stringify(SPLASH_SKIP_PATH));
    expect(script.indexOf(SPLASH_SKIP_PATH)).toBeLessThan(script.indexOf("setAttribute"));
  });
});

// Runs the real inline script against a fake browser and reports what it
// wrote to <html>, so the script and splashTimings() cannot drift apart.
function bootOn(pathname: string, holdMs: number) {
  const props: Record<string, string> = {};
  const attrs: Record<string, string> = {};
  const documentElement = {
    setAttribute: (k: string, v: string) => (attrs[k] = v),
    style: { setProperty: (k: string, v: string) => (props[k] = v) },
  };
  runInNewContext(splashBootScript({ ...DEFAULT_SPLASH_CONFIG, holdMs }), {
    window: {
      matchMedia: () => ({ matches: false }),
      sessionStorage: { getItem: () => null },
    },
    document: { documentElement },
    location: { pathname },
    Date,
    Number,
  });
  return { attrs, props };
}

describe("the greeting is clipped on public pages and driven by CSS", () => {
  it("caps hold + fade at ~600ms on a public page, however long the admin set it", () => {
    const t = splashTimings(6000, "/");
    expect(t.holdMs + t.fadeMs).toBeLessThanOrEqual(SPLASH_PUBLIC_TOTAL_MS);
    expect(t.fadeMs).toBe(SPLASH_FADE_MS);
    // A shorter admin hold is still honoured.
    expect(splashTimings(100, "/faq").holdMs).toBe(100);
  });

  it("keeps the admin's full hold in the signed-in workspaces", () => {
    expect(splashIsCapped("/patient/dashboard")).toBe(false);
    expect(splashIsCapped("/admin/dashboard")).toBe(false);
    expect(splashIsCapped("/patient/login")).toBe(true);
    expect(splashTimings(1500, "/therapist/dashboard/sessions").holdMs).toBe(1500);
  });

  it("the boot script writes the same timings before first paint", () => {
    for (const [path, hold] of [["/", 1500], ["/book", 6000], ["/admin/dashboard", 1500]] as const) {
      const { attrs, props } = bootOn(path, hold);
      const expected = splashTimings(hold, path);
      expect(attrs["data-splash"], path).toBe("on");
      expect(props[SPLASH_HOLD_VAR], path).toBe(`${expected.holdMs}ms`);
      expect(props[SPLASH_FADE_VAR], path).toBe(`${expected.fadeMs}ms`);
    }
  });

  it("the stylesheet reads those two properties and the fade matches the constant", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain(`var(${SPLASH_HOLD_VAR}`);
    expect(css).toContain(`var(${SPLASH_FADE_VAR}, ${SPLASH_FADE_MS}ms)`);
  });
});
