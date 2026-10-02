import { describe, expect, it } from "vitest";
import { pickScreens, visibleScreenKeys } from "@/lib/adminNav";
import { sectionsForScope, scopeCanManage } from "@/lib/adminScope";

function keysFor(scope: "full" | "finance" | "operations" | "clinical") {
  const allowed = sectionsForScope(scope);
  const manage = allowed.filter((s) => scopeCanManage(scope, s));
  return visibleScreenKeys(allowed, manage, scope !== "full");
}

describe("visibleScreenKeys", () => {
  it("never hands a limited desk a screen outside its sections", () => {
    for (const scope of ["finance", "operations", "clinical"] as const) {
      const allowed = new Set(sectionsForScope(scope));
      for (const key of keysFor(scope)) {
        expect(allowed.has(key.split(":")[0] as never)).toBe(true);
      }
    }
  });

  it("keeps Settings and Logs away from every limited desk", () => {
    for (const scope of ["finance", "operations", "clinical"] as const) {
      const keys = [...keysFor(scope)];
      expect(keys.some((k) => k.startsWith("settings:"))).toBe(false);
      expect(keys.some((k) => k.startsWith("logs:"))).toBe(false);
    }
  });

  it("gives a Master Admin Money and Settings", () => {
    const keys = keysFor("full");
    expect(keys.has("money:summary")).toBe(true);
    expect(keys.has("settings:access")).toBe(true);
  });
});

describe("pickScreens", () => {
  it("drops every key outside the set", () => {
    const picked = pickScreens({ "money:summary": 1, "today:overview": 2 }, new Set(["today:overview"]));
    expect(picked).toEqual({ "today:overview": 2 });
  });
});
