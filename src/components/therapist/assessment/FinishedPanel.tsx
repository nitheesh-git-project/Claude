"use client";

import Link from "next/link";
import { useState } from "react";
import CareStatusControls from "@/components/profile/progress/CareStatusControls";
import SessionNoteDialog from "@/components/therapist/SessionNoteDialog";
import type { EndReason } from "@/lib/assessmentRun";
import { END_REASONS } from "@/lib/assessmentRun";
import type { FinishContext } from "@/lib/assessmentRunServer";
import type { FinishProgress } from "@/lib/finishFromRun";
import type { ProfileKind } from "@/lib/outcomeMeasures";

/** Words the run already has, for the note's blank fields only. */
export type FinishPrefill = {
  treated: string | null;
  homeExercise: string | null;
  watch: string | null;
  whatWeDid: string | null;
};

/**
 * The end of a run (T8): one wrap-up form in the page - the session note and
 * the patient's summary for the run's own session, their blank fields
 * started from the run (never over the physiotherapist's own text), saved
 * with one "Save and close session" (note, then summary, then the session
 * closed, in that order). The overall "Where things stand" is optional and
 * folded below, its draft only ever a starting point, saved, if at all, as
 * the physiotherapist's own text through the care-status route.
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
  // The wrap-up form is open in the page until it has saved and closed (T8).
  const [inlineOpen, setInlineOpen] = useState(!allDone);
  const prefillFor = {
    note: { treated: prefill.treated, home_exercise: prefill.homeExercise, red_flags: prefill.watch },
    summary: { whatWeDid: prefill.whatWeDid },
  };
  const onProgress = (p: FinishProgress) =>
    setProgress((prev) => ({
      noteSaved: prev.noteSaved || p.noteSaved,
      summarySaved: prev.summarySaved || p.summarySaved,
      sessionClosed: prev.sessionClosed || p.sessionClosed,
    }));

  return (
    <div data-testid="finished-panel" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div>
        <p className="text-[13px] font-bold uppercase tracking-wider text-teal-800">{outcome === "completed" ? "Finished" : "Ended early"}</p>
        <h2 className="mt-1 font-display text-2xl font-extrabold text-slate-900">
          {outcome === "completed" ? "The guided check is saved" : "The guided check was ended"}
        </h2>
        {outcome === "abandoned" && reason && <p className="mt-1 text-base text-slate-800">{END_REASONS[reason]}. What was saved stays on the record.</p>}
        <p className="mt-1 text-sm text-slate-700">
          {firstName}
          {"'"}s screen now says All done.
        </p>
      </div>

      {finish.status === "unreadable" ? (
        <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[15px] font-semibold text-amber-900">
          We couldn{"'"}t check this session{"'"}s note just now, so nothing is offered here. Finish it from the session card.
        </p>
      ) : finish.status === "none" ? (
        <p className="text-[15px] text-slate-800">This check is not filed against one of your sessions with {firstName}. Finish the session from its card.</p>
      ) : allDone && !inlineOpen ? (
        <div data-testid="finish-done" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
          <p role="status" className="text-[15px] font-semibold text-emerald-950">
            Saved: the note{progress.summarySaved ? `, ${firstName}'s summary` : ""} and the session is closed.
          </p>
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="min-h-[44px] rounded-xl px-3 text-sm font-semibold text-emerald-900 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
          >
            Open the note
          </button>
        </div>
      ) : (
        <SessionNoteDialog
          inline
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
          prefill={prefillFor}
          onProgress={onProgress}
          onClose={() => setInlineOpen(false)}
        />
      )}

      <details data-testid="where-things-stand" className="group rounded-xl border border-slate-200 px-3.5">
        <summary className="flex min-h-[48px] cursor-pointer items-center justify-between gap-2 text-[15px] font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
          <span>
            Also update {"“"}Where things stand{"”"} <span className="font-normal text-slate-700">(optional)</span>
          </span>
          <span aria-hidden="true" className="text-slate-600 group-open:rotate-180">▾</span>
        </summary>
        <div className="space-y-2 pb-3.5">
          {!draftReadable && (
            <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              We could not check the readings just now, so there is no draft. You can still write it yourself.
            </p>
          )}
          <p className="text-sm text-slate-700">
            {firstName}
            {"'"}s overall picture, started for you from today. Change it into your own words before saving: they read it.
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
      </details>
      <Link
        href={chartHref}
        className="inline-flex min-h-[48px] items-center rounded-xl border border-slate-300 px-5 text-base font-semibold text-slate-900 hover:border-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
      >
        Back to Health Profile
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
          prefill={prefillFor}
          onProgress={onProgress}
          onClose={() => setNoteOpen(false)}
        />
      )}
    </div>
  );
}
