import { describe, expect, it } from "vitest";
import { isMoreActive, isNavItemActive, splitTabs } from "./dashboardTabs";

const items = [
  { id: "overview", href: "/patient/dashboard" },
  { id: "book", href: "/patient/dashboard/book" },
  { id: "suggested", href: "/patient/dashboard/suggested" },
  { id: "sessions", href: "/patient/dashboard/sessions" },
  { id: "payments", href: "/patient/dashboard/payments" },
  { id: "health-profile", href: "/patient/dashboard/health-profile" },
  { id: "edit-profile", href: "/patient/dashboard/profile" },
];

describe("splitTabs", () => {
  it("puts the named entries on the bar and the rest behind More, in sidebar order", () => {
    const s = splitTabs(items, ["overview", "sessions", "book", "health-profile"], "book");
    expect(s.tabs.map((t) => t.id)).toEqual(["overview", "sessions", "book", "health-profile"]);
    expect(s.centerId).toBe("book");
    expect(s.more.map((t) => t.id)).toEqual(["suggested", "payments", "edit-profile"]);
  });

  it("skips an entry that does not exist instead of leaving a gap", () => {
    const noSessions = items.filter((i) => i.id !== "sessions");
    const s = splitTabs(noSessions, ["overview", "sessions", "book", "health-profile"], "book");
    expect(s.tabs.map((t) => t.id)).toEqual(["overview", "book", "health-profile"]);
    expect(s.more.map((t) => t.id)).not.toContain("sessions");
  });

  it("never puts more than four on the bar", () => {
    const s = splitTabs(items, items.map((i) => i.id));
    expect(s.tabs).toHaveLength(4);
    expect(s.more).toHaveLength(3);
  });

  it("moves the centre action to the middle of a full bar", () => {
    const s = splitTabs(items, ["book", "overview", "sessions", "health-profile"], "book");
    expect(s.tabs.map((t) => t.id)).toEqual(["overview", "sessions", "book", "health-profile"]);
  });

  it("drops a centre id that is not on the bar", () => {
    const s = splitTabs(items, ["overview", "sessions"], "book");
    expect(s.centerId).toBeNull();
  });

  it("does not list an entry twice when its id is repeated", () => {
    const s = splitTabs(items, ["overview", "overview", "sessions"]);
    expect(s.tabs.map((t) => t.id)).toEqual(["overview", "sessions"]);
  });
});

describe("isNavItemActive", () => {
  const base = "/therapist/dashboard";
  it("matches the exact screen", () => {
    expect(isNavItemActive("/therapist/dashboard/sessions", base, "/therapist/dashboard/sessions")).toBe(true);
  });
  it("keeps a section lit on its detail pages", () => {
    expect(
      isNavItemActive("/therapist/dashboard/health-profile/abc", base, "/therapist/dashboard/health-profile")
    ).toBe(true);
  });
  it("never lights Overview on another screen", () => {
    expect(isNavItemActive("/therapist/dashboard/sessions", base, base)).toBe(false);
    expect(isNavItemActive(base, base, base)).toBe(true);
  });
  it("is false with no href or no pathname", () => {
    expect(isNavItemActive("/x", base)).toBe(false);
    expect(isNavItemActive(null, base, base)).toBe(false);
  });
  it("does not match a sibling that shares a prefix", () => {
    expect(isNavItemActive("/patient/dashboard/bookings", "/patient/dashboard", "/patient/dashboard/book")).toBe(false);
  });
});

describe("isMoreActive", () => {
  it("is true when the current screen lives behind More", () => {
    expect(isMoreActive("/patient/dashboard/payments", "/patient/dashboard", items.slice(4))).toBe(true);
    expect(isMoreActive("/patient/dashboard", "/patient/dashboard", items.slice(4))).toBe(false);
  });
});
