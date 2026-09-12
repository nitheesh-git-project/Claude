import { ACTION_DOMAIN, type ActionDomain } from "@/lib/activityScope";
import { ADMIN_ACTIVITY_LABELS, isMoneyAction } from "@/lib/adminActivityLog";
import { ADMIN_SECTIONS } from "@/lib/adminNav";

// The Logs section's own decisions, with the database and the browser taken
// out so they can be reasoned about and tested.
//
// Two jobs live here. **Finding one entry** in a table that grows forever --
// which is a search box and a category, not another hand-kept list of
// actions. And **retention**: the one way rows ever leave this table, and
// the only part of the audit trail that is not purely additive, so its rules
// are written down rather than spread across a route and a dialog.

// --------------------------------------------------------------------------
// Categories
// --------------------------------------------------------------------------

/**
 * What kind of work an entry is, for the type filter.
 *
 * Derived from `ACTION_DOMAIN` -- the section each action's own route guards
 * with -- rather than grouped again here. A second grouping of the same 80
 * actions is a second thing to update when a route moves, and the one that
 * goes stale is always the one nobody enforces.
 */
export type ActivityCategory = ActionDomain | "other";

const SECTION_LABEL = new Map(ADMIN_SECTIONS.map((s) => [s.key as string, s.label]));

export function activityCategory(action: string): ActivityCategory {
  return ACTION_DOMAIN[action] ?? "other";
}

export function activityCategoryLabel(category: ActivityCategory): string {
  if (category === "full_only") return "Master Admin only";
  if (category === "other") return "Other";
  return SECTION_LABEL.get(category) ?? category;
}

/**
 * The categories that actually have entries, in section order.
 *
 * A filter offering a category with nothing behind it is a filter that
 * answers "nothing matches" and teaches the reader the screen is broken --
 * the same rule `FilterChips` follows on every other list in this app.
 */
export function activityCategoriesPresent(rows: { action: string }[]): ActivityCategory[] {
  const present = new Set(rows.map((r) => activityCategory(r.action)));
  const ordered: ActivityCategory[] = [
    ...ADMIN_SECTIONS.map((s) => s.key as ActivityCategory),
    "full_only",
    "other",
  ];
  return ordered.filter((c) => present.has(c));
}

// --------------------------------------------------------------------------
// Searching
// --------------------------------------------------------------------------

export type SearchableEntry = {
  actorName: string;
  action: string;
  targetLabel: string | null;
};

/**
 * Whether one entry answers a typed query.
 *
 * It reads the **label** as well as the action key, because "refund" is what
 * somebody types and `refund.issue` is what the row stores -- and the
 * subject, because the commonest question this screen gets is about one
 * named patient rather than about a kind of action. Every term has to match
 * somewhere, so two words narrow rather than widen.
 */
export function matchesActivityQuery(entry: SearchableEntry, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [
    entry.actorName,
    entry.targetLabel ?? "",
    entry.action,
    ADMIN_ACTIVITY_LABELS[entry.action as keyof typeof ADMIN_ACTIVITY_LABELS] ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export type ActivityFilters = {
  query: string;
  actorName: string | "all";
  category: ActivityCategory | "all";
  moneyOnly: boolean;
  /** Inclusive yyyy-mm-dd bounds, compared against the entry's own date. */
  fromDate: string;
  toDate: string;
};

export const EMPTY_ACTIVITY_FILTERS: ActivityFilters = {
  query: "",
  actorName: "all",
  category: "all",
  moneyOnly: false,
  fromDate: "",
  toDate: "",
};

export function filterActivityRows<
  T extends SearchableEntry & { createdAt: string },
>(rows: T[], filters: ActivityFilters): T[] {
  return rows.filter((row) => {
    if (filters.actorName !== "all" && row.actorName !== filters.actorName) return false;
    if (filters.category !== "all" && activityCategory(row.action) !== filters.category) {
      return false;
    }
    if (filters.moneyOnly && !isMoneyAction(row.action)) return false;
    if (filters.fromDate || filters.toDate) {
      const key = row.createdAt.slice(0, 10);
      if (filters.fromDate && key < filters.fromDate) return false;
      if (filters.toDate && key > filters.toDate) return false;
    }
    return matchesActivityQuery(row, filters.query);
  });
}

// --------------------------------------------------------------------------
// Retention
// --------------------------------------------------------------------------

/**
 * The floor on how recent a cleared entry may be.
 *
 * This is the whole reason clearing is safe to offer at all. The log's value
 * is that an admin cannot make their own work disappear, and a clear with no
 * floor hands them exactly that -- act, then clear, then the record of both
 * is gone. Thirty days means the newest month of the trail, which is where
 * anything worth hiding would be, cannot be reached by this control at any
 * setting.
 *
 * It is enforced three times on purpose: here for the screen, again in
 * `/api/admin/clear-activity-log`, and again inside
 * `purge_admin_activity_log()` -- because a route check is true only for as
 * long as every caller remembers it, and that function is reachable by the
 * service-role key and by hand in the SQL editor.
 */
export const MIN_RETENTION_DAYS = 30;

/** What the screen offers. A free-form number field invites a typo in the
 *  one place a typo deletes history. */
export const RETENTION_CHOICES = [30, 90, 180, 365] as const;

/** Typed by hand before the clear runs, the same shape the data reset uses.
 *  A confirmation somebody can click through is not a confirmation. */
export const CLEAR_CONFIRM_PHRASE = "CLEAR LOGS";

export type RetentionRefusal = { reason: string };

export function refuseRetention(days: unknown, confirm: unknown): RetentionRefusal | null {
  if (typeof days !== "number" || !Number.isFinite(days) || !Number.isInteger(days)) {
    return { reason: "Choose how far back to clear." };
  }
  if (days < MIN_RETENTION_DAYS) {
    return {
      reason: `The last ${MIN_RETENTION_DAYS} days of the log cannot be cleared. Choose an older cutoff.`,
    };
  }
  if (typeof confirm !== "string" || confirm.trim() !== CLEAR_CONFIRM_PHRASE) {
    return { reason: `Type ${CLEAR_CONFIRM_PHRASE} to confirm.` };
  }
  return null;
}

/** The instant everything older than is removed. */
export function retentionCutoff(days: number, nowMs: number): Date {
  return new Date(nowMs - days * 24 * 60 * 60 * 1000);
}

/** How many of the entries on screen a given cutoff would take. Shown before
 *  the button is pressed: "clear old entries" with no number beside it asks
 *  somebody to approve an amount they were never told. */
export function countOlderThan(rows: { createdAt: string }[], cutoff: Date): number {
  const iso = cutoff.toISOString();
  return rows.filter((r) => r.createdAt < iso).length;
}
