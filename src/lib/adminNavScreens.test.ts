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
    expect(keys.has("money:summary/summary")).toBe(true);
    expect(keys.has("settings:access/access")).toBe(true);
  });

  it("keeps the log Master Admin only, now that it sits under Settings", () => {
    expect(keysFor("full").has("settings:history/all")).toBe(true);
    for (const scope of ["finance", "operations", "clinical"] as const) {
      expect([...keysFor(scope)].some((k) => k.startsWith("settings:history"))).toBe(false);
    }
  });
});

describe("pickScreens", () => {
  it("drops every key outside the set", () => {
    const picked = pickScreens({ "money:summary/summary": 1, "today:overview": 2 }, new Set(["today:overview"]));
    expect(picked).toEqual({ "today:overview": 2 });
  });
});

describe("Programmes, under Sessions", () => {
  it("gives every desk the list, and only desks that manage it the approval queue", () => {
    for (const scope of ["full", "operations", "clinical"] as const) {
      const keys = keysFor(scope);
      expect(keys.has("sessions:programmes/all"), scope).toBe(true);
      expect(keys.has("sessions:programmes/review"), scope).toBe(true);
    }
    const finance = keysFor("finance");
    expect(finance.has("sessions:programmes/all")).toBe(true);
    expect(finance.has("sessions:programmes/review")).toBe(false);
  });

  it("lands an old Recommendations or Purchases link on the screen that does that job now", () => {
    const all = sectionsForScope("full");
    expect(findTab("sessions", "recommendations", all)).toEqual({ section: "sessions", tab: "programmes", sub: "review" });
    expect(findTab("catalog", "purchases", all)).toEqual({ section: "sessions", tab: "programmes", sub: "all" });
    expect(findTab("programmes", "review", all)).toEqual({ section: "sessions", tab: "programmes", sub: "review" });
    // Finance reads Programmes but cannot decide on one: the list, not a
    // heading over nothing.
    const finance = sectionsForScope("finance");
    const financeManage = finance.filter((s) => scopeCanManage("finance", s));
    expect(findTab("sessions", "recommendations", finance, financeManage, true)).toEqual({
      section: "sessions",
      tab: "programmes",
      sub: "all",
    });
  });
});

// Every screen the admin dashboard had before the Morning Brief layout.
// Each must still open, at its old address, for a Master Admin -- the
// promise that the redesign moved screens and dropped none.
const OLD_SCREENS = [
  "today:overview", "today:approvals", "today:health-reviews", "today:risk",
  "sessions:schedule", "sessions:all", "sessions:roster", "sessions:delivery", "sessions:new",
  "programmes:all", "programmes:review",
  "people:patients", "people:therapists", "people:partners", "people:declined", "people:abandoned", "people:data-requests",
  "money:summary", "money:health", "money:transactions", "money:refunds", "money:payouts", "money:owing", "money:costs", "money:breakdown", "money:inputs",
  "catalog:conditions", "catalog:areas", "catalog:countries",
  "logs:all", "logs:signed-in-as", "logs:retention",
  "settings:brand", "settings:public", "settings:cookies", "settings:booking", "settings:offers", "settings:programmes",
  "settings:clinical", "settings:profile-layout", "settings:announcements", "settings:access", "settings:security",
  "settings:health", "settings:emails", "settings:whatsapp", "settings:advanced", "settings:reachouts",
];

describe("the Morning Brief layout keeps every old screen", () => {
  it("opens every old address on a distinct screen a Master Admin can see", () => {
    const all = sectionsForScope("full");
    const keys = visibleScreenKeys(all, all, false);
    const landed = new Set<string>();
    for (const old of OLD_SCREENS) {
      const [section, tab] = old.split(":");
      const found = findTab(section, tab, all, all, false);
      const key = `${found.section}:${found.tab}${found.sub ? `/${found.sub}` : ""}`;
      expect(keys.has(key), `${old} -> ${key}`).toBe(true);
      landed.add(key);
    }
    // 48 old addresses (Today -> Activity is the limited desks' own) on 48
    // different screens: two old screens never collapse into one.
    expect(landed.size).toBe(OLD_SCREENS.length);
  });

  it("sends a retired section's bare or unknown link to its first screen, as before", () => {
    const all = sectionsForScope("full");
    expect(findTab("logs", null, all)).toEqual({ section: "settings", tab: "history", sub: "all" });
    expect(findTab("logs", "activity", all)).toEqual({ section: "settings", tab: "history", sub: "all" });
    expect(findTab("programmes", "nonsense", all)).toEqual({ section: "sessions", tab: "programmes", sub: "all" });
  });

  it("opens the limited desks' own activity screen for them", () => {
    const ops = sectionsForScope("operations");
    const opsManage = ops.filter((s) => scopeCanManage("operations", s));
    expect(findTab("today", "activity", ops, opsManage, true)).toEqual({ section: "today", tab: "activity" });
  });

  it("names every moved address in LEGACY_SCREENS, and nothing that still exists", () => {
    expect(Object.keys(LEGACY_SCREENS).every((k) => {
      const [section, tab] = k.split(":");
      return !ADMIN_SECTIONS.find((s) => s.key === section)?.tabs.some((t) => t.key === tab);
    })).toBe(true);
  });
});
