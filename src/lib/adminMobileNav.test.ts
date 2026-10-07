import { describe, expect, it } from "vitest";
import { adminShortcuts, filterAdminScreens, type NavSection } from "./adminMobileNav";

const full: NavSection[] = [
  {
    key: "today",
    label: "Today",
    icon: "fa-inbox",
    tabs: [
      { key: "overview", label: "Today" },
      { key: "approvals", label: "Approvals" },
      { key: "risk", label: "Risk" },
    ],
  },
  {
    key: "sessions",
    label: "Sessions",
    icon: "fa-calendar",
    tabs: [
      { key: "schedule", label: "Schedule" },
      { key: "all", label: "All Sessions" },
    ],
  },
  {
    key: "money",
    label: "Money",
    icon: "fa-rupee",
    tabs: [
      { key: "summary", label: "Summary" },
      { key: "payouts", label: "Payouts" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    icon: "fa-gear",
    tabs: [{ key: "booking", label: "Booking rules", group: "How the clinic runs" }],
  },
];

describe("adminShortcuts", () => {
  it("offers Today and Approvals to a Master Admin", () => {
    expect(adminShortcuts(full).map((s) => s.label)).toEqual(["Today", "Approvals"]);
  });

  it("skips a screen the scope cannot open", () => {
    const noApprovals = full.map((s) =>
      s.key === "today" ? { ...s, tabs: s.tabs.filter((t) => t.key !== "approvals") } : s
    );
    expect(adminShortcuts(noApprovals).map((s) => s.label)).toEqual(["Today", "Sessions"]);
  });

  it("falls back to the scope's own first screen when no candidate is reachable", () => {
    const only = [full[3]];
    expect(adminShortcuts(only)).toEqual([
      { section: "settings", tab: "booking", label: "Settings", icon: "fa-gear" },
    ]);
  });

  it("is empty only when the scope reaches nothing", () => {
    expect(adminShortcuts([])).toEqual([]);
  });
});

describe("filterAdminScreens", () => {
  it("returns nothing for an empty or blank query", () => {
    expect(filterAdminScreens(full, "")).toEqual([]);
    expect(filterAdminScreens(full, "   ")).toEqual([]);
  });

  it("matches a screen name, ignoring case", () => {
    expect(filterAdminScreens(full, "PAYOUT").map((m) => m.tab)).toEqual(["payouts"]);
  });

  it("matches every screen of a section by the section's name", () => {
    expect(filterAdminScreens(full, "sessions").map((m) => m.tab)).toEqual(["schedule", "all"]);
  });

  it("matches a screen by its group caption", () => {
    expect(filterAdminScreens(full, "clinic runs").map((m) => m.label)).toEqual(["Booking rules"]);
  });

  it("collapses repeated spaces in the query", () => {
    expect(filterAdminScreens(full, "all   sessions").map((m) => m.tab)).toEqual(["all"]);
  });
});
