/**
 * Whether a therapist is ready to be given live patients -- which is not the
 * same question as whether an admin has approved them.
 *
 * `profiles.approved` means "a person vetted this account", and the product
 * reads it as "ready to be assigned", which are different facts. A therapist
 * can be approved with no working hours on the roster, no revenue share
 * configured and no specialisation, and every one of those produces a quiet
 * wrong answer rather than an error: an assignment nobody can be offered, a
 * payout computed from a null rate, a clinician listed on /team with nothing
 * saying what they do.
 *
 * Two decisions shape this module, and they are the reason it is a
 * **checklist** rather than a flag:
 *
 * 1. **Nothing here is invented policy.** Every item is something this
 *    application already needs in order to work. A `production_ready` column
 *    somebody has to tick is a second source of truth that drifts from the
 *    thing it describes; a gate on a field nobody knew was required is worse
 *    than the state it replaces. So the readiness is *derived*, and it is
 *    derived from facts the app is already reading elsewhere.
 * 2. **It is advisory for a person and binding for the machine.** An admin
 *    assigning a session has the therapist in front of them and may have
 *    every reason to go ahead -- so nothing here blocks them, it tells them.
 *    `autoAssignTherapist` is the opposite case: it picks a clinician with
 *    nobody watching, and the two failures that matter most there are silent
 *    (a payout worked out from a missing rate, and a patient matched to
 *    somebody whose specialisation nobody recorded). So the automatic
 *    assigner requires readiness and a person does not.
 *
 * Dependency-free and unit-tested, like every other judgement in `src/lib`:
 * what "ready" means decides who the app hands a patient to.
 */

export type TherapistReadinessInput = {
  approved: boolean | null;
  active: boolean | null;
  onLeave?: boolean | null;
  /** Any working hour at all on the weekly template. */
  weeklyHourCount: number;
  /** `profiles.revenue_share_percent`. */
  revenueSharePercent: number | null;
  /** `profiles.specialization`, free text or a canonical label alike. */
  specialization?: string | null;
};

export type ReadinessItemKey =
  | "approved"
  | "active"
  | "roster"
  | "revenue_share"
  | "specialisation";

export type ReadinessItem = {
  key: ReadinessItemKey;
  /** What is missing, in the words an admin would use. */
  label: string;
  /** Why it matters -- never "this field is required". */
  why: string;
  met: boolean;
  /**
   * Whether the automatic assigner refuses without it.
   *
   * `on_leave` is deliberately absent from this list: it is a temporary
   * state somebody set on purpose, not something missing from an account,
   * and the roster reads it already. A therapist on leave is not
   * *unfinished*.
   */
  blocksAutoAssign: boolean;
};

const REVENUE_SHARE_MIN = 0;
const REVENUE_SHARE_MAX = 100;

export function therapistReadiness(input: TherapistReadinessInput): ReadinessItem[] {
  const share = input.revenueSharePercent;
  const shareSet =
    share !== null &&
    share !== undefined &&
    Number.isFinite(share) &&
    share >= REVENUE_SHARE_MIN &&
    share <= REVENUE_SHARE_MAX;

  return [
    {
      key: "approved",
      label: "Approved",
      why: "Until an admin approves the account they cannot sign in at all.",
      met: input.approved === true,
      blocksAutoAssign: true,
    },
    {
      key: "active",
      label: "Not suspended",
      why: "A suspended account is refused everywhere, including at the database.",
      met: input.active !== false,
      blocksAutoAssign: true,
    },
    {
      key: "roster",
      label: "Working hours on the roster",
      why: "With no hours, nothing can offer them a session - the automatic assigner reads the roster, and so does the Day view an admin answers the phone from.",
      met: input.weeklyHourCount > 0,
      blocksAutoAssign: true,
    },
    {
      key: "revenue_share",
      label: "Revenue share set",
      why: "Their pay is worked out from this. With it unset a completed session contributes nothing to what they are owed, and no screen says why.",
      met: shareSet,
      blocksAutoAssign: true,
    },
    {
      key: "specialisation",
      label: "Specialisation recorded",
      why: "It is what a patient reads on /team and what an admin filters by when a referral needs a particular clinician.",
      met: !!input.specialization?.trim(),
      // Advisory only. A missing specialisation costs a patient a sentence
      // on a profile page; it does not make an assignment wrong, and
      // refusing to assign over it would leave paid sessions sitting in the
      // queue for a field nobody was told about.
      blocksAutoAssign: false,
    },
  ];
}

/** What is still missing, in the order a person would fix it. */
export function missingReadiness(input: TherapistReadinessInput): ReadinessItem[] {
  return therapistReadiness(input).filter((item) => !item.met);
}

/** Whether every item is met -- what the therapist's own card reports. */
export function isTherapistReady(input: TherapistReadinessInput): boolean {
  return missingReadiness(input).length === 0;
}

/**
 * Whether the **automatic** assigner may hand this therapist a paid session.
 *
 * Deliberately narrower than `isTherapistReady`: a missing specialisation
 * does not make an assignment wrong, and refusing over it would leave paid
 * sessions in the admin's queue for a field nobody was told about. What it
 * does refuse is the pair that fail silently -- no roster (so the clinic
 * never meant to offer that hour) and no revenue share (so the session is
 * delivered and the therapist is owed nothing, with no screen saying why).
 */
export function canAutoAssignTo(input: TherapistReadinessInput): boolean {
  return therapistReadiness(input).every((item) => item.met || !item.blocksAutoAssign);
}

/** One line for a chip or a count, or null when there is nothing to say. */
export function describeReadiness(input: TherapistReadinessInput): string | null {
  const missing = missingReadiness(input);
  if (missing.length === 0) return null;
  if (missing.length === 1) return `${missing[0].label} is missing`;
  return `${missing.length} things still to set up`;
}
