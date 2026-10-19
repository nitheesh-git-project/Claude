import Link from "next/link";
import { formatClinicDate } from "@/lib/formatDateTime";
import { SESSION_SUMMARY_FIELDS, type PatientSummaryState } from "@/lib/sessionSummary";

/**
 * What the therapist told the patient about a session they had: what was
 * done, and what to do before the next one. Rendered on the patient's own
 * session card, from `patientSummaryState` -- which is what decides it is
 * this patient's session, that the session was delivered, and that a read
 * which failed is never shown as "none written".
 *
 * This is the summary, not the therapist's session note. The note is
 * clinician-only and is never read for this card (docs/rules/clinical.md).
 */
export default function PatientSessionSummary({ state }: { state: PatientSummaryState }) {
  if (state.kind === "hidden") return null;

  const planLink =
    state.kind !== "unavailable" && state.planHref ? (
      <Link
        href={state.planHref}
        className="inline-flex items-center gap-1.5 pt-1 text-[11px] font-semibold text-teal-700 hover:text-teal-800"
      >
        <i aria-hidden="true" className="fa-solid fa-clipboard-list" /> See the programme recommended after this session
      </Link>
    ) : null;

  return (
    <section
      aria-label="Summary from your therapist"
      data-testid="patient-session-summary"
      className="space-y-1.5 rounded-lg border border-teal-100 bg-teal-50/60 p-3"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-800">Session summary</p>
      {state.kind === "unavailable" ? (
        <p className="text-slate-600">
          We couldn&apos;t load this session&apos;s summary just now. Refresh the page to try again.
        </p>
      ) : state.kind === "none" ? (
        <p className="text-slate-600">Your therapist hasn&apos;t added a summary for this session.</p>
      ) : (
        <>
          <p className="text-[11px] text-slate-500">
            {`From ${state.writtenBy} · ${formatClinicDate(state.writtenAt)}`}
            {state.updatedAt ? ` · updated ${formatClinicDate(state.updatedAt)}` : ""}
          </p>
          {SESSION_SUMMARY_FIELDS.map((field) => {
            const text = state[field.bodyKey];
            if (!text) return null;
            return (
              <div key={field.key}>
                <p className="font-semibold text-slate-700">{field.patientLabel}</p>
                <p className="whitespace-pre-line text-slate-700">{text}</p>
              </div>
            );
          })}
        </>
      )}
      {planLink}
    </section>
  );
}
