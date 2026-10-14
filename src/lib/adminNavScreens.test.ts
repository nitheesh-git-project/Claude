import { describe, expect, it } from "vitest";
import { ADMIN_SECTIONS, LEGACY_SCREENS, findTab, pickScreens, visibleScreenKeys } from "@/lib/adminNav";
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

describe("Programmes", () => {
  it("gives every desk the list, and only desks that manage it the approval queue", () => {
    for (const scope of ["full", "operations", "clinical"] as const) {
      const keys = keysFor(scope);
      expect(keys.has("programmes:all"), scope).toBe(true);
      expect(keys.has("programmes:review"), scope).toBe(true);
    }
    const finance = keysFor("finance");
    expect(finance.has("programmes:all")).toBe(true);
    expect(finance.has("programmes:review")).toBe(false);
  });

  it("lands an old Recommendations or Purchases link on the screen that does that job now", () => {
    const all = sectionsForScope("full");
    expect(findTab("sessions", "recommendations", all)).toEqual({ section: "programmes", tab: "review" });
    expect(findTab("catalog", "purchases", all)).toEqual({ section: "programmes", tab: "all" });
    // Finance reads Programmes but cannot decide on one: the list, not a
    // heading over nothing.
    const finance = sectionsForScope("finance");
    const financeManage = finance.filter((s) => scopeCanManage("finance", s));
    expect(findTab("sessions", "recommendations", finance, financeManage, true)).toEqual({
      section: "programmes",
      tab: "all",
    });
    expect(Object.keys(LEGACY_SCREENS).every((k) => {
      const [section, tab] = k.split(":");
      return !ADMIN_SECTIONS.find((s) => s.key === section)?.tabs.some((t) => t.key === tab);
    })).toBe(true);
  });
});
