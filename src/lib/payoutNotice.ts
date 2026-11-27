// How long the therapist's "Paid" payout banner stays on Earnings after the
// payout was made: long enough to be seen, short enough that an old payout
// is never presented as news. Dependency-free, unit-tested.

export const PAYOUT_NOTICE_DAYS = 14;

/** True while a completed payout is recent enough to announce. A request
 *  with no completion time (older rows) is not shown at all. */
export function payoutNoticeIsFresh(completedAt: string | null | undefined, nowMs: number): boolean {
  const at = completedAt ? Date.parse(completedAt) : NaN;
  if (!Number.isFinite(at)) return false;
  return nowMs - at <= PAYOUT_NOTICE_DAYS * 86_400_000;
}
