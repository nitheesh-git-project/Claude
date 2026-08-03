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
};

export type Person = { id: string; full_name: string | null };

export type PeriodBucket = { label: string; startMs: number; endMs: number };

export function filterByDimension(
  appointments: MetricsAppointment[],
  categoryFilter: string,
  therapistFilter: string
): MetricsAppointment[] {
  return appointments.filter(
    (a) =>
      (categoryFilter === "all" || a.category_id === categoryFilter) &&
      (therapistFilter === "all" || a.therapist_id === therapistFilter)
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
  if (spanDays > 45) {
    const cursor = new Date(fromMs);
    cursor.setDate(1);
    cursor.setHours(0, 0, 0, 0);
    while (cursor.getTime() <= toMs) {
      const start = cursor.getTime();
      const next = new Date(cursor);
      next.setMonth(next.getMonth() + 1);
      buckets.push({
        label: cursor.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
        startMs: start,
        endMs: next.getTime(),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    let start = fromMs;
    while (start <= toMs) {
      const end = start + 7 * 86_400_000;
      buckets.push({
        label: new Date(start).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
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

export function revenueByBucketFor(
  dimFiltered: MetricsAppointment[],
  fromMs: number,
  toMs: number,
  buckets: PeriodBucket[]
): number[] {
  return sumByBucket(
    dimFiltered.filter((a) => a.payment_status === "paid"),
    (a) => {
      const ms = new Date(a.paid_at ?? a.created_at).getTime();
      return ms >= fromMs && ms < toMs ? ms : null;
    },
    (a) => (a.amount_paid_paise ?? SESSION_FEE_PAISE) / 100,
    buckets
  );
}

export function bookingsByBucketFor(
  dimFiltered: MetricsAppointment[],
  fromMs: number,
  toMs: number,
  buckets: PeriodBucket[]
): number[] {
  return sumByBucket(
    dimFiltered,
    (a) => {
      const ms = new Date(a.created_at).getTime();
      return ms >= fromMs && ms < toMs ? ms : null;
    },
    () => 1,
    buckets
  );
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
