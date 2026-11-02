"use client";

import Link from "next/link";
import { useState } from "react";
import CareStatusControls from "@/components/profile/progress/CareStatusControls";
import SessionNoteDialog from "@/components/therapist/SessionNoteDialog";
import type { EndReason } from "@/lib/assessmentRun";
import { END_REASONS } from "@/lib/assessmentRun";
import type { FinishContext } from "@/lib/assessmentRunServer";
import { FINISH_STEPS, type FinishProgress } from "@/lib/finishFromRun";
import type { ProfileKind } from "@/lib/outcomeMeasures";

/** Words the run already has, for the note's blank fields only. */
export type FinishPrefill = {
  treated: string | null;
  homeExercise: string | null;
  watch: string | null;
  whatWeDid: string | null;
};

/**
 * The end of a run: what happened, the patient's screen saying All done,
 * "Finish this session" (the session note opened on the run's own session,
 * closing it on save, its blank fields started from the run - never over
 * the physiotherapist's own text) with a three-line checklist, and the
 * draft of "Where things stand" waiting in the existing summary editor. The
 * draft is only ever a starting point; it is saved, if at all, as the
 * physiotherapist's own text through the care-status route.
 */
export default function FinishedPanel({
  patientId,
  patientName,
  profileKind,
  outcome,
  reason,
  summaryDraft,
  draftReadable,
  chartHref,
  finish,
  prefill,
}: {
  patientId: string;
  patientName: string;
  profileKind: ProfileKind;
  outcome: "completed" | "abandoned";
  reason: EndReason | null;
  summaryDraft: string | null;
  draftReadable: boolean;
  chartHref: string;
  finish: FinishContext;
  prefill: FinishPrefill;
}) {
  const firstName = patientName.split(" ")[0] || "the patient";
  const [noteOpen, setNoteOpen] = useState(false);
  const [progress, setProgress] = useState<FinishProgress>(() =>
    finish.status === "ok"
      ? { noteSaved: !!finish.note, summarySaved: !!finish.summary.row, sessionClosed: finish.completed }
      : { noteSaved: false, summarySaved: false, sessionClosed: false }
  );
  const allDone = progress.noteSaved && progress.sessionClosed;

  return (
    <div data-testid="finished-panel" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div>
        <p className="text-[13px] font-bold uppercase tracking-wider text-teal-800">{outcome === "completed" ? "Finished" : "Ended early"}</p>
        <h2 className="mt-1 font-display text-2xl font-extrabold text-slate-900">
          {outcome === "completed" ? "The guided assessment is saved" : "The guided assessment was ended"}
        </h2>
        {outcome === "abandoned" && reason && <p className="mt-1 text-base text-slate-800">{END_REASONS[reason]}. What was saved stays on the record.</p>}
        <p className="mt-1 text-sm text-slate-700">
          {firstName}
          {"'"}s screen now says All done.
        </p>
      </div>

      <section aria-labelledby="finish-heading" className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/60 p-3.5" data-testid="finish-session">
        <h3 id="finish-heading" className="font-display text-lg font-bold text-slate-900">
          Finish this session
        </h3>
        {finish.status === "unreadable" ? (
          <p role="status" className="text-[15px] font-semibold text-amber-900">
            We couldn{"'"}t check this session{"'"}s note just now, so nothing is offered here. Finish it from the session card.
          </p>
        ) : finish.status === "none" ? (
          <p className="text-[15px] text-slate-800">This assessment is not filed against one of your sessions with {firstName}. Finish the session from its card.</p>
        ) : (
          <>
            <ul className="space-y-1" aria-label="What finishing does" data-testid="finish-checklist">
              {FINISH_STEPS.map((s) => (
                <li key={s.key} className="flex items-center gap-2 text-[15px] text-slate-900">
                  <span
                    aria-hidden="true"
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${progress[s.key] ? "bg-teal-700 text-white" : "border border-slate-400 text-transparent"}`}
                  >
                    ✓
                  </span>
                  {s.label}
                  <span className="sr-only">{progress[s.key] ? ": done" : ": not yet"}</span>
                </li>
              ))}
            </ul>
            {!allDone || !progress.summarySaved ? (
              <>
                <button
                  type="button"
                  data-testid="finish-this-session"
                  onClick={() => setNoteOpen(true)}
                  className="inline-flex min-h-[52px] items-center rounded-xl bg-teal-700 px-5 text-base font-bold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
                >
                  {finish.completed ? (progress.noteSaved ? "Open the session note" : "Write the session note") : "Finish this session"}
                </button>
                <p className="text-[13px] text-slate-700">
                  Opens the note for {finish.sessionLabel}. Blank fields start from today{"'"}s results; anything already written stays as it is.
                </p>
              </>
            ) : (
              <p role="status" className="text-[15px] font-semibold text-teal-900">
                The note is saved and the session is closed.
              </p>
            )}
          </>
        )}
      </section>

      {!draftReadable && (
        <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          We could not check the readings just now, so there is no draft. You can still write the summary yourself.
        </p>
      )}
      <div>
        <p className="mb-2 text-sm text-slate-700">
          A short {"“"}Where things stand{"”"} for {firstName}, started for you from what was saved today. Change it into your own words before saving: they
          read it.
        </p>
        <CareStatusControls
          patientId={patientId}
          profileKind={profileKind}
          currentPhase={null}
          phaseIsInferred
          override={null}
          overrideStale={false}
          summaryDraft={summaryDraft}
          summaryOnly
        />
      </div>
      <Link
        href={chartHref}
        className="inline-flex min-h-[48px] items-center rounded-xl border border-slate-300 px-5 text-base font-semibold text-slate-900 hover:border-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
      >
        Back to the chart
      </Link>

      {noteOpen && finish.status === "ok" && (
        <SessionNoteDialog
          appointmentId={finish.appointmentId}
          patientName={patientName}
          sessionLabel={finish.sessionLabel}
          existing={finish.note}
          locked={!!finish.note && !finish.noteEditable}
          hoursLeft={finish.hoursLeft}
          patientId={patientId}
          sessionCompleted={finish.completed || progress.sessionClosed}
          recommendable={[]}
          recommendationNeedsApproval
          recommendationAwaitingClinic={false}
          summary={finish.summary}
          completeOnSave={!finish.completed && !progress.sessionClosed}
          sessionStartIso={finish.slotTime}
          prefill={{
            note: { treated: prefill.treated, home_exercise: prefill.homeExercise, red_flags: prefill.watch },
            summary: { whatWeDid: prefill.whatWeDid },
          }}
          onProgress={(p) =>
            setProgress((prev) => ({
              noteSaved: prev.noteSaved || p.noteSaved,
              summarySaved: prev.summarySaved || p.summarySaved,
              sessionClosed: prev.sessionClosed || p.sessionClosed,
            }))
          }
          onClose={() => setNoteOpen(false)}
        />
      )}
    </div>
  );
}
