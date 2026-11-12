// Where "Start guided assessment" is offered (Health Profile redesign, phase
// 7b). The cockpit itself and the start route are the gate (assigned
// therapist, a session that has started or been delivered); this only decides
// whether the door is shown, so a therapist is not offered a button the
// server would refuse. Mirrors hasStartedSessionWithPatient (conditionAccess.ts)
// for the session card, which already holds the rows.

/** Where the cockpit lives, for a patient and (optionally) the session it is filed against. */
export function cockpitHref(patientId: string, appointmentId?: string | null): string {
  const base = `/therapist/dashboard/assessment/${encodeURIComponent(patientId)}`;
  return appointmentId ? `${base}?appointment=${encodeURIComponent(appointmentId)}` : base;
}

/** A finished session still offers it for a while: the physiotherapist who
 *  pressed Done a little early may want to finish the check. */
export const COMPLETED_OFFER_WINDOW_MS = 2 * 60 * 60 * 1000;

export function offersGuidedAssessment(input: {
  status: string;
  noShow: boolean;
  isHomeVisit: boolean;
  slotTimeMs: number | null;
  nowMs: number;
  joinWindowMinutes: number;
}): boolean {
  // A guided video assessment belongs to a video session.
  if (input.isHomeVisit || input.noShow || input.slotTimeMs === null || !Number.isFinite(input.slotTimeMs)) return false;
  const opensAt = input.slotTimeMs - Math.max(0, input.joinWindowMinutes) * 60_000;
  if (input.status === "confirmed") return input.nowMs >= opensAt;
  if (input.status === "completed") return input.nowMs >= opensAt && input.nowMs <= input.slotTimeMs + COMPLETED_OFFER_WINDOW_MS;
  return false;
}
