// Pure aggregation functions for the admin Metrics tab — kept separate from
// AdminMetricsTab.tsx so the actual math can be unit-tested without needing
// to render the component.

import { SESSION_FEE_PAISE } from "@/lib/pricing";

export type MetricsAppointment = {
  id: string;
  status: string;
  payment_status: string;
  amount_paid_paise: number | null;
  category_id: string | null;
  therapist_id: string | null;
  patient_id: string;
  created_at: string;
  paid_at: string | null;
  slot_time: string | null;
  no_show: boolean;
  refund_status: string | null;
  // Only populated once refund_status is 'processed' -- see
  // refundedPaiseByBucketFor, which is the only reader of this field.
  refund_amount_paise: number | null;
  // Added for the Financial Summary / Therapist & Patient Ledger section --
  // widened rather than given its own narrower type, since this is always
  // the exact same `appointments` array page.tsx already passes to
  // AdminPayoutsTab/AdminPaymentHistoryTab in full; this just lets
  // AdminMetricsTab reuse computeTherapistPayoutSummary directly instead of
  // re-deriving the same math.
  concern: string | null;
  razorpay_payment_id: string | null;
  therapist_payout_paid_at: string | null;
  therapist_payout_amount_paise: number | null;
  therapist_payout_method: string | null;
  therapist_payout_note: string | null;
  patient_rating: number | null;
  patient_feedback: string | null;
  therapist_rating: number | null;
  therapist_feedback: string | null;
  // Home-visit columns. Optional so a caller that hasn't joined them in is
  // still type-valid, but the Money screens must pass them: without
  // travel_fee_paise the therapist's cut comes out short and the clinic's
  // share correspondingly overstated, on every home visit.
  visit_mode?: string | null;
  travel_fee_paise?: number | null;
  // Cash a therapist took at the door and has not handed in. Needed so the
  // "owed to therapists" balance shown here is the same net-of-cash figure
  // the Payouts screen and the Pay button use.
  cash_collected_at?: string | null;
  cash_collected_amount_paise?: number | null;
  cash_remitted_at?: string | null;
  /** 'cash' for a cash-on-visit home visit. Read only by the gateway-fee
   *  cost line, which must not charge a processor fee on money that never
   *  went through a processor. */
  payment_method?: string | null;
};

export type Person = { id: string; full_name: string | null };

// Deliberately narrow -- just what packageRevenueInRange needs, not the
// full package_purchase_summary shape AdminSessionManagerTab reads.
export type MetricsPackagePurchase = {
  category_id: string;
  payment_status: string;
  amount_paid_paise: number | null;
  paid_at: string | null;
};

export type PeriodBucket = { label: string; startMs: number; endMs: number };

export function filterByDimension(
  appointments: MetricsAppointment[],
  categoryFilter: string,
  therapistFilter: string,
  patientFilter: string
): MetricsAppointment[] {
  return appointments.filter(
    (a) =>
      (categoryFilter === "all" || a.category_id === categoryFilter) &&
      (therapistFilter === "all" || a.therapist_id === therapistFilter) &&
      (patientFilter === "all" || a.patient_id === patientFilter)
  );
}

export function filterBySlotRange(
  appointments: MetricsAppointment[],
  fromMs: number,
  toMs: number
): MetricsAppointment[] {
  return appointments.filter((a) => {
    if (!a.slot_time) return false;
    const ms = new Date(a.slot_time).getTime();
    return ms >= fromMs && ms < toMs;
  });
}

// Weekly buckets for a short range, monthly for a longer one — matches how
// someone actually reads a trend at each zoom level (a year of weekly bars
// is unreadable, a month of monthly bars is meaningless).
export function buildBuckets(fromMs: number, toMs: number): PeriodBucket[] {
  const spanDays = (toMs - fromMs) / 86_400_000;
  const buckets: PeriodBucket[] = [];
  // Bucket boundaries and their display labels are both pinned to UTC.
  // fromMs/toMs are already UTC-anchored by the caller; Date's local-time
  // methods (setHours, setMonth, toLocaleDateString without a timeZone)
  // would otherwise snap to whatever timezone is reading them, which
  // differs between server (SSR) and the admin's browser (hydration) and
  // can shift a bucket's calendar date depending on which one rendered.
  if (spanDays > 45) {
    const cursor = new Date(fromMs);
    cursor.setUTCDate(1);
    cursor.setUTCHours(0, 0, 0, 0);
    while (cursor.getTime() <= toMs) {
      const start = cursor.getTime();
      const next = new Date(cursor);
      next.setUTCMonth(next.getUTCMonth() + 1);
      buckets.push({
        label: cursor.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" }),
        startMs: start,
        endMs: next.getTime(),
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  } else {
    let start = fromMs;
    while (start <= toMs) {
      const end = start + 7 * 86_400_000;
      buckets.push({
        label: new Date(start).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }),
        startMs: start,
        endMs: end,
      });
      start = end;
    }
  }
  return buckets;
}

export function sumByBucket<T>(
  items: T[],
  getMs: (item: T) => number | null,
  getValue: (item: T) => number,
  buckets: PeriodBucket[]
): number[] {
  const sums = buckets.map(() => 0);
  for (const item of items) {
    const ms = getMs(item);
    if (ms === null) continue;
    const idx = buckets.findIndex((b) => ms >= b.startMs && ms < b.endMs);
    if (idx >= 0) sums[idx] += getValue(item);
  }
  return sums;
}

// Cash collected on package purchases in [fromMs, toMs), bucketed by
// paid_at -- deliberately a *separate* figure from revenueByBucketFor
// above, not folded into it. revenueByBucketFor already counts a package
// session's own amount_paid_paise (the bundle price divided across its
// sessions) as that session gets scheduled/paid, which is accrual-correct
// but means the full bundle price only shows up gradually, one session at
// a time, as the patient actually uses the package -- see
// AdminSessionManagerTab's "Sessions Banked" stat for the mirror image of
// this (unscheduled sessions' still-unrecognized value). This function is
// the cash view: what was actually collected up front, regardless of how
// much of it has been recognized as session revenue yet. Showing both
// side by side is the point -- collected minus recognized is real,
// interest-bearing float the business is sitting on.
export function packageRevenueInRange(
  purchases: MetricsPackagePurchase[],
  categoryFilter: string,
  fromMs: number,
  toMs: number
): number {
  let total = 0;
  for (const p of purchases) {
    if (p.payment_status !== "paid" || !p.paid_at) continue;
    if (categoryFilter !== "all" && p.category_id !== categoryFilter) continue;
    const ms = new Date(p.paid_at).getTime();
    if (ms >= fromMs && ms < toMs) total += p.amount_paid_paise ?? 0;
  }
  return total;
}

// Bucketed by slot_time, like the money figures above, so a From/To range
// means the same thing everywhere on the screen: "sessions scheduled in this
// window", never "booked in this window" for one chart and "paid in this
// window" for another.
export function bookingsByBucketFor(
  dimFiltered: MetricsAppointment[],
  buckets: PeriodBucket[]
): number[] {
  return sumByBucket(
    dimFiltered,
    (a) => (a.slot_time ? new Date(a.slot_time).getTime() : null),
    () => 1,
    buckets
  );
}

export type MoneyByBucket = {
  /** Every paid session in the bucket, before refunds. */
  grossRevenuePaise: number[];
  /** Refunds that actually processed. */
  refundedPaise: number[];
  /** grossRevenuePaise - refundedPaise. */
  netRevenuePaise: number[];
  /** The part of netRevenuePaise whose split is knowable -- the base the
   *  three figures below divide up. Always <= netRevenuePaise. */
  splittableNetPaise: number[];
  therapistCutPaise: number[];
  hospitalCutPaise: number[];
  /** splittableNetPaise - therapistCutPaise - hospitalCutPaise. */
  clinicSharePaise: number[];
  excludedCount: number;
  excludedRevenuePaise: number;
};

/**
 * The clinic's revenue split, per bucket, in paise.
 *
 * Every figure the Money summary shows comes out of this one pass, so the
 * tiles, the strip and the breakdown chart cannot disagree with each other.
 * The identity that must always hold:
 *
 *     net = gross - refunds
 *     clinic share = net - therapist cut - hospital cut
 *
 * Three rules decide who gets what, and each one is a correction of an
 * earlier version that got a real number wrong:
 *
 * 1. **A therapist's cut is earned by delivering, not by being booked.**
 *    Only a *completed* paid session adds to the therapist cut -- the same
 *    rule computeTherapistPayoutSummary and the settle route already
 *    enforce. Counting every paid session (as this used to) deducted a cut
 *    for sessions the therapist will never be paid for, which understated
 *    the clinic's share on every forfeited late cancellation.
 * 2. **A home visit's travel fee is part of the therapist's cut.** It is a
 *    reimbursement paid through in full and never revenue (see
 *    homeVisitPricing.ts), so it is deducted here without ever being added
 *    to gross. Omitting it -- as this used to, because the Money screens
 *    passed appointments without the home-visit columns joined in --
 *    overstated the clinic's share by the whole travel bill.
 * 3. **Refunds reverse the hospital's commission, not the therapist's.**
 *    A refunded session was cancelled, so it never counted toward the
 *    therapist cut in the first place; the hospital's share is a commission
 *    on money kept, so it is taken on *net* revenue. That makes the clinic
 *    share exact. The old version subtracted the whole refund from a margin
 *    figure that had already had a cut deducted, and had to be labelled an
 *    approximation on screen.
 *
 * Revenue and the split have different eligibility, which is the fourth
 * correction and the one that removes a long-standing collision between two
 * figures both called "revenue" on the same screen. Gross, refunds and net
 * count **every** paid session: money is money whether or not anyone has
 * configured how to divide it. Only the *split* skips a session whose
 * division cannot be known -- the therapist has no revenue share set, or the
 * patient came from a hospital whose share is not configured. Those are
 * counted in excludedCount/excludedRevenuePaise and their value is left out
 * of splittableNetPaise, so the clinic share is a true figure over a stated
 * subset rather than a guess over everything.
 */
export function moneyByBucketFor(
  dimFiltered: MetricsAppointment[],
  buckets: PeriodBucket[],
  therapistSharePercent: Record<string, number>,
  patientHospitalSharePercent: Record<string, number>,
  // patientId -> true for every patient referred by a hospital, regardless
  // of whether that hospital's revenue_share_percent is actually set. Needed
  // to tell apart the two reasons patientHospitalSharePercent[patient_id]
  // can come back undefined: "not hospital-referred at all" (0% hospital
  // cut is correct) vs. "hospital-referred but the hospital's share isn't
  // configured yet" (unknowable, must be excluded like the therapist-share
  // case below -- see this function's own comment on the "don't guess" rule).
  hospitalReferredPatientIds: Record<string, true>,
  // therapistId -> home_visit_revenue_share_percent, for therapists who
  // have a separate rate for visits. Falls back to the online share when a
  // therapist has none, the same rule the payout math uses.
  therapistHomeVisitSharePercent: Record<string, number> = {}
): MoneyByBucket {
  const grossRevenuePaise = buckets.map(() => 0);
  const refundedPaise = buckets.map(() => 0);
  const splittableNetPaise = buckets.map(() => 0);
  const therapistCutPaise = buckets.map(() => 0);
  const hospitalCutPaise = buckets.map(() => 0);
  let excludedCount = 0;
  let excludedRevenuePaise = 0;

  for (const a of dimFiltered) {
    const line = moneyLineFor(a, {
      therapistSharePercent,
      patientHospitalSharePercent,
      hospitalReferredPatientIds,
      therapistHomeVisitSharePercent,
    });
    if (!line) continue;
    const idx = buckets.findIndex((b) => line.slotMs >= b.startMs && line.slotMs < b.endMs);
    if (idx < 0) continue;

    // Revenue first, unconditionally -- it does not depend on anyone having
    // configured a split.
    grossRevenuePaise[idx] += line.paidPaise;
    refundedPaise[idx] += line.refundPaise;

    if (line.excluded) {
      excludedCount += 1;
      excludedRevenuePaise += line.paidPaise;
      continue;
    }

    splittableNetPaise[idx] += line.netPaise;
    therapistCutPaise[idx] += line.therapistCutPaise;
    hospitalCutPaise[idx] += line.hospitalCutPaise;
  }

  const netRevenuePaise = buckets.map((_, i) => grossRevenuePaise[i] - refundedPaise[i]);
  const clinicSharePaise = buckets.map(
    (_, i) => splittableNetPaise[i] - therapistCutPaise[i] - hospitalCutPaise[i]
  );

  return {
    grossRevenuePaise,
    refundedPaise,
    netRevenuePaise,
    splittableNetPaise,
    therapistCutPaise,
    hospitalCutPaise,
    clinicSharePaise,
    excludedCount,
    excludedRevenuePaise,
  };
}

export type MoneyRates = {
  therapistSharePercent: Record<string, number>;
  patientHospitalSharePercent: Record<string, number>;
  hospitalReferredPatientIds: Record<string, true>;
  therapistHomeVisitSharePercent?: Record<string, number>;
};

/** One session's contribution to every figure on the Money screens. */
export type MoneyLine = {
  appointmentId: string;
  patientId: string;
  therapistId: string | null;
  slotMs: number;
  slotTime: string;
  visitMode: string | null;
  status: string | null;
  paidPaise: number;
  refundPaise: number;
  netPaise: number;
  therapistCutPaise: number;
  hospitalCutPaise: number;
  clinicSharePaise: number;
  /** Counted in revenue but left out of the three shares, because the split
   *  cannot be known. Its cut figures are all zero. */
  excluded: boolean;
};

/**
 * What one session contributed, or null when it contributed nothing (unpaid,
 * or with no slot to date it by).
 *
 * Extracted from moneyByBucketFor rather than written beside it, and then
 * called *by* it, so "what is this figure made of" is answered by the same
 * arithmetic that produced the figure. A second implementation of the split
 * would be a second answer, and the one place a drill-down must never
 * disagree with its own total is the books.
 */
export function moneyLineFor(
  a: MetricsAppointment,
  rates: MoneyRates
): MoneyLine | null {
  if (a.payment_status !== "paid" || !a.slot_time) return null;

  const paidPaise = a.amount_paid_paise ?? SESSION_FEE_PAISE;
  const refundPaise =
    a.refund_status === "processed" ? Math.max(0, a.refund_amount_paise ?? 0) : 0;
  const netPaise = Math.max(0, paidPaise - refundPaise);

  const base = {
    appointmentId: a.id,
    patientId: a.patient_id,
    therapistId: a.therapist_id ?? null,
    slotMs: new Date(a.slot_time).getTime(),
    slotTime: a.slot_time,
    visitMode: a.visit_mode ?? null,
    status: a.status ?? null,
    paidPaise,
    refundPaise,
    netPaise,
  };

  const onlineShare = a.therapist_id
    ? rates.therapistSharePercent[a.therapist_id]
    : undefined;
  const hShare = rates.patientHospitalSharePercent[a.patient_id];
  const hospitalShareUnknown =
    hShare === undefined && !!rates.hospitalReferredPatientIds[a.patient_id];
  if (onlineShare === undefined || hospitalShareUnknown) {
    return {
      ...base,
      therapistCutPaise: 0,
      hospitalCutPaise: 0,
      clinicSharePaise: 0,
      excluded: true,
    };
  }

  let therapistCutPaise = 0;
  if (a.status === "completed") {
    const isHomeVisit = a.visit_mode === "home_visit";
    const homeShare = a.therapist_id
      ? (rates.therapistHomeVisitSharePercent ?? {})[a.therapist_id]
      : undefined;
    const effectiveShare = isHomeVisit ? homeShare ?? onlineShare : onlineShare;
    const travelPaise = isHomeVisit ? Math.max(0, a.travel_fee_paise ?? 0) : 0;
    therapistCutPaise = Math.round((paidPaise * effectiveShare) / 100) + travelPaise;
  }

  const hospitalCutPaise =
    hShare !== undefined ? Math.round((netPaise * hShare) / 100) : 0;

  return {
    ...base,
    therapistCutPaise,
    hospitalCutPaise,
    clinicSharePaise: netPaise - therapistCutPaise - hospitalCutPaise,
    excluded: false,
  };
}

/**
 * Every session behind the Money summary's figures, newest first.
 *
 * This is what the drill-down on each figure lists: a number an admin cannot
 * check is a number they cannot trust, and Money is the one section where
 * that matters most. Sessions outside the buckets are dropped here exactly as
 * they are in the totals, so a modal's footer and the card that opened it are
 * arithmetically the same sum.
 */
export function explainMoneyLines(
  dimFiltered: MetricsAppointment[],
  buckets: PeriodBucket[],
  rates: MoneyRates
): MoneyLine[] {
  if (buckets.length === 0) return [];
  const fromMs = buckets[0].startMs;
  const toMs = buckets[buckets.length - 1].endMs;
  return dimFiltered
    .map((a) => moneyLineFor(a, rates))
    .filter((line): line is MoneyLine => !!line)
    .filter((line) => line.slotMs >= fromMs && line.slotMs < toMs)
    .sort((a, b) => b.slotMs - a.slotMs);
}

// Narrowed to exactly the fields these two read (rather than the full
// MetricsAppointment) so the admin Therapist/Patient detail pages -- whose
// own `appointments` queries don't select every Metrics-tab-only column --
// can reuse the same rate math without widening their query just to satisfy
// this type. Any MetricsAppointment still satisfies these Picks, so this is
// a pure narrowing, not a breaking change for the Metrics tab's own callers.
type NoShowInput = Pick<MetricsAppointment, "no_show">;
type CancellationInput = Pick<MetricsAppointment, "status" | "refund_status">;

export function computeNoShowRate(completedInRange: NoShowInput[]): {
  rate: number | null;
  noShowCount: number;
  completedCount: number;
} {
  const noShowCount = completedInRange.filter((a) => a.no_show).length;
  const completedCount = completedInRange.length;
  return {
    rate: completedCount > 0 ? (noShowCount / completedCount) * 100 : null,
    noShowCount,
    completedCount,
  };
}

export function computeCancellationRate(inRangeBySlot: CancellationInput[]): {
  rate: number | null;
  cancelledCount: number;
  refundedCount: number;
  forfeitedCount: number;
} {
  // Denominator is resolved sessions only (completed or cancelled) — a
  // still-upcoming requested/confirmed session hasn't had the chance to be
  // cancelled yet, so counting it as "not cancelled" would understate the
  // rate. This also means picking a "To" date in the future can't silently
  // dilute the number with bookings that haven't happened yet.
  const resolved = inRangeBySlot.filter((a) => a.status === "completed" || a.status === "cancelled");
  const cancelled = resolved.filter((a) => a.status === "cancelled");
  return {
    rate: resolved.length > 0 ? (cancelled.length / resolved.length) * 100 : null,
    cancelledCount: cancelled.length,
    refundedCount: cancelled.filter((a) => a.refund_status === "processed").length,
    forfeitedCount: cancelled.filter((a) => a.refund_status === "not_eligible").length,
  };
}

// All-time by design (no date range applied here) — "repeat" is a lifetime
// concept, not a period one. Only the category/therapist dimension filters
// (already applied to dimFiltered before this is called) narrow it.
export function computeRepeatBookingRate(dimFiltered: MetricsAppointment[]): number | null {
  const completedByPatient = new Map<string, number>();
  for (const a of dimFiltered) {
    if (a.status !== "completed") continue;
    completedByPatient.set(a.patient_id, (completedByPatient.get(a.patient_id) ?? 0) + 1);
  }
  const patientsWithOne = completedByPatient.size;
  if (patientsWithOne === 0) return null;
  const repeatPatients = [...completedByPatient.values()].filter((c) => c > 1).length;
  return (repeatPatients / patientsWithOne) * 100;
}

export function computeTherapistUtilization(
  completedInRange: MetricsAppointment[],
  therapists: Person[]
): { id: string; name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const a of completedInRange) {
    if (!a.therapist_id) continue;
    counts.set(a.therapist_id, (counts.get(a.therapist_id) ?? 0) + 1);
  }
  const nameOf = new Map(therapists.map((t) => [t.id, t.full_name ?? "Unknown"]));
  return [...counts.entries()]
    .map(([id, count]) => ({ id, name: nameOf.get(id) ?? "Unknown", count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * The same length of time immediately before the range in view.
 *
 * A figure with nothing to compare it to is a number an owner cannot judge:
 * "₹43,200 in September" is only good or bad next to August. Working the
 * previous window out here rather than in the screen keeps it honest about
 * length -- comparing a 30-day range against a calendar month would move the
 * figure by the number of days rather than by the business.
 */
export function previousRange(fromMs: number, toMs: number): { fromMs: number; toMs: number } {
  const span = Math.max(0, toMs - fromMs);
  return { fromMs: fromMs - span, toMs: fromMs };
}

export type PeriodChange = {
  /** Percent change, or null when the previous period had nothing to compare
   *  against -- a rise from zero is not a percentage, and printing one
   *  ("+100%", "∞") is worse than saying there is no comparison. */
  percent: number | null;
  direction: "up" | "down" | "flat";
  /** What to print: "12% more than the 30 days before", or the honest
   *  fallback when there is no basis for a percentage. */
  label: string;
};

export function comparePeriod(
  currentPaise: number,
  previousPaise: number,
  periodNoun: string
): PeriodChange {
  if (previousPaise === 0) {
    return {
      percent: null,
      direction: currentPaise > 0 ? "up" : "flat",
      label: currentPaise > 0 ? `Nothing in the ${periodNoun} before` : `Same as the ${periodNoun} before`,
    };
  }

  const percent = ((currentPaise - previousPaise) / Math.abs(previousPaise)) * 100;
  // Under half a percent either way is noise, and an arrow over noise is a
  // signal an owner learns to ignore.
  if (Math.abs(percent) < 0.5) {
    return { percent, direction: "flat", label: `Level with the ${periodNoun} before` };
  }
  const rounded = Math.abs(percent) >= 10 ? Math.round(Math.abs(percent)) : Number(Math.abs(percent).toFixed(1));
  return {
    percent,
    direction: percent > 0 ? "up" : "down",
    label: `${rounded}% ${percent > 0 ? "more" : "less"} than the ${periodNoun} before`,
  };
}
