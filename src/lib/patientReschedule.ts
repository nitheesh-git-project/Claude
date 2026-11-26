// May a patient move this session themselves? (Owner's decisions: up to 24
// hours before by default -- admin-configurable -- once per booking, to any
// hour some therapist can take; the session then goes back to `requested`
// and the clinic re-confirms it.)
//
// Patients had no way to move a booking at all: the admin could, so every
// change was a message to the clinic. One rule, read by the card (whether to
// offer "Change time") and by the route (whether to do it), so the button
// and the answer cannot disagree.
//
// Dependency-free, unit-tested.

/** How many times a patient may move one booking themselves. */
export const PATIENT_RESCHEDULE_LIMIT = 1;

export type PatientRescheduleInput = {
  status: string;
  visitMode: string | null | undefined;
  slotTime: string | null;
  nowMs: number;
  /** `patient_reschedule_cutoff_hours`. */
  cutoffHours: number;
  /** `appointments.patient_reschedule_count`. */
  rescheduleCount: number;
  noShow?: boolean | null;
};

/** Null when the patient may move it; otherwise the sentence saying why not. */
export function patientRescheduleBlock(input: PatientRescheduleInput): string | null {
  if (input.status !== "requested" && input.status !== "confirmed") {
    return "Only an upcoming session can be moved.";
  }
  if (input.noShow) return "Only an upcoming session can be moved.";
  if (input.visitMode === "home_visit") {
    return "A home visit is moved by the clinic - message us and we'll find another time.";
  }
  if (input.rescheduleCount >= PATIENT_RESCHEDULE_LIMIT) {
    return "You've already moved this session once. Message the clinic to change it again.";
  }
  const slotMs = input.slotTime ? Date.parse(input.slotTime) : NaN;
  if (!Number.isFinite(slotMs)) return "This session has no time to move yet.";
  if (slotMs - input.nowMs < input.cutoffHours * 3_600_000) {
    return `Sessions can be moved up to ${input.cutoffHours} hours before they start. Message the clinic to change this one.`;
  }
  return null;
}
