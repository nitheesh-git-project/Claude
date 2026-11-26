// Which side an exam is recorded on, against the side the patient reported.
//
// The exam form opened on the LEFT whenever its caller passed no side, and
// two of its three callers passed none. A patient who marked their right
// knee was examined "left", and the auto-written "Where things stand"
// summary copied the left knee -- a clinical record and a patient-facing
// summary both wrong about which leg hurts. Owner's decision: no default
// side, and an exam on a side the patient did not report is not saved until
// the therapist confirms it, so a wrong side never reaches the summary
// unconfirmed.
//
// Dependency-free, unit-tested. The side the patient reported comes from
// their intake's `area_pain` answer (conditionIntake.parseAreaPain).

export type ExamSide = "left" | "right";

export type ReportedArea = { region: string; side: string };

/** The sides the patient marked for this region (left / right only). */
export function reportedSides(region: string | null, reported: ReportedArea[]): ExamSide[] {
  if (!region) return [];
  const sides = new Set<ExamSide>();
  for (const a of reported) {
    if (a.region !== region) continue;
    if (a.side === "left" || a.side === "right") sides.add(a.side);
  }
  return [...sides].sort();
}

/**
 * The side the form opens on: the caller's choice, else the one side the
 * patient marked, else none -- never a guess. A patient who marked both
 * sides gets no default either: the therapist picks the one being examined.
 */
export function defaultExamSide(
  region: string | null,
  reported: ReportedArea[],
  callerSide?: ExamSide | null
): ExamSide | null {
  if (callerSide) return callerSide;
  const sides = reportedSides(region, reported);
  return sides.length === 1 ? sides[0] : null;
}

/** True when the patient reported this region but not on the chosen side. */
export function examSideDiffers(region: string | null, side: ExamSide | null, reported: ReportedArea[]): boolean {
  if (!side) return false;
  const sides = reportedSides(region, reported);
  return sides.length > 0 && !sides.includes(side);
}

/** The sentence the form and the route both show for a mismatch. */
export function examSideMismatchMessage(side: ExamSide, reported: ExamSide[]): string {
  return `The patient reported the ${reported.join(" and ")} side, and this exam is on the ${side}. Confirm the side before it is saved - it goes into the patient's summary.`;
}
