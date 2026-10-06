import { describe, expect, it } from "vitest";
import { deviceThemeBootScript, themeFor } from "./deviceTheme";

describe("device theme", () => {
  it("is light whenever the admin switch is off, whatever the device says", () => {
    expect(themeFor(false, true)).toBe("light");
    expect(themeFor(false, false)).toBe("light");
  });
  it("follows the device when the switch is on", () => {
    expect(themeFor(true, true)).toBe("dark");
    expect(themeFor(true, false)).toBe("light");
  });
  it("ships no script at all while the switch is off", () => {
    expect(deviceThemeBootScript(false)).toBe("");
    expect(deviceThemeBootScript(true)).toContain("prefers-color-scheme: dark");
  });
});
