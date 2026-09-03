import { describe, it, expect } from "vitest";
import {
  actionSpecsFor,
  buildAdminHome,
  orderQueueGroups,
  reachableActions,
  visibleQueueTotal,
  type AdminActionSpec,
  type AdminHomeCounts,
} from "@/lib/adminHome";
import { ADMIN_SCOPES, sectionsForScope, type AdminScope } from "@/lib/adminScope";
import { ADMIN_SECTIONS, type AdminSectionKey, type InboxGroup } from "@/lib/adminNav";

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

// ---- Structural contracts ---------------------------------------------
//
// `adminScreenHref(section, tab, view)` types only its first argument: `tab`
// and `view` are plain strings, and this module hand-writes a dozen of each.
// A wrong one does not throw -- findTab falls back to the section's first
// screen and an unknown view falls through to cleared filters -- so it looks
// like a working link that lands somewhere else. That is the exact failure
// the "hardcoded ?section=&tab= link is a dead link waiting to happen"
// gotcha describes, and only a test catches it.

function paramOf(href: string, key: string): string | null {
  return new URL(href, "https://x.test").searchParams.get(key);
}

/** The presets each target screen actually implements. Mirrors the branches
 *  in AdminAllSessionsTab (`viewParam === ...`) and AdminPayoutsTab. If a
 *  screen learns a new preset this list is what says so. */
const KNOWN_VIEWS: Partial<Record<AdminSectionKey, Record<string, string[]>>> = {
  sessions: {
    all: ["unassigned", "cancelled", "no_show", "completed", "home_visit", "unpaid", "today"],
  },
  money: { payouts: ["owed", "settled"] },
};

function everyHref(scope: AdminScope): { where: string; href: string }[] {
  const home = buildAdminHome(scope, BUSY);
  return [
    ...home.cells.filter((c) => c.href).map((c) => ({ where: `cell "${c.label}"`, href: c.href! })),
    ...home.actions.map((a) => ({ where: `action "${a.label}"`, href: a.href })),
  ];
}

describe("the links buildAdminHome writes", () => {
  it("names a screen that exists", () => {
    for (const scope of ADMIN_SCOPES) {
      for (const { where, href } of everyHref(scope)) {
        const section = ADMIN_SECTIONS.find((s) => s.key === paramOf(href, "section"));
        expect(section, `${scope} ${where} -> unknown section`).toBeDefined();
        const tab = paramOf(href, "tab");
        expect(
          section!.tabs.map((t) => t.key),
          `${scope} ${where} -> tab "${tab}" is not a screen of ${section!.key}`
        ).toContain(tab);
      }
    }
  });

  it("only asks for a filter preset the target screen implements", () => {
    for (const scope of ADMIN_SCOPES) {
      for (const { where, href } of everyHref(scope)) {
        const view = paramOf(href, "view");
        if (!view) continue;
        const section = paramOf(href, "section") as AdminSectionKey;
        const tab = paramOf(href, "tab") as string;
        expect(
          KNOWN_VIEWS[section]?.[tab] ?? [],
          `${scope} ${where} -> "${view}" is not a preset ${section}/${tab} knows`
        ).toContain(view);
      }
    }
  });
});

describe("React keys", () => {
  // StatStrip keys its cells on `cell.label` and DashboardOverview keys its
  // actions on `href + label`. A duplicate is not a crash -- React drops the
  // second node and warns -- so a repeated label would silently render three
  // figures where four were computed.
  it("gives every cell a label unique within its strip", () => {
    for (const scope of ADMIN_SCOPES) {
      const labels = buildAdminHome(scope, BUSY).cells.map((c) => c.label);
      expect(new Set(labels).size, `${scope} has a duplicate cell label`).toBe(labels.length);
    }
  });

  it("gives every action a unique href+label", () => {
    for (const scope of ADMIN_SCOPES) {
      const keys = buildAdminHome(scope, BUSY).actions.map((a) => a.href + a.label);
      expect(new Set(keys).size, `${scope} has a duplicate action key`).toBe(keys.length);
    }
  });
});

describe("purity", () => {
  // This runs inside a Server Component render that realtime re-triggers on
  // every booking, and the admin dashboard rebuilds ~40 queries per refresh.
  // Anything that accumulated state across calls would drift a figure a few
  // refreshes in, which is the hardest kind of bug to see.
  it("returns the same answer however many times it is called", () => {
    for (const scope of ADMIN_SCOPES) {
      const first = buildAdminHome(scope, BUSY);
      for (let i = 0; i < 50; i++) {
        expect(buildAdminHome(scope, BUSY)).toEqual(first);
      }
    }
  });

  it("does not write to the counts it was given", () => {
    const counts = { ...BUSY };
    for (const scope of ADMIN_SCOPES) buildAdminHome(scope, counts);
    expect(counts).toEqual(BUSY);
  });

  it("leaves the queue groups it orders untouched", () => {
    const groups = [...GROUPS];
    const snapshot = JSON.stringify(GROUPS);
    for (const scope of ADMIN_SCOPES) orderQueueGroups(groups, scope);
    expect(JSON.stringify(GROUPS)).toBe(snapshot);
    // ...and the array it was handed is not reordered in place, which would
    // make the queue list's order depend on which scope rendered last.
    expect(groups.map((g) => g.domain)).toEqual(GROUPS.map((g) => g.domain));
  });

  it("orders the same way every time", () => {
    for (const scope of ADMIN_SCOPES) {
      const first = orderQueueGroups(GROUPS, scope).map((g) => g.domain);
      for (let i = 0; i < 20; i++) {
        expect(orderQueueGroups(GROUPS, scope).map((g) => g.domain)).toEqual(first);
      }
    }
  });
});

describe("numbers it is handed", () => {
  it("reads singulars correctly at one", () => {
    const one: AdminHomeCounts = {
      ...ZERO,
      sessionsToday: 1,
      unassignedTotal: 1,
      cashToRemitVisits: 1,
      carePlansPending: 1,
      payoutRequestsOpen: 1,
      needsYouTotal: 1,
      owedToTherapistsPaise: 100,
    };
    expect(buildAdminHome("operations", one).headline).toContain("1 booked session has");
    expect(buildAdminHome("clinical", one).headline).toContain("1 recommendation is");
    const cash = buildAdminHome("full", one).cells.find((c) => c.label === "Cash to remit");
    expect(cash?.unit).toBe("visit");
  });

  it("formats a large balance in Indian digit grouping", () => {
    const home = buildAdminHome("finance", { ...BUSY, owedToTherapistsPaise: 12_34_567_00 });
    expect(home.cells.find((c) => c.label === "Owed to therapists")?.value).toBe("₹12,34,567");
  });

  it("survives figures no clinic should ever produce", () => {
    // Not a scenario -- a guarantee that a bad count degrades to an odd
    // sentence rather than throwing inside a dashboard render.
    for (const scope of ADMIN_SCOPES) {
      for (const n of [-1, 0, Number.MAX_SAFE_INTEGER]) {
        const counts: AdminHomeCounts = {
          ...ZERO,
          sessionsToday: n,
          unassignedTotal: n,
          needsYouTotal: n,
          carePlansPending: n,
          owedToTherapistsPaise: n,
        };
        expect(() => buildAdminHome(scope, counts)).not.toThrow();
        expect(buildAdminHome(scope, counts).cells).toHaveLength(4);
      }
    }
  });
});

describe("reachableActions", () => {
  // The production tables are already clean, so buildAdminHome's own output
  // cannot tell you whether this filter works -- removing it changes
  // nothing today and everything the day a screen moves between sections.
  // These drive it directly.
  const spec = (label: string, section: AdminSectionKey, tab: string): AdminActionSpec => ({
    label,
    hint: "",
    icon: "fa-circle",
    section,
    tab,
  });

  it("drops an action pointing at a section this scope cannot open", () => {
    const specs = [spec("Payouts", "money", "payouts"), spec("Patients", "people", "patients")];
    const kept = reachableActions("clinical", specs).map((a) => a.label);
    expect(kept).toEqual(["Patients"]);
  });

  it("keeps them all for a scope that can open everything", () => {
    const specs = [spec("Payouts", "money", "payouts"), spec("Settings", "settings", "team")];
    expect(reachableActions("full", specs)).toHaveLength(2);
  });

  it("drops rather than rewrites -- a filtered action never becomes a wrong link", () => {
    const kept = reachableActions("finance", [spec("Roster", "sessions", "roster")]);
    expect(kept).toEqual([]);
  });

  it("carries the view preset through onto the href", () => {
    const withView: AdminActionSpec = { ...spec("Owed", "money", "payouts"), view: "owed" };
    expect(reachableActions("finance", [withView])[0].href).toContain("view=owed");
  });

  it("finds nothing to drop in the tables as written", () => {
    // The filter is a net, not something the tables lean on. If this fails,
    // a table names a section its own scope cannot open -- fix the table;
    // the admin would silently lose an action rather than see a bad one.
    for (const scope of ADMIN_SCOPES) {
      const specs = actionSpecsFor(scope);
      expect(reachableActions(scope, specs), `${scope}`).toHaveLength(specs.length);
    }
  });
});
