/**
 * Who can read this patient's clinical record, and why.
 *
 * **The rule, stated rather than implied: access follows delivered care.** A
 * therapist may read a patient's health profile, Pain Map exams, uploaded
 * reports and session notes while they are named on one of that patient's
 * appointments, or hold a programme locked to them.
 *
 * What makes that a *retention* rule rather than a current-assignment one is
 * that **a completed session keeps whoever ran it**: neither
 * `update-appointment` nor `reassign-package-therapist` will move one. So a
 * clinician who has actually treated somebody keeps access for ever, even
 * after the patient moves to a colleague -- which is the decision, and it is
 * deliberate: in a clinic this size the person who gave the care has to be
 * able to answer for it, to the patient, to the next clinician, or to
 * anybody reviewing it later, and a cut-off creates the worse failure.
 *
 * The mirror is what keeps it honest rather than merely permissive: a
 * therapist whose only link was a *future* session that was reassigned away
 * reads nothing, because they never treated this patient.
 *
 * What was actually wrong was never the rule. It lives in four RLS policies
 * and one helper, and **no screen anywhere said who it reaches** -- so "who
 * can see this patient's record" was a question the product could not
 * answer, for the clinic, for a patient asking, or for an admin deciding
 * whether somebody's access should end.
 *
 * It ends in exactly one way: the account stops being an approved, active
 * therapist. `is_active_therapist()` is what enforces that at the database,
 * so suspending somebody ends their clinical reads at the row rather than
 * one token lifetime later.
 *
 * Dependency-free and unit-tested, because a sentence about who can read a
 * medical record has to be right.
 */

export type ClinicalAccessSource = {
  therapistId: string;
  /** ISO instant of the session, or null for a programme lock. */
  slotTime?: string | null;
  /** True when this row is a programme locked to the therapist. */
  viaProgrammeLock?: boolean;
};

export type ClinicalAccessHolder = {
  therapistId: string;
  /** Sessions with this patient, however long ago. */
  sessionCount: number;
  /** The most recent session's instant, or null when access is by lock alone. */
  lastSessionAt: string | null;
  /** Whether a programme is locked to them, which grants access on its own. */
  viaProgrammeLock: boolean;
  /**
   * Whether the account can still use it.
   *
   * A suspended or unapproved therapist is listed rather than dropped: the
   * question this panel answers is "who has a relationship with this
   * record", and silently omitting somebody would make a suspension look
   * like a deletion. It says so instead.
   */
  active: boolean;
};

export type TherapistStanding = { approved: boolean | null; active: boolean | null };

/**
 * Everyone with a clinical relationship to this patient, most recent first.
 *
 * Ordered by last session so the current clinician leads and the historical
 * ones follow, which is the order somebody reads this in: "who is treating
 * them, and who else can see this".
 */
export function clinicalAccessHolders(
  sources: readonly ClinicalAccessSource[],
  standing: ReadonlyMap<string, TherapistStanding>
): ClinicalAccessHolder[] {
  const byTherapist = new Map<string, ClinicalAccessHolder>();

  for (const source of sources) {
    if (!source.therapistId) continue;
    const held = byTherapist.get(source.therapistId) ?? {
      therapistId: source.therapistId,
      sessionCount: 0,
      lastSessionAt: null,
      viaProgrammeLock: false,
      active: true,
    };

    if (source.viaProgrammeLock) {
      held.viaProgrammeLock = true;
    } else {
      held.sessionCount += 1;
      const at = source.slotTime ?? null;
      // An unreadable date is not compared as NaN and never becomes the
      // "most recent" by accident -- the same rule sessionOrdering follows.
      const atMs = at ? Date.parse(at) : Number.NaN;
      const heldMs = held.lastSessionAt ? Date.parse(held.lastSessionAt) : Number.NaN;
      if (Number.isFinite(atMs) && (!Number.isFinite(heldMs) || atMs > heldMs)) {
        held.lastSessionAt = at;
      }
    }

    byTherapist.set(source.therapistId, held);
  }

  for (const held of byTherapist.values()) {
    const s = standing.get(held.therapistId);
    held.active = s ? s.approved !== false && s.active !== false : true;
  }

  return Array.from(byTherapist.values()).sort((a, b) => {
    const aMs = a.lastSessionAt ? Date.parse(a.lastSessionAt) : Number.NaN;
    const bMs = b.lastSessionAt ? Date.parse(b.lastSessionAt) : Number.NaN;
    if (Number.isFinite(aMs) && Number.isFinite(bMs) && aMs !== bMs) return bMs - aMs;
    if (Number.isFinite(aMs) !== Number.isFinite(bMs)) return Number.isFinite(aMs) ? -1 : 1;
    // A deterministic tie-break, never a reliance on sort stability.
    return a.therapistId.localeCompare(b.therapistId);
  });
}

/** Why this clinician can see the record, in a sentence an admin reads. */
export function describeAccessReason(holder: ClinicalAccessHolder): string {
  const parts: string[] = [];
  if (holder.sessionCount > 0) {
    parts.push(
      holder.sessionCount === 1 ? "1 session with them" : `${holder.sessionCount} sessions with them`
    );
  }
  if (holder.viaProgrammeLock) parts.push("a programme locked to them");
  // Neither is possible if they are in this list at all, but a sentence that
  // could read "can see this record because of" and then stop is worse than
  // one that names the absence.
  if (parts.length === 0) return "No current reason on record";
  return parts.join(" and ");
}
