// The numbers and sentences behind each dashboard tab's summary card
// (TabSummary). Dependency-free apart from the existing rules they reuse, so
// each tab's headline is tested without rendering -- and so a summary can
// never count differently from the list under it.

import { sessionBucket } from "./sessionBucket";
import type { PatientReceipt } from "./receipts";

// ---- Sessions (patient and therapist) ------------------------------------

export type SummarySession = { id: string; status: string; slotTime: string | null; noShow?: boolean | null };

/**
 * Upcoming / done / cancelled counts and the next session, by the same rule
 * the Sessions list and its calendar use (`sessionBucket`), so the card above
 * a list can never say "2 upcoming" over a list showing one.
 */
export function sessionsSummary(sessions: SummarySession[], nowMs: number) {
  let upcoming = 0;
  let done = 0;
  let cancelled = 0;
  let next: SummarySession | null = null;
  for (const s of sessions) {
    const bucket = sessionBucket({ status: s.status, slotTime: s.slotTime }, nowMs);
    if (bucket === "upcoming") {
      upcoming++;
      if (s.slotTime && (!next || Date.parse(s.slotTime) < Date.parse(next.slotTime as string))) next = s;
    } else if (bucket === "cancelled") cancelled++;
    else if (s.status === "completed" && !s.noShow) done++;
  }
  return { upcoming, done, cancelled, next };
}

// ---- Payments --------------------------------------------------------------

/**
 * Counts, never totals. A rupee total over payments, part refunds and
 * programme-covered sessions is exactly the kind of figure that disagrees with
 * the list below it (money is shown whole or not at all), so the card says how
 * many of each there are and names the latest payment, whose amount is that
 * one receipt's own figure.
 */
export function paymentsSummary(receipts: PatientReceipt[]) {
  let payments = 0;
  let refunds = 0;
  let failed = 0;
  let latest: { title: string; date: string; amountPaise: number } | null = null;
  for (const r of receipts) {
    if (r.kind === "payment_failed") {
      failed++;
      continue;
    }
    if (r.kind === "booking") {
      if (r.refund) refunds++;
      if (r.isPackageCovered) continue;
    }
    payments++;
    if (!latest || Date.parse(r.date) > Date.parse(latest.date)) {
      latest = { title: r.title, date: r.date, amountPaise: r.amountPaise };
    }
  }
  return { payments, refunds, failed, latest };
}

// ---- Recommendations -------------------------------------------------------

/** What is waiting on the patient: a programme offer counts once, plus each
 *  proposed time -- the same sum the More button's badge shows. */
export function recommendationsWaiting(hasOffer: boolean, proposedTimes: number): number {
  return (hasOffer ? 1 : 0) + Math.max(0, proposedTimes);
}

// ---- Progress --------------------------------------------------------------

/**
 * One sentence for a trend line: "down from 8 to 4". `betterWhen` is the
 * direction that is good -- down for pain, up for independence or milestones.
 * Null until there are two readings, because one dot is not a trend.
 */
export function trendSentence(
  values: number[],
  betterWhen: "down" | "up",
  unit = ""
): { text: string; verdict: "better" | "worse" | "same" } | null {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return null;
  const first = v[0];
  const last = v[v.length - 1];
  const u = unit ? (unit === "%" ? "%" : ` ${unit}`) : "";
  if (first === last) return { text: `steady at ${last}${u}`, verdict: "same" };
  const went = last < first ? "down" : "up";
  return {
    text: `${went} from ${first} to ${last}${u}`,
    verdict: went === betterWhen ? "better" : "worse",
  };
}

// ---- Availability ----------------------------------------------------------

/**
 * Hours a week and working days from the weekly template (one row per hour),
 * and the next date that differs. The template is what the clinic plans
 * around; this says it back in two numbers.
 */
export function availabilitySummary(
  template: { day_of_week: number; hour: number }[],
  overrides: { date: string; available: boolean }[]
) {
  const days = new Set(template.map((r) => r.day_of_week));
  const next = [...overrides].sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  return { hoursPerWeek: template.length, workingDays: days.size, nextException: next };
}

/**
 * My progress's headline. Plain and never alarming: a reading that went the
 * wrong way is something to raise with the physiotherapist, not a verdict.
 * `parent` speaks about a child's record in the parent's voice.
 */
export function progressHeadline(
  trend: { verdict: "better" | "worse" | "same" } | null,
  opts: { awaitingTherapist: boolean; parent: boolean }
): string {
  if (opts.awaitingTherapist) return "Your physiotherapist fills this in at your first session";
  if (!trend) return opts.parent ? "Your child's progress shows here after two readings" : "Your progress shows here after two readings";
  if (trend.verdict === "better") return opts.parent ? "Yes, your child is improving" : "Yes, you're improving";
  if (trend.verdict === "same") return "Holding steady";
  return "Worth raising at your next session";
}
