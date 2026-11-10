"use client";

import { subjectWords, type ProfileSubject } from "@/lib/childVoice";
import { useState, type ReactNode } from "react";
import ReopenMilestoneDialog from "@/components/profile/progress/ReopenMilestoneDialog";
import { formatClinicDate } from "@/lib/formatDateTime";
import type { CareGoal, MilestoneView } from "@/lib/careGoals";
import { MILESTONE_STATUS_LABEL, milestoneCounts, type MilestoneStatus } from "@/lib/milestones";
import { outcomeMeasure } from "@/lib/outcomeMeasures";
import type { MeasurementPoint } from "@/lib/outcomeSeries";
import { formatReading } from "@/lib/progressChart";
import type { Voice } from "@/lib/progressView";

const BADGE: Record<MilestoneStatus, string> = {
  reached: "bg-emerald-50 text-emerald-800",
  working: "bg-amber-50 text-amber-800",
  planned: "bg-slate-100 text-slate-700",
};

/**
 * The patient's goal, in their own words, and the steps towards it: one card
 * per milestone, reached first, then the one being worked on, then planned.
 * `views` is `shapeMilestones()` output, so progress, "criterion met" and
 * overdue come from the maths in milestones.ts, not from here.
 *
 *   - A reached card says when, and what showed it: the proving measurement
 *     (`measurements` is the record to look it up in) or "on clinical
 *     judgement" for a milestone described in words.
 *   - A working card carries its percentage bar only when there is an honest
 *     figure (a lower-is-better target with no baseline has none).
 *   - A card whose linked reading already meets the target says so, and a
 *     clinician is pointed to Mark reached; a patient is told their
 *     physiotherapist confirms it - the app never marks one on its own.
 *
 * `renderActions` is where the planner puts Edit / Mark reached. `reopen` is
 * passed only for an admin whose scope can call the route; it adds "Reopen"
 * to reached cards.
 */
export default function MilestoneCards({
  goal,
  views,
  voice,
  subject = "self",
  measurements = [],
  loadFailed = false,
  renderActions,
  reopen,
  onSetGoal,
}: {
  goal: CareGoal | null;
  views: MilestoneView[];
  voice: Voice;
  /** Who the patient-voice sentences are about (childVoice.ts): "child" speaks to a parent ("your child's ..."). */
  subject?: ProfileSubject;
  measurements?: MeasurementPoint[];
  loadFailed?: boolean;
  renderActions?: (view: MilestoneView) => ReactNode;
  reopen?: { patientId: string };
  /** Passed only to a clinician who may use the planner: the empty goal card
   *  then offers "Set a goal". Anyone else (an admin has no planner) reads
   *  plain text. */
  onSetGoal?: () => void;
}) {
  const clinician = voice === "clinician";
  const w = subjectWords(subject, voice);
  const [reopening, setReopening] = useState<MilestoneView | null>(null);

  if (loadFailed) {
    return (
      <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-semibold">
          {clinician ? "We couldn't load the goal and milestones just now." : w("We couldn't load your goal just now.")}
        </p>
        <p className="mt-0.5 text-xs">Nothing is lost - this is a problem reading the record, not an empty one.</p>
      </div>
    );
  }

  const counts = milestoneCounts(views.map((v) => v.milestone));
  const total = views.length;
  const reachedPercent = total === 0 ? 0 : Math.round((counts.reached / total) * 100);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-teal-800">{clinician ? "Patient's goal" : w("Your goal")}</p>
        {goal ? (
          <>
            <p className="mt-1 font-display text-lg font-bold leading-snug text-slate-900 [overflow-wrap:anywhere] sm:text-xl">
              {"“"}
              {goal.goalText}
              {"”"}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {goal.targetDate ? `Aiming for ${formatClinicDate(goal.targetDate)}` : "No target date yet"}
              {goal.status !== "active" && ` · ${goal.status === "achieved" ? "Achieved" : "Closed"}`}
            </p>
          </>
        ) : (
          <div className="mt-1 space-y-3">
            <p className="text-sm text-slate-700">
              {!clinician
                ? w("Your physiotherapist will set your goal with you, in your own words, at your next visit.")
                : onSetGoal
                  ? "No goal is set. Ask the patient what they want to be able to do, and write it in their words."
                  : "No goal set yet"}
            </p>
            {clinician && onSetGoal && (
              <button
                type="button"
                onClick={onSetGoal}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 sm:w-auto print:hidden"
              >
                <i aria-hidden className="fa-solid fa-bullseye text-xs" />
                Set a goal
              </button>
            )}
          </div>
        )}
      </div>

      {total > 0 && (
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-sm font-semibold text-slate-900">
              {counts.reached} of {total} {total === 1 ? "step" : "steps"} reached
            </p>
            <p className="text-xs text-slate-600">
              {counts.working} working on it · {counts.planned} planned
            </p>
          </div>
          <div
            role="progressbar"
            aria-label="Steps reached"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={reachedPercent}
            className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-slate-200"
          >
            <div className="h-full bg-emerald-600" style={{ width: `${(counts.reached / total) * 100}%` }} />
            <div className="h-full bg-amber-500" style={{ width: `${(counts.working / total) * 100}%` }} />
          </div>
        </div>
      )}

      {total === 0 ? (
        goal && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-5 text-sm text-slate-600">
            {clinician
              ? "No steps are planned yet. Add milestones, or start from a template for this kind of patient."
              : w("Your physiotherapist will plan the steps towards your goal here.")}
          </p>
        )
      ) : (
        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {views.map((view) => (
            <MilestoneCard
              key={view.milestone.id}
              view={view}
              voice={voice}
              subject={subject}
              measurements={measurements}
              actions={renderActions?.(view)}
              onReopen={reopen && view.derived.status === "reached" ? () => setReopening(view) : undefined}
            />
          ))}
        </ol>
      )}

      {reopening && reopen && (
        <ReopenMilestoneDialog
          patientId={reopen.patientId}
          milestoneId={reopening.milestone.id}
          milestoneTitle={reopening.milestone.title}
          onClose={() => setReopening(null)}
        />
      )}
    </div>
  );
}

function MilestoneCard({
  view,
  voice,
  subject,
  measurements,
  actions,
  onReopen,
}: {
  view: MilestoneView;
  voice: Voice;
  subject?: ProfileSubject;
  measurements: MeasurementPoint[];
  actions?: ReactNode;
  onReopen?: () => void;
}) {
  const { milestone, derived, overdue } = view;
  const clinician = voice === "clinician";
  const w = subjectWords(subject, voice);
  const status = derived.status;
  const measure = milestone.linkedMeasureKey ? outcomeMeasure(milestone.linkedMeasureKey) : null;
  const reading = (v: number) => (measure ? formatReading(v, measure.decimals, measure.unit) : String(v));

  const proof = milestone.reachedMeasurementId ? measurements.find((m) => m.id === milestone.reachedMeasurementId) : undefined;
  const reachedWhen = milestone.reachedAt ? formatClinicDate(milestone.reachedAt) : null;

  return (
    <li className={`flex min-w-0 flex-col gap-2 rounded-2xl border p-4 ${status === "planned" ? "border-slate-200 bg-slate-50/50" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${BADGE[status]}`}>{MILESTONE_STATUS_LABEL[status]}</span>
        {overdue && <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-800">Past its date</span>}
      </div>
      <h4 className="font-display text-base font-bold leading-snug text-slate-900 [overflow-wrap:anywhere]">{milestone.title}</h4>
      <p className="text-sm text-slate-700 [overflow-wrap:anywhere]">{milestone.criterion}</p>

      {status === "reached" ? (
        <p className="text-xs text-slate-600">
          {reachedWhen ? `Reached ${reachedWhen}` : "Reached"}
          {proof && measure
            ? ` · shown by ${reading(proof.value)} on ${formatClinicDate(proof.measuredAt)}`
            : milestone.reachedMeasurementId
              ? " · shown by a recorded measurement"
              : clinician
                ? " · on clinical judgement"
                : w(" · confirmed by your physiotherapist")}
        </p>
      ) : (
        <>
          {status === "working" && derived.percent !== null && (
            <div>
              <div
                role="progressbar"
                aria-label={`${milestone.title}: progress towards the target`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={derived.percent}
                className="h-2 rounded-full bg-slate-200"
              >
                <div className="h-2 rounded-full bg-amber-500" style={{ width: `${derived.percent}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-600">
                {derived.percent}% of the way{derived.latest ? ` · now ${reading(derived.latest.value)}` : ""}
                {milestone.targetValue !== null && measure ? ` · target ${reading(milestone.targetValue)}` : ""}
              </p>
            </div>
          )}
          {status === "planned" && measure && milestone.targetValue !== null && (
            <p className="text-xs text-slate-600">Target {reading(milestone.targetValue)}</p>
          )}
          {derived.canMarkReached && (
            <p className="text-xs font-semibold text-emerald-800">
              {clinician
                ? `The latest reading${derived.provedBy ? ` (${reading(derived.provedBy.value)})` : ""} meets this target. You can mark it reached.`
                : w("Your latest reading meets this target. Your physiotherapist will confirm it.")}
            </p>
          )}
          {milestone.targetDate && (
            <p className={`text-xs ${overdue ? "font-semibold text-red-800" : "text-slate-600"}`}>
              Target {formatClinicDate(milestone.targetDate)}
            </p>
          )}
        </>
      )}

      {(actions || onReopen) && (
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {actions}
          {onReopen && (
            <button
              type="button"
              onClick={onReopen}
              className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:border-teal-500 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              Reopen
            </button>
          )}
        </div>
      )}
    </li>
  );
}
