import { describe, expect, it } from "vitest";
import { deviceThemeBootScript, resolveThemeMode, themeFor } from "./deviceTheme";

describe("site theme", () => {
  it("light is light whatever the device says", () => {
    expect(themeFor("light", true)).toBe("light");
    expect(themeFor("light", false)).toBe("light");
  });
  it("dark is dark whatever the device says", () => {
    expect(themeFor("dark", false)).toBe("dark");
    expect(themeFor("dark", true)).toBe("dark");
  });
  it("device follows the device", () => {
    expect(themeFor("device", true)).toBe("dark");
    expect(themeFor("device", false)).toBe("light");
  });
  it("ships no script for light, an unconditional one for dark, a media query for device", () => {
    expect(deviceThemeBootScript("light")).toBe("");
    expect(deviceThemeBootScript("dark")).toContain('dataset.theme="dark"');
    expect(deviceThemeBootScript("dark")).not.toContain("matchMedia");
    expect(deviceThemeBootScript("device")).toContain("prefers-color-scheme: dark");
  });
  it("falls back to what the old on/off switch meant until a mode is picked", () => {
    expect(resolveThemeMode(null, true)).toBe("device");
    expect(resolveThemeMode(undefined, false)).toBe("light");
    expect(resolveThemeMode("dark", false)).toBe("dark");
    expect(resolveThemeMode("purple", true)).toBe("device");
  });
});
