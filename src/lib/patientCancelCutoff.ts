// When a patient may still cancel an online session themselves.
//
// The clinic sets a cut-off (`site_settings.patient_cancel_cutoff_minutes`,
// default 15): inside it the Cancel button is gone and the cancel route
// refuses, because a therapist is already preparing to join and a cancel
// that late is a no-show in all but name. Home visits keep their own rules
// (the therapist is travelling, and the refund window already covers it),
// so this applies to online sessions only. Dependency-free so it can be
// tested without a request.

export const PATIENT_CANCEL_CUTOFF_MIN = 0;
export const PATIENT_CANCEL_CUTOFF_MAX = 1440;

/** True when an online session is too close to its start for the patient to
 *  cancel it. A session with no slot time yet can always be cancelled. */
export function patientCancelClosed({
  slotTime,
  nowMs,
  cutoffMinutes,
}: {
  slotTime: string | null;
  nowMs: number;
  cutoffMinutes: number;
}): boolean {
  if (!slotTime) return false;
  const slotMs = new Date(slotTime).getTime();
  if (!Number.isFinite(slotMs)) return false;
  return nowMs >= slotMs - Math.max(0, cutoffMinutes) * 60_000;
}

/** Milliseconds until the cut-off closes, or null when it already has (or
 *  there is no slot). Lets the button hide itself at the right moment
 *  without polling. */
export function msUntilCancelCloses({
  slotTime,
  nowMs,
  cutoffMinutes,
}: {
  slotTime: string | null;
  nowMs: number;
  cutoffMinutes: number;
}): number | null {
  if (!slotTime) return null;
  const closesAt = new Date(slotTime).getTime() - Math.max(0, cutoffMinutes) * 60_000;
  return closesAt > nowMs ? closesAt - nowMs : null;
}
