import type { ReactNode } from "react";
import { formatClinicDate } from "@/lib/formatDateTime";
import type { Voice } from "@/lib/progressView";

/**
 * "Where things stand": a few plain sentences from the physiotherapist after
 * each review. The text is passed in (this component writes nothing and
 * computes nothing); it keeps its line breaks. Three states: the text, an
 * empty state worded for who is reading (a patient is told it is coming, a
 * clinician is told to write it), and a read that failed - said apart from
 * "nothing written yet".
 */
export default function WhereThingsStand({
  text,
  voice,
  updatedAt = null,
  loadFailed = false,
  action,
}: {
  text: string | null;
  voice: Voice;
  /** When the summary was last written. */
  updatedAt?: string | null;
  loadFailed?: boolean;
  /** The clinician's edit control, if the viewer may write it. */
  action?: ReactNode;
}) {
  const clinician = voice === "clinician";
  const body = text?.trim() ?? "";

  return (
    <section aria-label="Where things stand" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-teal-800">
          Where things stand
        </h3>
        {action}
      </div>
      {loadFailed ? (
        <p role="status" className="mt-2 text-sm text-amber-900">
          {"We couldn't load this summary just now."} It is not missing - please try again in a moment.
        </p>
      ) : body ? (
        <>
          <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-slate-800 [overflow-wrap:anywhere]">{body}</p>
          {updatedAt && <p className="mt-2 text-xs text-slate-600">Updated {formatClinicDate(updatedAt)}</p>}
        </>
      ) : (
        <p className="mt-2 text-sm text-slate-600">
          {clinician
            ? "Nothing written yet. A few plain sentences for the patient after each review - how they are doing, what is next - appear here."
            : "Your physiotherapist will add a short summary here after your next review: how you are doing and what comes next."}
        </p>
      )}
    </section>
  );
}
