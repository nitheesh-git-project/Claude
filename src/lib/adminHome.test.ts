import { describe, it, expect } from "vitest";
import {
  buildAdminHome,
  orderQueueGroups,
  visibleQueueTotal,
  type AdminHomeCounts,
} from "@/lib/adminHome";
import { ADMIN_SCOPES, sectionsForScope, type AdminScope } from "@/lib/adminScope";
import type { AdminSectionKey, InboxGroup } from "@/lib/adminNav";

const ZERO: AdminHomeCounts = {
  sessionsToday: 0,
  unassignedToday: 0,
  unassignedTotal: 0,
  pendingAccounts: 0,
  pendingProfileChanges: 0,
  carePlansPending: 0,
  carePlansStale: 0,
  conditionRequestsPending: 0,
  conditionAccessPending: 0,
  payoutRequestsOpen: 0,
  cashToRemitVisits: 0,
  manualRefundsPending: 0,
  needsYouTotal: 0,
  owedToTherapistsPaise: 0,
};

const BUSY: AdminHomeCounts = {
  sessionsToday: 9,
  unassignedToday: 2,
  unassignedTotal: 5,
  pendingAccounts: 3,
  pendingProfileChanges: 1,
  carePlansPending: 4,
  carePlansStale: 2,
  conditionRequestsPending: 2,
  conditionAccessPending: 1,
  payoutRequestsOpen: 3,
  cashToRemitVisits: 6,
  manualRefundsPending: 1,
  needsYouTotal: 21,
  owedToTherapistsPaise: 4_250_00,
};

/** The section a dashboard href points at, which is the only part of it
 *  scope decides. */
function sectionOf(href: string): AdminSectionKey {
  return new URL(href, "https://x.test").searchParams.get("section") as AdminSectionKey;
}

describe("buildAdminHome", () => {
  it("never hands a scope a link it cannot follow", () => {
    // The bug this replaces: the quick actions were hardcoded at Sessions
    // and Money for all four scopes. findTab falls back to the first
    // section a scope *can* open, so a finance admin tapping "All sessions"
    // silently landed back on Today -- a dead link that looks like it
    // worked.
    for (const scope of ADMIN_SCOPES) {
      const allowed = sectionsForScope(scope);
      const home = buildAdminHome(scope, BUSY);
      for (const action of home.actions) {
        expect(allowed, `${scope} action "${action.label}"`).toContain(sectionOf(action.href));
      }
      for (const cell of home.cells) {
        if (!cell.href) continue;
        expect(allowed, `${scope} cell "${cell.label}"`).toContain(sectionOf(cell.href));
      }
    }
  });

  it("gives every scope four figures and somewhere to go", () => {
    for (const scope of ADMIN_SCOPES) {
      const home = buildAdminHome(scope, BUSY);
      // Four is the strip's own layout (StatStrip switches to a 4-up grid
      // at four cells), so a scope with three would render differently
      // from its colleagues' for no reason a reader could name.
      expect(home.cells, scope).toHaveLength(4);
      expect(home.actions.length, scope).toBeGreaterThan(0);
      expect(home.actions.filter((a) => a.primary), scope).toHaveLength(1);
      expect(home.headline, scope).not.toBe("");
    }
  });

  it("leads each scope with its own work", () => {
    expect(buildAdminHome("operations", BUSY).cells[0].label).toBe("Unassigned sessions");
    expect(buildAdminHome("finance", BUSY).cells[0].label).toBe("Owed to therapists");
    expect(buildAdminHome("clinical", BUSY).cells[0].label).toBe("Recommendations");
    expect(buildAdminHome("full", BUSY).cells[0].label).toBe("Sessions today");
  });

  it("keeps a money figure off a dashboard that cannot open Money", () => {
    // Not merely unlinked: a clinical admin has no business reading the
    // clinic's outstanding payout balance off their landing screen, and the
    // page does not compute it for them either.
    for (const scope of ["clinical", "operations"] as AdminScope[]) {
      const labels = buildAdminHome(scope, BUSY).cells.map((c) => c.label);
      expect(labels).not.toContain("Owed to therapists");
    }
    expect(buildAdminHome("finance", BUSY).cells.map((c) => c.label)).toContain(
      "Owed to therapists"
    );
  });

  it("says a balance it could not compute is missing rather than zero", () => {
    const home = buildAdminHome("finance", { ...BUSY, owedToTherapistsPaise: null });
    const owed = home.cells.find((c) => c.label === "Owed to therapists");
    expect(owed?.value).toBe("—");
    // ...and not "₹0", which is a real answer meaning nothing is owed.
    expect(owed?.value).not.toBe("₹0");
  });

  it("counts what the viewer can act on, not what exists", () => {
    // The strip's "Needs you" figure is passed in from visibleQueueTotal
    // over the same groups the queue list renders, so the two agree by
    // construction. This asserts the cell reads that number and nothing
    // else.
    for (const scope of ADMIN_SCOPES) {
      const home = buildAdminHome(scope, { ...BUSY, needsYouTotal: 3 });
      expect(home.cells.find((c) => c.label === "Needs you")?.value, scope).toBe("3");
    }
  });

  it("does not manufacture urgency out of an empty clinic", () => {
    for (const scope of ADMIN_SCOPES) {
      const home = buildAdminHome(scope, ZERO);
      expect(home.headline, scope).toMatch(/Nothing|No |no |Every session/);
      expect(home.cells.find((c) => c.label === "Needs you")?.accent).toBe("bg-emerald-500");
    }
  });

  it("names what a limited scope cannot open, and tells a full admin nothing", () => {
    expect(buildAdminHome("full", ZERO).accessNote).toBeNull();
    const note = buildAdminHome("clinical", ZERO).accessNote;
    expect(note?.sections).toEqual(["Today", "Sessions", "People"]);
    expect(note?.withheld).toEqual(["Money", "Catalog", "Settings"]);
  });

  it("reads an unknown scope as full rather than blank", () => {
    // parseAdminScope already defaults an unknown column value to 'full';
    // this is the same guarantee one layer up, so a row written before the
    // column existed still lands on a working dashboard.
    const home = buildAdminHome("weekend-cover" as AdminScope, BUSY);
    expect(home.greeting).toBe("The clinic today");
    expect(home.actions.length).toBeGreaterThan(0);
  });
});

// ---- Queues -----------------------------------------------------------

function group(domain: InboxGroup["domain"], section: AdminSectionKey, count: number): InboxGroup {
  return {
    title: domain,
    icon: "fa-inbox",
    domain,
    items: [{ label: domain, count, section, tab: "x", hint: "" }],
  };
}

const GROUPS: InboxGroup[] = [
  group("approvals", "today", 4),
  group("scheduling", "sessions", 5),
  group("clinical", "sessions", 7),
  group("money", "money", 9),
  group("health", "settings", 2),
];

describe("visibleQueueTotal", () => {
  it("counts only rows whose screen the viewer can open", () => {
    // A clinical admin used to be told 27 things were waiting over a list
    // showing 12 -- the queue list already filtered by scope while the
    // figure above it summed everything.
    expect(visibleQueueTotal(GROUPS, sectionsForScope("clinical"))).toBe(16);
    expect(visibleQueueTotal(GROUPS, sectionsForScope("finance"))).toBe(13);
    expect(visibleQueueTotal(GROUPS, sectionsForScope("full"))).toBe(27);
  });
});

describe("orderQueueGroups", () => {
  it("puts a scope's own work first", () => {
    expect(orderQueueGroups(GROUPS, "finance").map((g) => g.domain)[0]).toBe("money");
    expect(orderQueueGroups(GROUPS, "clinical").map((g) => g.domain)[0]).toBe("clinical");
    expect(orderQueueGroups(GROUPS, "operations").map((g) => g.domain)[0]).toBe("scheduling");
  });

  it("leaves a full admin's page order alone", () => {
    expect(orderQueueGroups(GROUPS, "full")).toEqual(GROUPS);
  });

  it("removes nothing — ordering is emphasis, not permission", () => {
    // What a scope may work is the routes' decision. A UI that hid a
    // reachable queue would be a second permission model, disagreeing with
    // the first the day either one changes.
    for (const scope of ADMIN_SCOPES) {
      const ordered = orderQueueGroups(GROUPS, scope);
      expect(ordered).toHaveLength(GROUPS.length);
      expect([...ordered].map((g) => g.domain).sort()).toEqual(
        GROUPS.map((g) => g.domain).sort()
      );
    }
  });

  it("keeps page order for a group the scope's list does not name", () => {
    // A new queue group added to the page appears where the page put it,
    // rather than vanishing or jumping to the top.
    const withNew = [...GROUPS, group("growth", "people", 1)];
    const ordered = orderQueueGroups(withNew, "clinical");
    expect(ordered.map((g) => g.domain)).toContain("growth");
  });
});
