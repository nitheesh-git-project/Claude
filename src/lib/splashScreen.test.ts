import { describe, expect, it } from "vitest";
import { DEFAULT_SPLASH_CONFIG, SPLASH_SKIP_PATH, splashBootScript, splashSkipsPath } from "@/lib/splashScreen";

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
