import { describe, expect, it } from "vitest";
import { ADMIN_SECTIONS } from "@/lib/adminNav";
import {
  ACCESS_LEVELS,
  ADMIN_CAPABILITY_GROUPS,
  ADMIN_SCOPES,
  ADMIN_SCOPE_BLURBS,
  ADMIN_SCOPE_LABELS,
  parseAdminScope,
  scopeCanManage,
  scopeCanOpen,
  scopeHasCapability,
  sectionAccess,
  sectionsForScope,
} from "@/lib/adminScope";

// The access model is the one piece of this app where a mistake is silent
// and expensive: a wrong cell does not throw, it just hands somebody a
// screen. These are the invariants that make the User Access matrix
// trustworthy -- it is rendered from exactly these functions, so a test
// here is a test of what that screen claims.

describe("the section grid", () => {
  it("gives every scope an answer for every section", () => {
    // A missing pair would fall back to `full`'s, which is the one direction
    // a permissions gap must never fail in.
    for (const scope of ADMIN_SCOPES) {
      for (const section of ADMIN_SECTIONS) {
        expect(ACCESS_LEVELS).toContain(sectionAccess(scope, section.key));
      }
    }
  });

  it("lets a full admin manage everything, and only a full admin reach Settings", () => {
    for (const section of ADMIN_SECTIONS) {
      expect(scopeCanManage("full", section.key)).toBe(true);
    }
    for (const scope of ADMIN_SCOPES) {
      if (scope === "full") continue;
      expect(scopeCanOpen(scope, "settings")).toBe(false);
    }
  });

  it("gives every scope Today, since that is where their work is listed", () => {
    for (const scope of ADMIN_SCOPES) {
      expect(scopeCanManage(scope, "today")).toBe(true);
    }
  });

  it("lets finance read sessions without touching one", () => {
    // The whole reason the middle level exists: finance reconciles against
    // what a session was and must not be able to cancel or reassign the
    // sessions they are reconciling.
    expect(sectionAccess("finance", "sessions")).toBe("view");
    expect(scopeCanOpen("finance", "sessions")).toBe(true);
    expect(scopeCanManage("finance", "sessions")).toBe(false);
  });

  it("keeps money off every scope that is not full or finance", () => {
    expect(scopeCanOpen("operations", "money")).toBe(false);
    expect(scopeCanOpen("clinical", "money")).toBe(false);
  });
});

describe("scopeCanOpen vs scopeCanManage", () => {
  it("never says manage where it does not say open", () => {
    // requireAdminScope asks the second and the sidebar asks the first; a
    // pair where manage outran open would be a route reachable from nowhere.
    for (const scope of ADMIN_SCOPES) {
      for (const section of ADMIN_SECTIONS) {
        if (scopeCanManage(scope, section.key)) {
          expect(scopeCanOpen(scope, section.key)).toBe(true);
        }
      }
    }
  });

  it("lists exactly the sections that are not `none`", () => {
    for (const scope of ADMIN_SCOPES) {
      const listed = sectionsForScope(scope);
      for (const section of ADMIN_SECTIONS) {
        expect(listed.includes(section.key)).toBe(sectionAccess(scope, section.key) !== "none");
      }
    }
  });
});

describe("the capability matrix", () => {
  it("names a real section on every row", () => {
    // The matrix is derived from the grid; a row pointing at a section that
    // does not exist would silently render as "no access" for everybody.
    const keys = ADMIN_SECTIONS.map((s) => s.key);
    for (const group of ADMIN_CAPABILITY_GROUPS) {
      expect(keys).toContain(group.section);
      for (const cap of group.capabilities) {
        expect(keys).toContain(cap.section);
        // A row in the wrong group would read correctly and explain the
        // wrong rule.
        expect(cap.section).toBe(group.section);
      }
    }
  });

  it("covers every section, so the screen never silently omits one", () => {
    const covered = new Set(ADMIN_CAPABILITY_GROUPS.map((g) => g.section));
    for (const section of ADMIN_SECTIONS) {
      expect(covered.has(section.key)).toBe(true);
    }
  });

  it("gives every group at least one thing you can only read", () => {
    // Without a read row a group cannot show the difference between `view`
    // and `none`, which is the distinction the screen exists to explain.
    for (const group of ADMIN_CAPABILITY_GROUPS) {
      expect(group.capabilities.some((c) => !c.writes)).toBe(true);
    }
  });

  it("answers out of the grid rather than from a second list", () => {
    for (const scope of ADMIN_SCOPES) {
      for (const group of ADMIN_CAPABILITY_GROUPS) {
        for (const cap of group.capabilities) {
          const expected = cap.writes
            ? scopeCanManage(scope, cap.section)
            : scopeCanOpen(scope, cap.section);
          expect(scopeHasCapability(scope, cap)).toBe(expected);
        }
      }
    }
  });

  it("shows finance reading a session and not changing one", () => {
    const sessions = ADMIN_CAPABILITY_GROUPS.find((g) => g.section === "sessions");
    expect(sessions).toBeDefined();
    const read = sessions!.capabilities.find((c) => !c.writes)!;
    const write = sessions!.capabilities.find((c) => c.writes)!;
    expect(scopeHasCapability("finance", read)).toBe(true);
    expect(scopeHasCapability("finance", write)).toBe(false);
  });
});

describe("names", () => {
  it("gives every scope a label and a blurb", () => {
    for (const scope of ADMIN_SCOPES) {
      expect(ADMIN_SCOPE_LABELS[scope]).toBeTruthy();
      expect(ADMIN_SCOPE_BLURBS[scope]).toBeTruthy();
    }
  });

  it("reads anything it does not recognise as full", () => {
    // A migration must never lock the only admin out of their own dashboard.
    expect(parseAdminScope(null)).toBe("full");
    expect(parseAdminScope("bookkeeper")).toBe("full");
    expect(parseAdminScope("finance")).toBe("finance");
  });
});
