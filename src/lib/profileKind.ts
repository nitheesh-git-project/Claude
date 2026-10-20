import type { ConditionSpecialty } from "@/lib/conditionSpecialty";
import type { ProfileKind } from "@/lib/outcomeMeasures";

// Which profile kind (outcomeMeasures.ts) a patient's record carries, from
// the condition type a therapist recorded and the answers on file.
//
// The owner's decision: Parkinson's is a SUB-PROFILE of neurological care,
// not a condition type of its own, so a Parkinson's patient is a `neuro`
// patient whose intake says so. The intake question that asks it
// (`neuro_subtype`) arrives with the neurological question set's next
// schema_version (Health Profile redesign, phase 4); until then this simply
// reads the key when it is present, and every neurological patient without
// it is `neuro`.
//
// Geriatric and cardiopulmonary have no condition type yet, so no specialty
// resolves to them here -- they become reachable one condition at a time in
// a later phase (docs/rules/clinical.md, the measurement layer rule).
//
// Dependency-free so the routes, the loaders and the screens all answer the
// question the same way, and it is tested without a database.

/** The intake key and the answer that make a neurological record the
 *  Parkinson's sub-profile. */
export const NEURO_SUBTYPE_KEY = "neuro_subtype";
export const NEURO_SUBTYPE_PARKINSONS = "Parkinson's disease";

/** Typographic apostrophes and stray spacing are the same answer: an
 *  admin-reworded option or a pasted value must not silently drop a
 *  Parkinson's patient back onto the stroke thresholds. */
function normaliseAnswer(value: string): string {
  return value.replace(/[‘’ʼ]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
}

export function profileKindFor(
  specialty: ConditionSpecialty,
  intakeData: Readonly<Record<string, unknown>> | null | undefined
): ProfileKind {
  if (specialty === "neuro") {
    const subtype = intakeData?.[NEURO_SUBTYPE_KEY];
    if (typeof subtype === "string" && normaliseAnswer(subtype) === normaliseAnswer(NEURO_SUBTYPE_PARKINSONS)) {
      return "neuro_parkinsons";
    }
    return "neuro";
  }
  if (specialty === "pediatrics") return "pediatrics";
  return "ortho";
}
