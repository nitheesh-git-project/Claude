// The rows on Today -> Health Profile reviews, shaped.
//
// Two kinds of thing wait on a person here: a patient's intake answers
// waiting to go live (condition_change_requests, status 'pending') and a
// therapist asking to edit a patient's Health Profile
// (condition_access_grants, status 'requested'). The dashboard used to only
// COUNT them, on a Today row that opened the patients directory -- a count
// that linked to rows it had not counted. This file is the shaping for the
// screen that lists them. Dependency-free so the ordering and the wording are
// tested.

export type ReviewSubmission = {
  id: string;
  patientId: string;
  patientName: string;
  /** Who filled the answers in. */
  submitterName: string;
  submittedAt: string;
};

export type ReviewAccessRequest = {
  id: string;
  patientId: string;
  patientName: string;
  therapistName: string;
  requestedAt: string;
};

/** Waiting longer than this many whole days is marked as overdue. */
export const REVIEW_OVERDUE_AFTER_DAYS = 3;

export function daysWaiting(sinceIso: string, nowMs: number): number {
  const t = new Date(sinceIso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / 86_400_000));
}

/** "Waiting since today" / "Waiting 1 day" / "Waiting 5 days". */
export function waitingLabel(sinceIso: string, nowMs: number): string {
  const days = daysWaiting(sinceIso, nowMs);
  if (days === 0) return "Waiting since today";
  return `Waiting ${days} day${days === 1 ? "" : "s"}`;
}

export function isOverdue(sinceIso: string, nowMs: number): boolean {
  return daysWaiting(sinceIso, nowMs) > REVIEW_OVERDUE_AFTER_DAYS;
}

/** Longest-waiting first: the queue's oldest row is the one to do next. A row
 *  with an unreadable date sorts last rather than first. */
export function oldestFirst<T>(rows: readonly T[], at: (row: T) => string): T[] {
  const time = (row: T) => {
    const t = new Date(at(row)).getTime();
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
  };
  return [...rows].sort((a, b) => time(a) - time(b));
}
