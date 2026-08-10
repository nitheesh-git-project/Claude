// Dependency-free package math -- pricing/savings and expiry state -- kept
// separate from rendering so it can be reasoned about (and reused by the
// admin catalog form's live preview, the public package card, and the
// Purchases table) the same way pricing.ts/therapistEarnings.ts are, per
// AGENTS.md's "business math lives in dependency-free src/lib/ modules"
// convention.

// A package's advertised "was ₹X" price and the saving derived from it.
// compareAtPaise is nullable on the catalog row -- when the admin leaves it
// blank, the strike-through is computed from the category's real
// per-session price instead, so the saving can never contradict what the
// category actually charges. Returns null savings (not zero) when there is
// nothing to compare against, so callers can omit the strike-through
// entirely rather than render "Save ₹0".
export type PackageSavings = {
  perSessionPaise: number;
  compareAtPaise: number | null;
  savingsPaise: number | null;
  savingsPercent: number | null;
};

export function computePackageSavings({
  sessionCount,
  pricePaise,
  compareAtPaise,
  categoryPricePaise,
}: {
  sessionCount: number;
  pricePaise: number;
  compareAtPaise?: number | null;
  categoryPricePaise?: number | null;
}): PackageSavings {
  const perSessionPaise = sessionCount > 0 ? Math.round(pricePaise / sessionCount) : pricePaise;

  const effectiveCompareAt =
    typeof compareAtPaise === "number"
      ? compareAtPaise
      : typeof categoryPricePaise === "number"
        ? categoryPricePaise * sessionCount
        : null;

  if (effectiveCompareAt === null || effectiveCompareAt <= pricePaise) {
    return { perSessionPaise, compareAtPaise: null, savingsPaise: null, savingsPercent: null };
  }

  const savingsPaise = effectiveCompareAt - pricePaise;
  return {
    perSessionPaise,
    compareAtPaise: effectiveCompareAt,
    savingsPaise,
    savingsPercent: Math.round((savingsPaise / effectiveCompareAt) * 100),
  };
}

// Purchase lifecycle relative to its own expiry -- distinct from the
// stored `status` column (which also covers 'refunded'/'cancelled', set
// only by explicit admin action). This is purely a time comparison, used
// to decide whether new scheduling should be allowed and whether the
// "expiring soon" admin filter / patient reminder should fire. reminderDays
// is site_settings.package_expiry_reminder_days (parseAdminSettings()).
export type PackageExpiryState = "no_expiry" | "active" | "expiring_soon" | "expired";

export function computePackageExpiryState(
  expiresAt: string | null,
  nowMs: number,
  reminderDays: number
): PackageExpiryState {
  if (!expiresAt) return "no_expiry";
  const expiryMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiryMs)) return "no_expiry";
  if (expiryMs <= nowMs) return "expired";
  const daysLeft = (expiryMs - nowMs) / 86_400_000;
  return daysLeft <= reminderDays ? "expiring_soon" : "active";
}

// Whole days remaining until expiry, floored (never negative) -- what the
// patient widget's countdown and the admin "expiring in N days" filter
// both render. Returns null when there's no expiry to count down to.
export function daysUntilExpiry(expiresAt: string | null, nowMs: number): number | null {
  if (!expiresAt) return null;
  const expiryMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiryMs)) return null;
  return Math.max(0, Math.floor((expiryMs - nowMs) / 86_400_000));
}

// The three counts every package surface renders, reconciled against the
// total by construction so "completed + scheduled + pending = total" can
// never drift -- see the counter-semantics comment in schema.sql next to
// patient_package_purchases for what each of these actually counts.
// completedCount/scheduledCount normally come straight off
// package_purchase_summary; this just derives the one the view doesn't
// store (pending) using the same formula the view uses, so a caller who
// only has the raw purchase row (not the view) can still compute it
// consistently.
export type PackageCounts = {
  total: number;
  completed: number;
  scheduled: number;
  pending: number;
};

// Shared between the admin, patient, and therapist package detail modals
// so a timeline event reads identically everywhere it's shown.
export const PACKAGE_EVENT_LABELS: Record<string, string> = {
  purchased: "Purchased",
  session_scheduled: "Session scheduled",
  session_cancelled: "Session cancelled",
  session_completed: "Session completed",
  session_restored: "Session restored",
  therapist_locked: "Therapist locked",
  therapist_reassigned: "Programme reassigned",
  expiry_extended: "Expiry extended",
  refunded: "Refunded",
  expired: "Expired",
};

export function computePackageCounts({
  sessionCount,
  sessionsUsed,
  completedCount,
  scheduledCount,
}: {
  sessionCount: number;
  sessionsUsed: number;
  completedCount: number;
  scheduledCount: number;
}): PackageCounts {
  return {
    total: sessionCount,
    completed: completedCount,
    scheduled: scheduledCount,
    pending: Math.max(sessionCount - sessionsUsed, 0),
  };
}
