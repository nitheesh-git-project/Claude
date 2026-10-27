"use client";

import { useMemo, useState } from "react";
import ExercisePicture from "@/components/exercises/ExercisePicture";
import Spinner from "@/components/system/Spinner";
import DoseStepper from "@/components/therapist/assessment/teach/DoseStepper";
import { BODY_AREAS, bodyAreasFor, exerciseByKey, exercisesFor, type BodyArea, type ContraFlag, type Exercise } from "@/lib/exerciseLibrary";
import { DOSE_NOTE_MAX_CHARS, doseText } from "@/lib/exercisePlan";
import type { ProfileKind } from "@/lib/outcomeMeasures";
import {
  PLAN_PICK_MAX,
  doseFieldsFor,
  draftProblem,
  noteProblem,
  offerFor,
  toggleDraft,
  updateDraft,
  withNote,
  type DraftItem,
} from "@/lib/teachTool";

/**
 * Choose the patient's home exercises from the clinic's library: chips for the
 * body area, a card per exercise (tiny picture, plain name, a "Needs a
 * helper" badge, or the reason it is not suitable for this patient), up to
 * six picked. Each pick then has its dose as big steppers and an optional
 * short note. One button, Use this plan, saves it as a new version.
 */
export default function PlanBuilder({
  kind,
  contraFlags,
  helperTicked,
  initial,
  publishing,
  onPublish,
  onCancel,
}: {
  kind: ProfileKind;
  contraFlags: readonly ContraFlag[];
  helperTicked: boolean;
  initial: DraftItem[];
  publishing: boolean;
  onPublish: (draft: DraftItem[]) => void;
  onCancel: (() => void) | null;
}) {
  const [area, setArea] = useState<BodyArea | "all">("all");
  const [draft, setDraft] = useState<DraftItem[]>(initial);
  const [limitHit, setLimitHit] = useState(false);
  const flags = useMemo(() => new Set(contraFlags), [contraFlags]);
  const areas = useMemo(() => bodyAreasFor(kind), [kind]);
  const shown = useMemo(() => exercisesFor(kind, area === "all" ? undefined : area), [kind, area]);
  const picked = new Set(draft.map((d) => d.exerciseKey));

  const problem = draftProblem(draft, { helperTicked, needsHelper: (k) => !!exerciseByKey(k)?.needsHelper });

  function pick(exercise: Exercise) {
    const next = toggleDraft(draft, exercise);
    setLimitHit(next.tooMany);
    setDraft(next.draft);
  }

  const chip = (on: boolean) =>
    `inline-flex min-h-[44px] items-center rounded-full border px-4 text-[15px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 ${
      on ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-900 hover:border-teal-500"
    }`;

  return (
    <div className="space-y-5" data-testid="plan-builder">
      <div>
        <p className="text-base font-semibold text-slate-900">Pick the exercises for home.</p>
        <p className="mt-0.5 text-sm text-slate-700">
          Choose up to {PLAN_PICK_MAX}. Then set how often. <span data-testid="plan-count">{draft.length} of {PLAN_PICK_MAX} picked.</span>
        </p>
      </div>

      <div role="group" aria-label="Body area" className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={area === "all"} className={chip(area === "all")} onClick={() => setArea("all")} data-testid="area-all">
          All
        </button>
        {areas.map((a) => (
          <button key={a} type="button" aria-pressed={area === a} className={chip(area === a)} onClick={() => setArea(a)} data-testid={`area-${a}`}>
            {BODY_AREAS[a]}
          </button>
        ))}
      </div>

      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Exercises">
        {shown.map((e) => {
          const offer = offerFor(e, flags);
          const on = picked.has(e.key);
          const ruledOut = offer.kind === "ruled_out";
          return (
            <li key={e.key}>
              <button
                type="button"
                aria-pressed={on}
                disabled={ruledOut}
                onClick={() => pick(e)}
                data-testid={`pick-${e.key}`}
                data-state={ruledOut ? "ruled_out" : on ? "picked" : "open"}
                className={`flex min-h-[72px] w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 ${
                  ruledOut
                    ? "cursor-not-allowed border-amber-300 bg-amber-50"
                    : on
                      ? "border-teal-700 bg-teal-50 ring-1 ring-teal-700"
                      : "border-slate-300 bg-white hover:border-teal-500"
                }`}
              >
                <span className="w-16 shrink-0">
                  <ExercisePicture picture={e.picture} name={e.name} tone="light" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-base font-semibold text-slate-900">{e.name}</span>
                    {e.needsHelper && (
                      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">Needs a helper</span>
                    )}
                  </span>
                  {ruledOut && (
                    <span className="mt-0.5 block text-[13px] leading-snug text-amber-950">
                      <strong>Not suitable for this patient.</strong> {offer.message}
                      {offer.easier && exerciseByKey(offer.easier) ? ` Try ${exerciseByKey(offer.easier)!.name.toLowerCase()} instead.` : ""}
                    </span>
                  )}
                </span>
                {on && <i aria-hidden="true" className="fa-solid fa-circle-check text-xl text-teal-700" />}
                <span className="sr-only">{on ? "Picked" : ruledOut ? "Not suitable" : "Tap to pick"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p role="status" className="empty:hidden text-sm font-semibold text-amber-900">
        {limitHit ? `A plan holds ${PLAN_PICK_MAX} exercises here. Take one out to add another.` : ""}
      </p>

      {draft.length > 0 && (
        <section aria-label="How often" className="space-y-3">
          <h3 className="font-display text-lg font-extrabold text-slate-900">How often</h3>
          {draft.map((d) => {
            const e = exerciseByKey(d.exerciseKey);
            if (!e) return null;
            const noteIssue = d.dose.note ? noteProblem(d.dose.note) : null;
            return (
              <div key={d.exerciseKey} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5" data-testid={`dose-card-${d.exerciseKey}`}>
                <div className="flex items-center gap-3">
                  <span className="w-14 shrink-0">
                    <ExercisePicture picture={e.picture} name={e.name} tone="light" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-bold text-slate-900">{e.name}</p>
                    <p className="text-sm text-slate-800" data-testid={`dose-text-${d.exerciseKey}`}>
                      {doseText(d.dose)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDraft((prev) => prev.filter((p) => p.exerciseKey !== d.exerciseKey))}
                    className="min-h-[44px] shrink-0 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 hover:border-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                  >
                    Take out<span className="sr-only"> {e.name}</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-3">
                  {doseFieldsFor(e.doseKind).map((f) => (
                    <DoseStepper
                      key={f}
                      field={f}
                      dose={d.dose}
                      exerciseName={e.name}
                      onChange={(next) => setDraft((prev) => updateDraft(prev, d.exerciseKey, () => next))}
                    />
                  ))}
                </div>
                <label className="block">
                  <span className="text-[13px] font-semibold text-slate-800">A short note for the patient (optional)</span>
                  <textarea
                    value={d.dose.note ?? ""}
                    onChange={(ev) => setDraft((prev) => updateDraft(prev, d.exerciseKey, (dose) => withNote(dose, ev.target.value)))}
                    rows={2}
                    maxLength={DOSE_NOTE_MAX_CHARS + 20}
                    aria-invalid={!!noteIssue}
                    aria-describedby={`note-help-${d.exerciseKey}`}
                    data-testid={`note-${d.exerciseKey}`}
                    placeholder="For example: Keep your back against the chair."
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                  />
                  <span id={`note-help-${d.exerciseKey}`} className={`mt-0.5 block text-[13px] ${noteIssue ? "font-semibold text-red-800" : "text-slate-700"}`}>
                    {noteIssue ?? "One or two short sentences, in plain words. No phone numbers or links."}
                  </span>
                </label>
              </div>
            );
          })}
        </section>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            data-testid="use-plan"
            disabled={publishing || !!problem}
            aria-describedby="use-plan-help"
            onClick={() => onPublish(draft)}
            className="inline-flex min-h-[56px] flex-[2_1_14rem] items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 text-lg font-bold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {publishing && <Spinner />}
            {publishing ? "Saving…" : "Use this plan"}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={publishing}
              className="min-h-[56px] flex-1 basis-[8rem] rounded-xl border border-slate-300 bg-white px-4 text-base font-semibold text-slate-900 hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-60"
            >
              Keep the current plan
            </button>
          )}
        </div>
        <p id="use-plan-help" className="text-[13px] text-slate-700" aria-live="polite">
          {problem ?? "This saves the plan. The patient reads it on their dashboard."}
        </p>
      </div>
    </div>
  );
}
