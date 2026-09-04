import type { AdminSectionKey } from "@/lib/adminNav";

// Admin scopes. Before this, "admin" was all-or-nothing and the only way to
// create one was editing the database by hand -- so an ops assistant who
// needed to see bookings also got the ability to settle payouts. A scope is
// a coarse role, deliberately not a per-route permission matrix: the failure
// mode of a fine-grained matrix is a route quietly falling through a gap in
// it, and coarse groups are checkable by reading one list.
//
// 'full' is the only scope that can change scopes -- otherwise a limited
// admin could promote themselves and the whole thing is decoration.
export const ADMIN_SCOPES = ["full", "operations", "finance", "clinical"] as const;
export type AdminScope = (typeof ADMIN_SCOPES)[number];

// One name per scope, and it does two jobs on purpose: it is the access
// level in User Access's picker, and it is what the dashboard calls
// itself in the sidebar and the page header. A second set of names for the
// same four things is exactly the "one word for one concept" failure this
// codebase keeps correcting -- an admin should not have to work out whether
// the "Operations" in the picker is the "Operations" on their screen.
//
// `full` reads "Master Admin" rather than "Full access" for that reason:
// as a permission both work, but only one of them is the name of a desk
// somebody sits at, and the label has to serve both readings.
export const ADMIN_SCOPE_LABELS: Record<AdminScope, string> = {
  full: "Master Admin",
  operations: "Operations",
  finance: "Finance",
  clinical: "Clinical",
};

export const ADMIN_SCOPE_BLURBS: Record<AdminScope, string> = {
  full: "Everything, including money, settings and managing other admins.",
  operations: "Bookings, people and catalog. No money screens, no settings.",
  finance: "Money, payouts and partner revenue. Reads sessions without changing them.",
  clinical: "Patients, sessions and care records. No money, no settings.",
};

/**
 * How much of a section a scope gets. Three values, and the middle one is
 * the point: a desk often needs to *read* something it must never change.
 *
 * - `none`   -- the section is not in their sidebar and every route under it
 *               answers the same way it answers a stranger.
 * - `view`   -- they can open it and read it. Every mutating control is
 *               absent, and the routes refuse them, so the two agree.
 * - `manage` -- read and write, which is what every grant was before this.
 *
 * There is deliberately no "write only". A dashboard cannot let somebody
 * change a row they are not allowed to see -- they would be editing blind --
 * so the third box a permissions matrix usually draws is one this product
 * has no honest meaning for.
 *
 * **`view` is enforced by the routes, not by the screen.** `requireAdminScope`
 * requires `manage`, so a section granted at `view` is read-only at all 98
 * admin routes without one of them being edited. Hiding the buttons is the
 * other half and is presentation: a control an admin's scope cannot call must
 * not render, or they meet a 403 with nothing to explain it.
 */
export const ACCESS_LEVELS = ["none", "view", "manage"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  none: "No access",
  view: "View only",
  manage: "View and edit",
};

// What each desk gets, section by section. Today is deliberately shared at
// `manage`: every scope needs to know what is waiting on them, and the inbox
// itself only shows rows whose destination the viewer can reach.
//
// Finance reads Sessions and cannot touch one. It is the one grant that is
// neither all nor nothing, and it exists because the question finance
// actually asks -- "what was this 1,200 rupees for?" -- was answerable only
// by asking somebody else, while the alternative (giving finance the
// Sessions section outright) hands the person who reconciles the books the
// ability to cancel and reassign the sessions they are reconciling.
const SECTION_ACCESS: Record<AdminScope, Record<AdminSectionKey, AccessLevel>> = {
  full: {
    today: "manage",
    sessions: "manage",
    people: "manage",
    money: "manage",
    catalog: "manage",
    settings: "manage",
  },
  operations: {
    today: "manage",
    sessions: "manage",
    people: "manage",
    money: "none",
    catalog: "manage",
    settings: "none",
  },
  finance: {
    today: "manage",
    sessions: "view",
    people: "manage",
    money: "manage",
    catalog: "none",
    settings: "none",
  },
  clinical: {
    today: "manage",
    sessions: "manage",
    people: "manage",
    money: "none",
    catalog: "none",
    settings: "none",
  },
};

export function sectionAccess(scope: AdminScope, section: AdminSectionKey): AccessLevel {
  return SECTION_ACCESS[scope]?.[section] ?? SECTION_ACCESS.full[section] ?? "none";
}

export function sectionsForScope(scope: AdminScope): AdminSectionKey[] {
  const grid = SECTION_ACCESS[scope] ?? SECTION_ACCESS.full;
  return (Object.keys(grid) as AdminSectionKey[]).filter((s) => grid[s] !== "none");
}

/**
 * Can they open it at all -- read or write. Unchanged in meaning for every
 * caller that existed before levels: a section was either in the list or it
 * was not, and every one of those grants is `manage` above.
 */
export function scopeCanOpen(scope: AdminScope, section: AdminSectionKey): boolean {
  return sectionAccess(scope, section) !== "none";
}

/**
 * Can they change anything in it. This is what `requireAdminScope` asks, so
 * it is the answer that actually holds -- `scopeCanOpen` only decides what
 * renders.
 */
export function scopeCanManage(scope: AdminScope, section: AdminSectionKey): boolean {
  return sectionAccess(scope, section) === "manage";
}

/**
 * What each desk can actually do, written as the jobs people describe rather
 * than as section names -- the grid above is the rule, this is the rule in a
 * sentence somebody can check.
 *
 * It is **derived, never a second list of permissions.** Each row names the
 * section it belongs to and whether doing it is reading or changing, and the
 * level comes back out of `SECTION_ACCESS`. A hand-maintained copy of who
 * can do what is a copy that goes stale the first time a scope changes, and
 * then the screen showing it is lying about the thing it exists to explain.
 *
 * Add a row when a capability is one somebody would ask about by name. Do
 * not add a row whose answer is not already decided by the grid -- if it
 * needs its own rule, the rule belongs in the grid, not here.
 */
export type AdminCapability = {
  /** What the person does, in their words. */
  label: string;
  /** The section whose access decides it. */
  section: AdminSectionKey;
  /** Whether doing it changes anything. Reading needs `view`; the rest `manage`. */
  writes: boolean;
};

export const ADMIN_CAPABILITY_GROUPS: { section: AdminSectionKey; title: string; capabilities: AdminCapability[] }[] = [
  {
    section: "today",
    title: "Today",
    capabilities: [
      { label: "See what is waiting on the clinic", section: "today", writes: false },
      { label: "Approve or turn down a new signup", section: "today", writes: true },
      { label: "Approve a change a patient asked for", section: "today", writes: true },
    ],
  },
  {
    section: "sessions",
    title: "Sessions",
    capabilities: [
      { label: "See every session and who is running it", section: "sessions", writes: false },
      { label: "See no-show and cancellation rates", section: "sessions", writes: false },
      { label: "Assign or change a session's therapist", section: "sessions", writes: true },
      { label: "Reschedule or cancel a session", section: "sessions", writes: true },
      { label: "Book a session on a patient's behalf", section: "sessions", writes: true },
      { label: "Approve or turn down a recommendation", section: "sessions", writes: true },
      { label: "Edit a therapist's working hours", section: "sessions", writes: true },
    ],
  },
  {
    section: "people",
    title: "People",
    capabilities: [
      { label: "See patients, therapists and partners", section: "people", writes: false },
      { label: "Suspend or restore an account", section: "people", writes: true },
      { label: "Reset somebody's password", section: "people", writes: true },
    ],
  },
  {
    section: "money",
    title: "Money",
    capabilities: [
      { label: "See revenue, refunds and what is owed", section: "money", writes: false },
      { label: "See what a patient paid, on their own record", section: "money", writes: false },
      { label: "Pay a therapist what they are owed", section: "money", writes: true },
      { label: "Refund a session", section: "money", writes: true },
      { label: "Take money off an unpaid session", section: "money", writes: true },
      { label: "Record what the clinic itself spends", section: "money", writes: true },
    ],
  },
  {
    section: "catalog",
    title: "Catalog",
    capabilities: [
      { label: "See what the clinic sells and at what price", section: "catalog", writes: false },
      { label: "Change a price, a programme or a service area", section: "catalog", writes: true },
    ],
  },
  {
    section: "settings",
    title: "Settings",
    capabilities: [
      { label: "See how the product is configured", section: "settings", writes: false },
      { label: "Change booking rules, offers and programmes", section: "settings", writes: true },
      { label: "Add a back-office account or change what it reaches", section: "settings", writes: true },
      { label: "Suspend somebody's access to this dashboard", section: "settings", writes: true },
    ],
  },
];

/** Whether a scope holds one capability, straight out of the grid. */
export function scopeHasCapability(scope: AdminScope, capability: AdminCapability): boolean {
  const level = sectionAccess(scope, capability.section);
  return capability.writes ? level === "manage" : level !== "none";
}

// Anything not written by a person's own hand -- an unknown value from an
// older row, a null before the column existed -- reads as 'full', matching
// the pre-scope behaviour of every existing admin. A migration must never
// silently lock the only admin out of their own dashboard.
export function parseAdminScope(value: unknown): AdminScope {
  return ADMIN_SCOPES.includes(value as AdminScope) ? (value as AdminScope) : "full";
}
