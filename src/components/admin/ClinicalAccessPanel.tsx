import {
  describeAccessReason,
  type ClinicalAccessHolder,
} from "@/lib/clinicalAccess";
import { formatClinicDate } from "@/lib/formatDateTime";

/**
 * Who can read this patient's clinical record, and why.
 *
 * The rule itself is unchanged and is a decision rather than an omission:
 * access follows **delivered care**. A completed session keeps whoever ran
 * it, so a clinician who treated somebody keeps access after the patient
 * moves on -- they have to be able to answer for that treatment -- while a
 * therapist whose only link was a future session that moved away reads
 * nothing. What was missing was that no screen anywhere said who that
 * reaches -- so "who can see this patient's record" was a
 * question the product could not answer, for the clinic, for a patient
 * asking, or for an admin deciding whether somebody's access should end.
 *
 * Three rules in how it renders:
 *
 * 1. **It states the rule, not just the list.** A list of names without the
 *    sentence above it reads as a bug report; the sentence is what turns it
 *    into a policy somebody can agree or disagree with.
 * 2. **A suspended therapist is listed and marked, never dropped.** The
 *    question is who has a relationship with this record, and silently
 *    omitting somebody would make a suspension look like a deletion. Their
 *    row says the access has ended.
 * 3. **It renders for every scope that can open this page**, because it
 *    contains no money and no clinical content -- only who, and why.
 */
export default function ClinicalAccessPanel({
  holders,
  nameFor,
}: {
  holders: ClinicalAccessHolder[];
  nameFor: (therapistId: string) => string;
}) {
  return (
    <section
      aria-labelledby="clinical-access-heading"
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
    >
      <h2 id="clinical-access-heading" className="font-display font-bold text-lg text-slate-800">
        Who can see this record
      </h2>
      <p className="text-xs text-slate-500 mt-1">
        A therapist can read this patient&apos;s health profile, exams, uploaded
        reports and session notes once they have treated them, and keeps that
        after the patient moves to somebody else - a session they delivered
        stays theirs, so they can still answer for the care they gave. Somebody
        booked in and then moved off before the session happened keeps nothing.
        It ends when the account is suspended.
      </p>

      {holders.length === 0 ? (
        <p className="mt-4 text-xs text-slate-500">
          Nobody has treated this patient yet, so no clinician can open their
          record.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {holders.map((holder) => (
            <li
              key={holder.therapistId}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl border border-slate-200 px-3 py-2"
            >
              <span className="text-sm font-semibold text-slate-900">
                {nameFor(holder.therapistId)}
                {!holder.active && (
                  <span className="ml-2 text-[10px] font-bold uppercase text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                    Access ended
                  </span>
                )}
              </span>
              <span className="text-[11px] text-slate-500">
                {describeAccessReason(holder)}
                {holder.lastSessionAt && (
                  <> · last on {formatClinicDate(holder.lastSessionAt)}</>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
