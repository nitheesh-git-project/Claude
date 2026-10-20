import type { ReactNode } from "react";
import { formatClinicDateShort } from "@/lib/formatDateTime";
import type { Voice } from "@/lib/progressView";
import { whereThingsStandByline, type WhereThingsStandView } from "@/lib/whereThingsStand";

/**
 * "Where things stand": a few plain sentences from the physiotherapist after
 * each review. The view is shaped by whereThingsStand.ts (this component
 * writes nothing and computes nothing) and has three sources: the WRITTEN
 * summary, with who wrote it and when; the GENERATED wording, shown only
 * when nobody has written one and labelled as worked out automatically, so
 * it is never read as the physiotherapist's view; and nothing at all, worded
 * for who is reading. A read that failed is said apart from "nothing written
 * yet". The text keeps its line breaks.
 */
export default function WhereThingsStand({
  view,
  voice,
  loadFailed = false,
  action,
}: {
  view: WhereThingsStandView;
  voice: Voice;
  /** The written summary could not be read (the status history failed). */
  loadFailed?: boolean;
  /** The clinician's edit control, if the viewer may write it. */
  action?: ReactNode;
}) {
  const clinician = voice === "clinician";
  const byline = whereThingsStandByline(view, voice);

  return (
    <section aria-label="Where things stand" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" data-stand-source={view.source}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-teal-800">Where things stand</h3>
        {action}
      </div>
      {loadFailed && (
        <p role="status" className="mt-2 text-sm text-amber-900">
          {"We couldn't load the written summary just now."} It is not missing - please try again in a moment.
        </p>
      )}
      {view.source === "none" ? (
        !loadFailed && (
          <p className="mt-2 text-sm text-slate-600">
            {clinician
              ? "Nothing written yet. A few plain sentences for the patient after each review - how they are doing, what is next - appear here."
              : "Your physiotherapist will add a short summary here after your next review: how you are doing and what comes next."}
          </p>
        )
      ) : (
        <>
          <p
            className={`mt-2 whitespace-pre-line text-[15px] leading-relaxed [overflow-wrap:anywhere] ${
              view.source === "generated" ? "text-slate-700" : "text-slate-800"
            }`}
          >
            {view.text}
          </p>
          {byline && (
            <p className="mt-2 text-xs text-slate-600">
              {byline}
              {view.source === "written" ? `, ${formatClinicDateShort(view.setAt)}` : ""}
            </p>
          )}
          {view.source === "written" && view.stale && clinician && (
            <p role="status" className="mt-1 text-xs font-semibold text-amber-900">
              There has been a review since this was written. Look at it again.
            </p>
          )}
        </>
      )}
    </section>
  );
}
