// Home-visit programme progress and expiry, mirroring packageProgress.ts
// for the online packages. Kept as its own module rather than generalising
// that one: the two read different tables with different column names
// (visits_used vs sessions_used) and different event vocabularies, and a
// shared "count" helper parameterised over both would be harder to follow
// than two short files that each say exactly what they mean.

export type HomeVisitSavings = {
  perVisitPaise: number;
  compareAtPaise: number | null;
  savingsPaise: number | null;
  savingsPercent: number | null;
};

// Same shape and same null-not-zero rule as computePackageSavings: when
// there is nothing to compare against, callers should omit the
// strike-through entirely rather than render "Save ₹0".
export function computeHomeVisitSavings({
  visitCount,
  pricePaise,
  compareAtPaise,
}: {
  visitCount: number;
  pricePaise: number;
  compareAtPaise?: number | null;
}): HomeVisitSavings {
  const perVisitPaise = visitCount > 0 ? Math.round(pricePaise / visitCount) : pricePaise;

  if (typeof compareAtPaise !== "number" || compareAtPaise <= pricePaise) {
    return { perVisitPaise, compareAtPaise: null, savingsPaise: null, savingsPercent: null };
  }

  const savingsPaise = compareAtPaise - pricePaise;
  return {
    perVisitPaise,
    compareAtPaise,
    savingsPaise,
    savingsPercent: Math.round((savingsPaise / compareAtPaise) * 100),
  };
}

export type HomeVisitExpiryState = "no_expiry" | "active" | "expiring_soon" | "expired";

export function computeHomeVisitExpiryState(
  expiresAt: string | null,
  nowMs: number,
  reminderDays: number
): HomeVisitExpiryState {
  if (!expiresAt) return "no_expiry";
  const expiryMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiryMs)) return "no_expiry";
  if (expiryMs <= nowMs) return "expired";
  const daysLeft = (expiryMs - nowMs) / 86_400_000;
  return daysLeft <= reminderDays ? "expiring_soon" : "active";
}

// visits_used counts visits CLAIMED (scheduled or completed), never visits
// completed -- identical semantics to sessions_used on the online packages,
// spelled out again here because it is the single easiest thing to get
// wrong when reading these numbers. A scheduled visit has already consumed
// its slot in the programme; only a cancellation gives it back.
export type HomeVisitCounts = {
  total: number;
  completed: number;
  scheduled: number;
  pending: number;
};

export function computeHomeVisitCounts({
  visitCount,
  visitsUsed,
  completedCount,
  scheduledCount,
}: {
  visitCount: number;
  visitsUsed: number;
  completedCount: number;
  scheduledCount: number;
}): HomeVisitCounts {
  return {
    total: visitCount,
    completed: completedCount,
    scheduled: scheduledCount,
    pending: Math.max(visitCount - visitsUsed, 0),
  };
}

// Shared by the patient, therapist and admin programme views so a timeline
// entry reads identically wherever it appears.
export const HOME_VISIT_EVENT_LABELS: Record<string, string> = {
  purchased: "Purchased",
  visit_scheduled: "Visit scheduled",
  visit_cancelled: "Visit cancelled",
  visit_completed: "Visit completed",
  visit_restored: "Visit restored",
  therapist_locked: "Therapist locked",
  therapist_reassigned: "Programme reassigned",
  address_changed: "Address updated",
  cash_collected: "Cash collected",
  cash_remitted: "Cash remitted",
  expiry_extended: "Expiry extended",
  refunded: "Refunded",
  expired: "Expired",
};
