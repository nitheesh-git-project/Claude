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
};

export type Person = { id: string; full_name: string | null };

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

// Both bucketed by the session's own slot_time -- previously revenue was
// bucketed by paid_at and bookings by created_at, two axes that disagree
// with each other AND with the slot_time-based range everything else in
// this tab (no-show rate, cancellation rate, therapist utilization) already
// uses. Picking a From/To range should mean the same thing everywhere on
// this tab: "sessions scheduled in this window" -- not "paid in this
// window" for one chart and "booked in this window" for another. No
// fromMs/toMs params needed here anymore either: `buckets` already spans
// exactly [fromMs, toMs), so an item outside that range simply lands in no
// bucket and sumByBucket drops it, without a separate range check.
export function revenueByBucketFor(
  dimFiltered: MetricsAppointment[],
  buckets: PeriodBucket[]
): number[] {
  return sumByBucket(
    dimFiltered.filter((a) => a.payment_status === "paid"),
    (a) => (a.slot_time ? new Date(a.slot_time).getTime() : null),
    (a) => (a.amount_paid_paise ?? SESSION_FEE_PAISE) / 100,
    buckets
  );
}

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
  revenuePaise: number[];
  therapistCutPaise: number[];
  hospitalCutPaise: number[];
  profitPaise: number[];
  excludedCount: number;
  excludedRevenuePaise: number;
};

// Same "only where the split is actually knowable" rule as
// PatientProfitChart's per-patient breakdown: a paid session only enters
// revenue/cuts/profit here if its therapist has a revenue-share % set --
// otherwise there's no way to know the real split, and guessing would
// misstate profit rather than just omit a number. Sessions skipped this way
// are counted (and their revenue totalled) separately in
// excludedCount/excludedRevenuePaise so it's a visible caveat, not a silent
// gap -- this is why this section's own "Revenue" total can come in lower
// than the "Revenue (range)" stat card above, which counts all paid revenue
// regardless of whether a payout split is knowable.
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
  hospitalReferredPatientIds: Record<string, true>
): MoneyByBucket {
  const revenuePaise = buckets.map(() => 0);
  const therapistCutPaise = buckets.map(() => 0);
  const hospitalCutPaise = buckets.map(() => 0);
  let excludedCount = 0;
  let excludedRevenuePaise = 0;

  for (const a of dimFiltered) {
    if (a.payment_status !== "paid" || !a.slot_time) continue;
    const ms = new Date(a.slot_time).getTime();
    const idx = buckets.findIndex((b) => ms >= b.startMs && ms < b.endMs);
    if (idx < 0) continue;

    const paidPaise = a.amount_paid_paise ?? SESSION_FEE_PAISE;
    const tShare = a.therapist_id ? therapistSharePercent[a.therapist_id] : undefined;
    if (tShare === undefined) {
      excludedCount += 1;
      excludedRevenuePaise += paidPaise;
      continue;
    }
    const hShare = patientHospitalSharePercent[a.patient_id];
    if (hShare === undefined && hospitalReferredPatientIds[a.patient_id]) {
      excludedCount += 1;
      excludedRevenuePaise += paidPaise;
      continue;
    }

    revenuePaise[idx] += paidPaise;
    therapistCutPaise[idx] += Math.round((paidPaise * tShare) / 100);
    if (hShare !== undefined) {
      hospitalCutPaise[idx] += Math.round((paidPaise * hShare) / 100);
    }
  }

  const profitPaise = buckets.map(
    (_, i) => revenuePaise[i] - therapistCutPaise[i] - hospitalCutPaise[i]
  );

  return { revenuePaise, therapistCutPaise, hospitalCutPaise, profitPaise, excludedCount, excludedRevenuePaise };
}

export function computeNoShowRate(completedInRange: MetricsAppointment[]): {
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

export function computeCancellationRate(inRangeBySlot: MetricsAppointment[]): {
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
