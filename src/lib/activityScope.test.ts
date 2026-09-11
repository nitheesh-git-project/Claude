import { describe, it, expect } from "vitest";
import {
  ACTION_DOMAIN,
  activityScopeNote,
  canReadActivity,
  filterActivityForViewer,
} from "@/lib/activityScope";
import { ADMIN_ACTIVITY_LABELS } from "@/lib/adminActivityLog";
import {
  ADMIN_SCOPES,
  scopeCanManage,
  sectionsForScope,
  type AdminScope,
} from "@/lib/adminScope";
import type { AdminSectionKey } from "@/lib/adminNav";

function workable(scope: AdminScope): AdminSectionKey[] {
  return sectionsForScope(scope).filter((section) => scopeCanManage(scope, section));
}

function viewer(scope: AdminScope) {
  return { scope, workableSections: workable(scope) };
}

describe("ACTION_DOMAIN", () => {
  // An action with no domain is one nobody decided the audience for. The
  // fallback hides it from every scoped desk, which is the safe direction --
  // but a rule enforced only by a fallback is a rule that quietly stops
  // covering new actions.
  it("covers every action in the audit union", () => {
    const missing = Object.keys(ADMIN_ACTIVITY_LABELS).filter((a) => !ACTION_DOMAIN[a]);
    expect(missing).toEqual([]);
  });

  it("names no domain outside the six sections, apart from full_only", () => {
    const sections: string[] = [
      "today",
      "sessions",
      "people",
      "money",
      "catalog",
      "settings",
      "full_only",
    ];
    for (const [action, domain] of Object.entries(ACTION_DOMAIN)) {
      expect(sections, `${action} -> ${domain}`).toContain(domain);
    }
  });

  // The four capabilities no section grants. A scoped desk reading that an
  // account was minted, a scope changed, the database reset or somebody
  // signed in as a patient is reading a Master Admin's own work.
  it("keeps the Master Admin's own capabilities out of every desk", () => {
    for (const action of [
      "account.create",
      "admin.set_scope",
      "data.reset",
      "impersonation.start",
      "impersonation.end",
    ]) {
      expect(ACTION_DOMAIN[action]).toBe("full_only");
      for (const scope of ADMIN_SCOPES.filter((s) => s !== "full")) {
        expect(canReadActivity(viewer(scope), { scope }, action)).toBe(false);
      }
    }
  });
});

describe("canReadActivity", () => {
  it("shows a Master Admin everything, whoever did it", () => {
    for (const actorScope of ADMIN_SCOPES) {
      expect(canReadActivity(viewer("full"), { scope: actorScope }, "payout.settle")).toBe(true);
      expect(canReadActivity(viewer("full"), { scope: actorScope }, "data.reset")).toBe(true);
    }
    // Even an action this module has never heard of.
    expect(canReadActivity(viewer("full"), { scope: null }, "something.new")).toBe(true);
  });

  it("shows a desk its own work", () => {
    expect(
      canReadActivity(viewer("operations"), { scope: "operations" }, "session.assign")
    ).toBe(true);
    expect(canReadActivity(viewer("finance"), { scope: "finance" }, "payout.settle")).toBe(true);
    expect(
      canReadActivity(viewer("clinical"), { scope: "clinical" }, "care_plan.approve")
    ).toBe(true);
  });

  // The domain half: an action whose screen this desk cannot open is an
  // action it cannot act on, so it is not theirs to read.
  it("hides another desk's domain even when the actor shares the scope", () => {
    expect(
      canReadActivity(viewer("operations"), { scope: "operations" }, "payout.settle")
    ).toBe(false);
    expect(canReadActivity(viewer("finance"), { scope: "finance" }, "session.assign")).toBe(
      false
    );
  });

  // The actor half: what the clinic asked for. A Master Admin's session
  // assignment is operations work, and is still hidden from Operations.
  it("hides the same domain when somebody else's desk did it", () => {
    expect(canReadActivity(viewer("operations"), { scope: "full" }, "session.assign")).toBe(
      false
    );
    expect(
      canReadActivity(viewer("operations"), { scope: "clinical" }, "session.assign")
    ).toBe(false);
    expect(canReadActivity(viewer("operations"), { scope: null }, "session.assign")).toBe(false);
  });

  // Finance reads Sessions at `view` and cannot work it, so a session
  // assignment is not their work even when finance performed it -- the same
  // rule the Today queue counts follow.
  it("reads `manage`, not merely `open`", () => {
    expect(workable("finance")).not.toContain("sessions");
    expect(canReadActivity(viewer("finance"), { scope: "finance" }, "session.assign")).toBe(
      false
    );
  });

  it("hides an action it has never heard of from a scoped desk", () => {
    expect(canReadActivity(viewer("operations"), { scope: "operations" }, "something.new")).toBe(
      false
    );
  });
});

describe("filterActivityForViewer", () => {
  const rows = [
    { id: "1", action: "session.assign", actorScope: "operations" as AdminScope | null },
    { id: "2", action: "payout.settle", actorScope: "finance" as AdminScope | null },
    { id: "3", action: "session.cancel", actorScope: "full" as AdminScope | null },
    { id: "4", action: "care_plan.approve", actorScope: "clinical" as AdminScope | null },
    { id: "5", action: "data.reset", actorScope: "full" as AdminScope | null },
  ];

  it("leaves a Master Admin's list untouched, in order", () => {
    expect(filterActivityForViewer(viewer("full"), rows)).toEqual(rows);
  });

  it("gives each desk its own rows and keeps the order", () => {
    expect(filterActivityForViewer(viewer("operations"), rows).map((r) => r.id)).toEqual(["1"]);
    expect(filterActivityForViewer(viewer("finance"), rows).map((r) => r.id)).toEqual(["2"]);
    expect(filterActivityForViewer(viewer("clinical"), rows).map((r) => r.id)).toEqual(["4"]);
  });
});

describe("activityScopeNote", () => {
  // A scoped desk reading "nothing has happened" while a Master Admin has
  // been working all morning would be told something false.
  it("says whose activity a scoped desk is reading, and nothing to a Master Admin", () => {
    expect(activityScopeNote("full")).toBeNull();
    for (const scope of ADMIN_SCOPES.filter((s) => s !== "full")) {
      expect(activityScopeNote(scope)).toMatch(/your own desk/i);
    }
  });
});
