import {
  bookableHoursForDate,
  isSlotBookable,
  slotStartMs,
  toDateKey,
} from "@/lib/bookingSlots";
import { AVAILABILITY_HOURS } from "@/lib/therapistAvailability";

/**
 * A proposed run of dates for the sessions someone has already paid for.
 *
 * The clinician answered "how often" when they wrote the recommendation
 * (`frequency_per_week`), and until now nothing used it: the patient was
 * handed an empty calendar and asked to work out a rhythm the therapist had
 * already decided. Composing five dates from a blank grid is real work, and
 * it sits directly after a payment, which is the worst possible place to put
 * real work.
 *
 * So this proposes the whole run and lets the patient adjust it. That is the
 * difference between "here are five decisions" and "does this look right?".
 *
 * Dependency-free and unit-tested, per the business-maths rule: what it
 * produces is a schedule somebody will be held to, so it is reasoned about
 * without a calendar rendered around it.
 *
 * It is a *proposal*, never a booking. Every slot it returns still goes
 * through `/api/appointments/book-package-sessions`, which re-checks the
 * lead time, the minimum gap, the weekly cap and the therapist's diary
 * server-side. This function being wrong can only produce a worse first
 * suggestion, never a booking that should not exist.
 */

export type ProposedSlot = { dateKey: string; hour: number };

export type RhythmInput = {
  /** How many still need scheduling. */
  count: number;
  /** The clinician's answer, or null when they left it open. */
  frequencyPerWeek: number | null;
  /** The programme's own rules. Both optional; both respected. */
  minGapHours: number | null;
  maxPerWeek: number | null;
  nowMs: number;
  leadTimeMs: number;
  /** The purchase's validity. Nothing is proposed past it. */
  expiresAtMs: number | null;
  /** Keeps the run at one time of day where it can. */
  preferredHour?: number | null;
};

/** How many days apart, given a weekly frequency. */
export function daysBetweenSessions(frequencyPerWeek: number | null): number {
  // Two a week reads as "Tuesday and Friday", not "every 3.5 days", so the
  // spacing rounds down and the weekly cap below stops it drifting into a
  // sixth session in a five-session week.
  if (!frequencyPerWeek || frequencyPerWeek < 1) return 7;
  return Math.max(1, Math.floor(7 / Math.min(7, frequencyPerWeek)));
}

/** Monday-based week key, so "twice a week" is counted per calendar week. */
function weekKeyOf(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return toDateKey(d);
}

/**
 * The run itself.
 *
 * Returns **at most** `count` slots and may return fewer — a programme whose
 * validity cannot hold the whole run is a real situation, and proposing
 * dates past the expiry would be proposing sessions the patient would lose.
 * The caller says so rather than padding.
 */
export function proposeSessionRhythm(input: RhythmInput): ProposedSlot[] {
  const {
    count,
    frequencyPerWeek,
    minGapHours,
    maxPerWeek,
    nowMs,
    leadTimeMs,
    expiresAtMs,
    preferredHour = null,
  } = input;

  if (count <= 0) return [];

  const stepDays = daysBetweenSessions(frequencyPerWeek);
  const minGapMs = Math.max(0, minGapHours ?? 0) * 3_600_000;
  const perWeekCap = maxPerWeek && maxPerWeek > 0 ? maxPerWeek : null;

  const out: ProposedSlot[] = [];
  const perWeek = new Map<string, number>();

  // Walked day by day rather than jumped, so a day the lead time or the
  // weekly cap rules out slides the run forward instead of dropping a
  // session out of it.
  const cursor = new Date(nowMs);
  let daysScanned = 0;
  let nextEligibleMs = nowMs;

  while (out.length < count && daysScanned < MAX_SCAN_DAYS) {
    const dateKey = toDateKey(cursor);
    const hour = pickHour(dateKey, nowMs, leadTimeMs, preferredHour, out);

    if (hour !== null) {
      const startMs = slotStartMs(dateKey, hour);
      const week = weekKeyOf(dateKey);
      const weekCount = perWeek.get(week) ?? 0;
      const expiresOk = expiresAtMs === null || startMs <= expiresAtMs;
      const gapOk = startMs >= nextEligibleMs;
      const weekOk = perWeekCap === null || weekCount < perWeekCap;

      if (!expiresOk) break;
      if (gapOk && weekOk) {
        out.push({ dateKey, hour });
        perWeek.set(week, weekCount + 1);
        // The next one is due `stepDays` later, but never sooner than the
        // programme's own minimum gap -- a clinician asking for three a week
        // on a programme that allows 48 hours between sessions gets 48 hours.
        nextEligibleMs = Math.max(startMs + stepDays * 86_400_000, startMs + minGapMs);
      }
    }

    cursor.setDate(cursor.getDate() + 1);
    daysScanned += 1;
  }

  return out;
}

/** Roughly a year. A run that cannot be laid out inside that is not a run. */
const MAX_SCAN_DAYS = 370;

/**
 * The time of day, held steady across the run.
 *
 * A course of treatment at the same hour every time is one thing to
 * remember rather than five, so the hour the run opens on is reused for the
 * rest of it.
 *
 * Where an hour is wanted and that day cannot take it, the day is **skipped**
 * rather than substituted. Someone who asked for five o'clock and was handed
 * a nine-in-the-evening slot because it was the only one clearing the lead
 * time on the first candidate day has been given a schedule they did not
 * ask for -- and a day later there is a five o'clock available. Starting a
 * day later is the smaller cost by far.
 */
function pickHour(
  dateKey: string,
  nowMs: number,
  leadTimeMs: number,
  preferredHour: number | null,
  chosen: ProposedSlot[]
): number | null {
  // A wanted hour outside the clinic's own hours is ignored rather than
  // honoured, or the run would scan a year looking for three in the morning
  // and come back empty.
  const requested = chosen[0]?.hour ?? preferredHour;
  const wanted =
    requested !== null && requested !== undefined && AVAILABILITY_HOURS.includes(requested)
      ? requested
      : null;

  if (wanted !== null) {
    return isSlotBookable(dateKey, wanted, nowMs, leadTimeMs) ? wanted : null;
  }
  const bookable = bookableHoursForDate(dateKey, nowMs, leadTimeMs);
  return bookable.length > 0 ? bookable[0] : null;
}
