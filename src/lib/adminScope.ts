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
// level in Team & Access's picker, and it is what the dashboard calls
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
  finance: "Money, payouts and partner revenue. No clinical records.",
  clinical: "Patients, sessions and care records. No money, no settings.",
};

// Which sections each scope may open. Today is deliberately shared: every
// scope needs to know what is waiting on them, and the inbox itself only
// shows rows whose destination the viewer can reach.
const SECTIONS_BY_SCOPE: Record<AdminScope, AdminSectionKey[]> = {
  full: ["today", "sessions", "people", "money", "catalog", "settings"],
  operations: ["today", "sessions", "people", "catalog"],
  finance: ["today", "people", "money"],
  clinical: ["today", "sessions", "people"],
};

export function sectionsForScope(scope: AdminScope): AdminSectionKey[] {
  return SECTIONS_BY_SCOPE[scope] ?? SECTIONS_BY_SCOPE.full;
}

export function scopeCanOpen(scope: AdminScope, section: AdminSectionKey): boolean {
  return sectionsForScope(scope).includes(section);
}

// Anything not written by a person's own hand -- an unknown value from an
// older row, a null before the column existed -- reads as 'full', matching
// the pre-scope behaviour of every existing admin. A migration must never
// silently lock the only admin out of their own dashboard.
export function parseAdminScope(value: unknown): AdminScope {
  return ADMIN_SCOPES.includes(value as AdminScope) ? (value as AdminScope) : "full";
}
