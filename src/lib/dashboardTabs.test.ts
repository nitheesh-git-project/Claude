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
    const s = splitTabs(noSessions, ["overview", "sessions", "health-profile"]);
    expect(s.tabs.map((t) => t.id)).toEqual(["overview", "health-profile"]);
    expect(s.more.map((t) => t.id)).not.toContain("sessions");
  });

  // A new patient has no Sessions entry: Home, Book, My progress and More is
  // four slots, and Book sat second of four instead of in the middle.
  it("fills a missing entry's place so the centre action stays in the middle", () => {
    const newPatient = items.filter((i) => !["sessions", "suggested", "payments"].includes(i.id));
    const s = splitTabs(
      newPatient,
      ["overview", "sessions", "book", "health-profile"],
      "book",
      ["suggested", "packages", "payments", "edit-profile"]
    );
    expect(s.tabs.map((t) => t.id)).toEqual(["overview", "edit-profile", "book", "health-profile"]);
    expect(s.tabs.findIndex((t) => t.id === "book")).toBe(2); // of five slots, with More
    expect(s.more.map((t) => t.id)).not.toContain("edit-profile");
  });

  it("takes the first stand-in that exists", () => {
    const noSessions = items.filter((i) => i.id !== "sessions");
    const s = splitTabs(noSessions, ["overview", "sessions", "book", "health-profile"], "book", [
      "packages",
      "suggested",
      "edit-profile",
    ]);
    expect(s.tabs.map((t) => t.id)).toEqual(["overview", "suggested", "book", "health-profile"]);
  });

  it("drops to two entries when nothing can stand in, keeping the centre in the middle", () => {
    const few = items.filter((i) => ["overview", "book", "health-profile"].includes(i.id));
    const s = splitTabs(few, ["overview", "sessions", "book", "health-profile"], "book");
    expect(s.tabs.map((t) => t.id)).toEqual(["overview", "book"]);
    expect(s.more.map((t) => t.id)).toEqual(["health-profile"]);
  });

  it("always leaves the centre action in the middle of an odd number of slots", () => {
    const ids = items.map((i) => i.id).filter((id) => id !== "book");
    // every subset of the other entries the bar could be asked for
    for (let mask = 0; mask < 1 << ids.length; mask++) {
      const present = items.filter((i) => i.id === "book" || ids.some((id, b) => id === i.id && mask & (1 << b)));
      const s = splitTabs(present, ["overview", "sessions", "book", "health-profile"], "book", [
        "suggested",
        "payments",
        "edit-profile",
      ]);
      const slots = s.tabs.length + 1; // More
      if (s.tabs.length === 1) {
        // Book alone beside More: no middle, so it is an ordinary tab.
        expect(s.centerId).toBeNull();
        continue;
      }
      expect(slots % 2, `odd slots for ${present.map((p) => p.id)}`).toBe(1);
      expect(s.tabs.findIndex((t) => t.id === "book")).toBe((slots - 1) / 2);
    }
  });

  it("leaves a bar without a centre action as it is", () => {
    const noSessions = items.filter((i) => i.id !== "sessions");
    const s = splitTabs(noSessions, ["overview", "sessions", "health-profile"], null, ["edit-profile"]);
    expect(s.tabs.map((t) => t.id)).toEqual(["overview", "health-profile"]);
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
