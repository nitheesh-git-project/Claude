// The two cards at the top of a patient's Home: "Same again?" (rebook the
// care they last had, with the physiotherapist they had it with) and the
// programme they are part-way through. Dependency-free so the choices are
// testable without rendering.
//
// Both are shortcuts into flows that already exist -- nothing here books
// anything. "Same again?" opens the booking wizard with the service picked and
// the physiotherapist *requested* (`?category=` / `?therapist=`, which the
// wizard already reads; the clinic still assigns, because only it can see who
// is free). The programme card opens My programme, where sessions that are
// already paid for are scheduled.

import { computePackageCounts } from "./packageProgress";

export type HomeAppointment = {
  id: string;
  slot_time: string | null;
  timezone?: string | null;
  status: string;
  category_id: string | null;
  therapist_id: string | null;
  package_purchase_id: string | null;
  no_show?: boolean | null;
  payment_status?: string | null;
};

export type SameAgain = {
  categoryId: string;
  title: string;
  therapistId: string | null;
  therapistName: string | null;
  /** The session this suggestion is built from. */
  lastSlotTime: string;
  lastTimezone: string | null;
  href: string;
};

/**
 * The care this patient last had, if it can still be booked.
 *
 * Only single sessions count: a programme's sessions are scheduled from My
 * programme, against credits already paid for, so offering to sell one again
 * here would charge for something they own. A no-show is not "care they had".
 * A service the clinic has switched off cannot be rebooked, so a patient whose
 * last session was for one sees no card rather than a link to a dead option.
 * Delivered sessions win over upcoming ones; among equals, the latest.
 */
export function pickSameAgain(
  appointments: HomeAppointment[],
  activeCategories: Map<string, string>,
  therapistNames: Map<string, string>
): SameAgain | null {
  const rank = (a: HomeAppointment) =>
    a.status === "completed" ? 2 : a.status === "confirmed" || a.payment_status === "paid" ? 1 : 0;
  const candidates = appointments.filter(
    (a) =>
      !a.package_purchase_id &&
      !a.no_show &&
      a.status !== "cancelled" &&
      !!a.slot_time &&
      !!a.category_id &&
      activeCategories.has(a.category_id) &&
      rank(a) > 0
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => rank(b) - rank(a) || (b.slot_time ?? "").localeCompare(a.slot_time ?? ""));
  const pick = candidates[0];
  const categoryId = pick.category_id as string;
  const therapistName = pick.therapist_id ? therapistNames.get(pick.therapist_id) ?? null : null;
  // Only request a physiotherapist we can name: an id with no public name
  // behind it would resolve to nothing in the wizard anyway.
  const therapistId = therapistName ? pick.therapist_id : null;
  const params = new URLSearchParams({ from: "dashboard", category: categoryId });
  if (therapistId) params.set("therapist", therapistId);
  return {
    categoryId,
    title: activeCategories.get(categoryId) as string,
    therapistId,
    therapistName,
    lastSlotTime: pick.slot_time as string,
    lastTimezone: pick.timezone ?? null,
    href: `/book?${params.toString()}`,
  };
}

export type HomeProgrammePurchase = {
  id: string;
  package_id: string | null;
  category_id: string | null;
  status: string;
  session_count: number;
  sessions_used: number;
  locked_therapist_id: string | null;
};

export type HomeProgramme = {
  purchaseId: string;
  title: string;
  total: number;
  completed: number;
  scheduled: number;
  /** Paid for and not yet booked. */
  toBook: number;
  therapistName: string | null;
};

/**
 * The programme to show on Home: the active one with the most sessions still
 * to book, so the card points at the thing that is waiting. A programme with
 * nothing left to book still shows (its progress is the news) if it is the
 * only active one; with none active there is no card.
 */
export function pickHomeProgramme(
  purchases: HomeProgrammePurchase[],
  completedByPurchase: Map<string, number>,
  scheduledByPurchase: Map<string, number>,
  titleFor: (p: HomeProgrammePurchase) => string,
  therapistNames: Map<string, string>
): HomeProgramme | null {
  const active = purchases.filter((p) => p.status === "active" && p.session_count > 0);
  if (active.length === 0) return null;
  const rows = active.map((p) => {
    const c = computePackageCounts({
      sessionCount: p.session_count,
      sessionsUsed: p.sessions_used,
      completedCount: completedByPurchase.get(p.id) ?? 0,
      scheduledCount: scheduledByPurchase.get(p.id) ?? 0,
    });
    return {
      purchaseId: p.id,
      title: titleFor(p),
      total: c.total,
      completed: Math.min(c.completed, c.total),
      scheduled: c.scheduled,
      toBook: c.pending,
      therapistName: p.locked_therapist_id ? therapistNames.get(p.locked_therapist_id) ?? null : null,
    };
  });
  rows.sort((a, b) => b.toBook - a.toBook);
  return rows[0];
}
