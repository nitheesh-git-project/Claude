import {
  therapistReadiness,
  type TherapistReadinessInput,
} from "@/lib/therapistReadiness";

/**
 * What is still missing before this therapist can be given live patients.
 *
 * `approved` means "a person vetted this account" and the product reads it as
 * "ready to be assigned", which are different facts -- a therapist can be
 * approved with no hours on the roster and no revenue share, and both of
 * those fail *silently*: nothing can offer them a session, and a session they
 * do deliver leaves them owed nothing with no screen saying why.
 *
 * Two rules shape how it renders:
 *
 * 1. **It is advisory, and it says so.** Nothing here disables a control.
 *    An admin assigning a session has the therapist in front of them and may
 *    have every reason to go ahead; a gate on a field nobody was told about
 *    is worse than the state it replaces. The automatic assigner is the
 *    opposite case and does refuse -- see `canAutoAssignTo`.
 * 2. **A ready therapist gets no panel at all.** A green "all set" card on
 *    every profile is a row a reader learns to scroll past, and then misses
 *    the one profile that is not. Same rule as an unrefunded session
 *    carrying no refund chip.
 */
export default function TherapistReadinessPanel({
  therapist,
  name,
}: {
  therapist: TherapistReadinessInput;
  name: string;
}) {
  const missing = therapistReadiness(therapist).filter((item) => !item.met);
  if (missing.length === 0) return null;

  return (
    <section
      aria-labelledby="therapist-readiness-heading"
      className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6"
    >
      <h2
        id="therapist-readiness-heading"
        className="font-display font-bold text-sm text-amber-900"
      >
        Not ready for patients yet
      </h2>
      <p className="text-xs text-amber-800 mt-1">
        {name} is approved, and {missing.length === 1 ? "one thing is" : `${missing.length} things are`}{" "}
        still to set up. You can assign them anyway - this is a reminder, not a
        block - but sessions will not be handed to them automatically until the
        roster and the revenue share are in place.
      </p>
      <ul className="mt-3 space-y-2">
        {missing.map((item) => (
          <li key={item.key} className="flex gap-2 text-xs">
            <span aria-hidden="true" className="text-amber-600 mt-0.5">
              •
            </span>
            <span>
              <span className="font-semibold text-amber-900">{item.label}</span>
              <span className="text-amber-800"> — {item.why}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
