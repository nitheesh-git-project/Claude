"use client";

import { useId, useMemo, useRef, useState } from "react";
import OverlayPortal from "@/components/system/OverlayPortal";
import Spinner from "@/components/system/Spinner";
import { useDialogChrome } from "@/lib/useDialogChrome";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import { debugNowHeaders } from "@/lib/debugNow";
import { formatClinicDate } from "@/lib/formatDateTime";
import {
  GOAL_TEXT_MAX,
  MILESTONE_CRITERION_MAX,
  MILESTONE_TITLE_MAX,
  type CareGoal,
  type MilestoneInput,
  type MilestoneView,
} from "@/lib/careGoals";
import { MILESTONE_STATUS_LABEL } from "@/lib/milestones";
import { PHASES_BY_PROFILE_KIND } from "@/lib/milestoneTemplates";
import {
  checkGoalDraft,
  checkMilestoneDraft,
  draftFromMilestone,
  draftFromTemplate,
  emptyMilestoneDraft,
  linkSummary,
  linkableMeasures,
  needsProof,
  nextSortOrder,
  proofCandidates,
  suggestedBaseline,
  unusedTemplates,
  type MilestoneDraft,
} from "@/lib/milestonePlanner";
import { outcomeMeasure, type ProfileKind } from "@/lib/outcomeMeasures";
import type { MeasurementPoint } from "@/lib/outcomeSeries";
import { formatReading } from "@/lib/progressChart";
import {
  NETWORK_ERROR_MESSAGE,
  progressErrorMessage,
  readProgressFailure,
  type ProgressAction,
} from "@/lib/progressErrors";

const FIELD =
  "min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";
const BUTTON =
  "min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 transition hover:border-teal-500 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";
const PRIMARY =
  "inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:opacity-60";

type Panel =
  | { kind: "none" }
  | { kind: "new"; draft: MilestoneDraft }
  | { kind: "edit"; view: MilestoneView; draft: MilestoneDraft }
  | { kind: "reach"; view: MilestoneView };

/**
 * The physiotherapist's planner, in the clinician's voice: the patient's goal
 * in their own words with a target date, and the steps towards it.
 *
 *   - **The goal** is one at a time (the table enforces it). Saving a second
 *     is refused with a sentence naming why; a goal is achieved or closed,
 *     never deleted, so its milestones stay as the record.
 *   - **Milestones** start from suggestions for this kind of patient
 *     (`milestoneTemplatesFor`) that fill the form and are edited before
 *     anything is saved, or from a blank. Each has a criterion in words the
 *     patient reads, an optional linked measure (with its side or variant),
 *     a target, a starting point (offered from the latest reading) and a date.
 *   - **Mark reached** is its own action. A milestone with a measurable target
 *     on a recorded measure asks which reading showed it (only readings of
 *     exactly that line that meet the target are offered); one described in
 *     words, or on a measure the Pain Map or exam holds, is reached on your
 *     clinical judgement, and says so. It needs a session you have started.
 *   - A reached milestone is not edited. A mistaken one is reopened by the
 *     clinic with a reason.
 *
 * Both forms are checked with the routes' own validators before the request
 * (`checkGoalDraft`, `checkMilestoneDraft`); the routes' answers are mapped by
 * `progressErrorMessage`, in which a 409 `stale` says to reload, a 503 says
 * we could not check, and `active_goal_exists` explains itself.
 */
export default function GoalMilestonePlanner({
  patientId,
  patientName,
  profileKind,
  goal,
  views,
  measurements,
  enabledLicensed,
  licenceUnreadable = false,
  onClose,
}: {
  patientId: string;
  patientName?: string;
  profileKind: ProfileKind;
  goal: CareGoal | null;
  views: MilestoneView[];
  measurements: MeasurementPoint[];
  enabledLicensed: readonly string[];
  licenceUnreadable?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { show } = useToast();
  const titleId = useId();
  const [panel, setPanel] = useState<Panel>({ kind: "none" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const enabledSet = useMemo(() => new Set(enabledLicensed), [enabledLicensed]);

  const { panelRef, dialogProps } = useDialogChrome({
    onClose: () => {
      if (!busyRef.current) onClose();
    },
    labelledBy: titleId,
  });

  /** One request, one busy flag, one place errors become sentences. */
  async function send(
    what: string,
    url: string,
    body: Record<string, unknown>,
    action: ProgressAction,
    after: { toast: string; clearPanel?: boolean }
  ): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(what);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...debugNowHeaders() },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(progressErrorMessage(await readProgressFailure(res), action));
        return false;
      }
      show(after.toast);
      if (after.clearPanel) setPanel({ kind: "none" });
      router.refresh();
      return true;
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
      return false;
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  const milestones = views.map((v) => v.milestone);
  const name = patientName ? ` for ${patientName}` : "";

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4">
        <div
          ref={panelRef}
          {...dialogProps}
          className="flex h-full w-full flex-col overflow-hidden bg-white shadow-xl sm:h-[92vh] sm:max-w-3xl sm:rounded-2xl"
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-teal-800">Goal and milestones</p>
              <h2 id={titleId} className="font-display text-lg font-bold text-slate-900 [overflow-wrap:anywhere]">
                {patientName ? `Planning with ${patientName}` : "Planning the course of care"}
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                The goal is in the patient{"'"}s own words and is the first thing they see. Moving on follows criteria, not the week number.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!busyRef.current) onClose();
              }}
              aria-label="Close"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              <i aria-hidden className="fa-solid fa-xmark text-lg" />
            </button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4 sm:px-6">
            <GoalEditor
              key={`${goal?.id ?? "new"}:${goal?.updatedAt ?? ""}`}
              goal={goal}
              busy={busy}
              onSave={(g) =>
                send(
                  "goal",
                  "/api/therapist/care-goals/save",
                  {
                    patientId,
                    ...(goal ? { goalId: goal.id, expectedUpdatedAt: goal.updatedAt } : {}),
                    goal: g,
                  },
                  "goal",
                  { toast: goal ? `Goal updated${name}` : `Goal set${name}` }
                )
              }
              onStatus={(status) =>
                goal &&
                send(
                  "goal",
                  "/api/therapist/care-goals/save",
                  { patientId, goalId: goal.id, expectedUpdatedAt: goal.updatedAt, goal: { status } },
                  "goal",
                  { toast: status === "achieved" ? `Goal marked achieved${name}` : `Goal closed${name}` }
                )
              }
              validate={(d) => checkGoalDraft(d, goal)}
              onInvalid={setError}
            />

            {error && (
              <p role="alert" data-form-error className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}

            {goal && goal.status === "active" && (
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-base font-bold text-slate-900">Steps towards the goal</h3>
                  {panel.kind === "none" && (
                    <button
                      type="button"
                      className={BUTTON}
                      onClick={() => {
                        setError(null);
                        setPanel({ kind: "new", draft: emptyMilestoneDraft(nextSortOrder(milestones)) });
                      }}
                    >
                      Add a step
                    </button>
                  )}
                </div>

                {panel.kind === "none" && views.length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-4 text-sm text-slate-600">
                    No steps yet. Add one, or start from the suggestions for this kind of patient.
                  </p>
                )}

                {panel.kind === "none" && (
                  <ul className="space-y-2">
                    {views.map((view) => (
                      <li key={view.milestone.id} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                            {MILESTONE_STATUS_LABEL[view.derived.status]}
                          </span>
                          {view.overdue && <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-800">Past its date</span>}
                          {view.derived.canMarkReached && (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800">Target met</span>
                          )}
                        </div>
                        <p className="mt-1 font-semibold text-slate-900 [overflow-wrap:anywhere]">{view.milestone.title}</p>
                        <p className="text-sm text-slate-700 [overflow-wrap:anywhere]">{view.milestone.criterion}</p>
                        <p className="mt-0.5 text-xs text-slate-600">
                          {[
                            linkSummary(view.milestone),
                            view.milestone.targetDate ? `Target ${formatClinicDate(view.milestone.targetDate)}` : null,
                            view.milestone.phase,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {view.derived.status === "reached" ? (
                          <p className="mt-1 text-xs text-slate-600">
                            Reached {view.milestone.reachedAt ? formatClinicDate(view.milestone.reachedAt) : ""}. It stays as it is;
                            if it was a mistake, ask the clinic to reopen it.
                          </p>
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={BUTTON}
                              onClick={() => {
                                setError(null);
                                setPanel({ kind: "edit", view, draft: draftFromMilestone(view.milestone) });
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className={BUTTON}
                              onClick={() => {
                                setError(null);
                                setPanel({ kind: "reach", view });
                              }}
                            >
                              Mark reached
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {(panel.kind === "new" || panel.kind === "edit") && (
                  <MilestoneForm
                    key={panel.kind === "edit" ? panel.view.milestone.id : "new"}
                    profileKind={profileKind}
                    initial={panel.draft}
                    editing={panel.kind === "edit" ? panel.view : null}
                    milestones={milestones}
                    measurements={measurements}
                    enabledSet={enabledSet}
                    licenceUnreadable={licenceUnreadable}
                    busy={busy === "milestone"}
                    onCancel={() => {
                      setError(null);
                      setPanel({ kind: "none" });
                    }}
                    onInvalid={setError}
                    onSave={(input, draft) =>
                      send(
                        "milestone",
                        "/api/therapist/care-milestones/save",
                        panel.kind === "edit"
                          ? {
                              patientId,
                              action: "update",
                              milestoneId: panel.view.milestone.id,
                              milestone: input,
                              expectedUpdatedAt: panel.view.milestone.updatedAt,
                            }
                          : { patientId, action: "create", goalId: goal.id, milestone: input },
                        "milestone",
                        { toast: `Step "${draft.title.trim()}" ${panel.kind === "edit" ? "updated" : "added"}`, clearPanel: true }
                      )
                    }
                  />
                )}

                {panel.kind === "reach" && (
                  <ReachPanel
                    view={panel.view}
                    profileKind={profileKind}
                    measurements={measurements}
                    busy={busy === "reach"}
                    onCancel={() => {
                      setError(null);
                      setPanel({ kind: "none" });
                    }}
                    onConfirm={(measurementId) =>
                      send(
                        "reach",
                        "/api/therapist/care-milestones/save",
                        {
                          patientId,
                          action: "mark_reached",
                          milestoneId: panel.view.milestone.id,
                          ...(measurementId ? { measurementId } : {}),
                        },
                        "reached",
                        { toast: `"${panel.view.milestone.title}" marked reached`, clearPanel: true }
                      )
                    }
                  />
                )}
              </section>
            )}

            {goal && goal.status !== "active" && (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                This goal is {goal.status === "achieved" ? "achieved" : "closed"}. Its steps stay as the record of what was
                planned and reached. Set a new goal to plan further steps.
              </p>
            )}
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}

// --- The goal ---------------------------------------------------------------------------------------------

function GoalEditor({
  goal,
  busy,
  onSave,
  onStatus,
  validate,
  onInvalid,
}: {
  goal: CareGoal | null;
  busy: string | null;
  onSave: (g: { goalText: string; targetDate: string | null }) => Promise<boolean>;
  onStatus: (status: "achieved" | "closed") => Promise<boolean> | false | null;
  validate: (d: { goalText: string; targetDate: string }) => { ok: true; goal: { goalText: string; targetDate: string | null } } | { ok: false; error: string };
  onInvalid: (message: string) => void;
}) {
  const [text, setText] = useState(goal?.goalText ?? "");
  const [date, setDate] = useState(goal?.targetDate ?? "");
  const [confirming, setConfirming] = useState<"achieved" | "closed" | null>(null);
  const textId = useId();
  const dateId = useId();
  const saving = busy === "goal";
  const readOnly = goal !== null && goal.status !== "active";
  const unchanged = goal !== null && text.trim() === goal.goalText && (date || null) === goal.targetDate;

  return (
    <section className="space-y-3">
      <h3 className="font-display text-base font-bold text-slate-900">The goal</h3>
      <div>
        <label htmlFor={textId} className="block text-sm font-semibold text-slate-900">
          In the patient{"'"}s own words
        </label>
        <textarea
          id={textId}
          rows={3}
          maxLength={GOAL_TEXT_MAX}
          readOnly={readOnly}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Play badminton with my friends on weekends again"
          aria-describedby={`${textId}-hint`}
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-base text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 read-only:bg-slate-50"
        />
        <p id={`${textId}-hint`} className="mt-1 text-xs text-slate-600">
          Ask what they want to be able to do, and keep their wording. {text.trim().length} of {GOAL_TEXT_MAX}.
        </p>
      </div>
      <div>
        <label htmlFor={dateId} className="block text-sm font-semibold text-slate-900">
          Aiming for (optional)
        </label>
        <input
          id={dateId}
          type="date"
          readOnly={readOnly}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={`mt-1 max-w-[14rem] ${FIELD}`}
        />
        {goal?.targetDate && date === goal.targetDate && <p className="mt-1 text-xs text-slate-600">{formatClinicDate(goal.targetDate)}</p>}
      </div>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={saving || unchanged}
            className={PRIMARY}
            onClick={() => {
              const checked = validate({ goalText: text, targetDate: date });
              if (!checked.ok) {
                onInvalid(checked.error);
                return;
              }
              void onSave(checked.goal);
            }}
          >
            {saving && <Spinner />}
            {saving ? "Saving…" : goal ? "Save changes" : "Set the goal"}
          </button>
          {unchanged && <span className="text-xs text-slate-600">No changes to save.</span>}
          {goal &&
            (confirming ? (
              <>
                <span className="text-sm text-slate-800">
                  {confirming === "achieved" ? "Mark this goal achieved?" : "Close this goal without achieving it?"}
                </span>
                <button
                  type="button"
                  className={BUTTON}
                  onClick={() => {
                    const status = confirming;
                    setConfirming(null);
                    void onStatus(status);
                  }}
                >
                  Yes
                </button>
                <button type="button" className={BUTTON} onClick={() => setConfirming(null)}>
                  No
                </button>
              </>
            ) : (
              <>
                <button type="button" className={BUTTON} onClick={() => setConfirming("achieved")}>
                  Mark achieved
                </button>
                <button type="button" className={BUTTON} onClick={() => setConfirming("closed")}>
                  Close goal
                </button>
              </>
            ))}
        </div>
      )}
    </section>
  );
}

// --- A milestone ------------------------------------------------------------------------------------------

function MilestoneForm({
  profileKind,
  initial,
  editing,
  milestones,
  measurements,
  enabledSet,
  licenceUnreadable,
  busy,
  onCancel,
  onInvalid,
  onSave,
}: {
  profileKind: ProfileKind;
  initial: MilestoneDraft;
  editing: MilestoneView | null;
  milestones: MilestoneView["milestone"][];
  measurements: MeasurementPoint[];
  enabledSet: ReadonlySet<string>;
  licenceUnreadable: boolean;
  busy: boolean;
  onCancel: () => void;
  onInvalid: (message: string) => void;
  onSave: (input: MilestoneInput, draft: MilestoneDraft) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<MilestoneDraft>(initial);
  const id = useId();
  const links = useMemo(
    () => linkableMeasures(profileKind, { enabledLicensed: enabledSet, licenceUnreadable }),
    [profileKind, enabledSet, licenceUnreadable]
  );
  const templates = useMemo(() => unusedTemplates(profileKind, milestones), [profileKind, milestones]);
  const measure = draft.linkedMeasureKey ? outcomeMeasure(draft.linkedMeasureKey) : null;
  const heldElsewhere = links.find((l) => l.measure.key === draft.linkedMeasureKey)?.heldElsewhere ?? false;
  const phases = PHASES_BY_PROFILE_KIND[profileKind];

  function patch(next: Partial<MilestoneDraft>) {
    setDraft((d) => ({ ...d, ...next }));
  }

  /** Changing the link resets what belonged to the old one and offers the
   *  latest reading of the new line as the starting point. */
  function relink(next: Partial<Pick<MilestoneDraft, "linkedMeasureKey" | "linkedVariant" | "linkedSide">>) {
    setDraft((d) => {
      const measureChanged = next.linkedMeasureKey !== undefined && next.linkedMeasureKey !== d.linkedMeasureKey;
      const merged = {
        ...d,
        ...(measureChanged ? { linkedVariant: "", linkedSide: "" as const, targetText: "", baselineText: "" } : {}),
        ...next,
      };
      if (!merged.linkedMeasureKey) return { ...merged, linkedVariant: "", linkedSide: "", targetText: "", baselineText: "" };
      const m = outcomeMeasure(merged.linkedMeasureKey);
      const lineReady = (!m?.variants || merged.linkedVariant) && (!m?.sided || merged.linkedSide);
      const baseline = lineReady
        ? suggestedBaseline(measurements, { measureKey: merged.linkedMeasureKey, variant: merged.linkedVariant, side: merged.linkedSide })
        : null;
      return { ...merged, baselineText: baseline !== null && (measureChanged || next.linkedVariant !== undefined || next.linkedSide !== undefined) ? String(baseline) : merged.baselineText };
    });
  }

  return (
    <form
      className="space-y-4 rounded-2xl border border-teal-200 bg-teal-50/30 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const checked = checkMilestoneDraft(draft, {
          profileKind,
          existing: editing?.milestone ?? null,
          enabledLicensed: enabledSet,
        });
        if (!checked.ok) {
          onInvalid(checked.error);
          return;
        }
        void onSave(checked.input, draft);
      }}
    >
      <h4 className="font-display text-base font-bold text-slate-900">{editing ? "Edit this step" : "A new step"}</h4>

      {!editing && templates.length > 0 && (
        <fieldset>
          <legend className="text-sm font-semibold text-slate-900">Start from a suggestion</legend>
          <p className="text-xs text-slate-600">
            These are starting points for this kind of patient. Each fills the form below, and you edit it before saving.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {templates.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => setDraft(draftFromTemplate(t, draft.sortOrder))}
                  aria-pressed={draft.templateKey === t.key}
                  title={t.criterion}
                  className={`min-h-[44px] rounded-xl border px-3 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                    draft.templateKey === t.key ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-800 hover:border-teal-500"
                  }`}
                >
                  {t.title}
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      <div>
        <label htmlFor={`${id}-title`} className="block text-sm font-semibold text-slate-900">
          The step, in words the patient reads
        </label>
        <input
          id={`${id}-title`}
          type="text"
          maxLength={MILESTONE_TITLE_MAX}
          value={draft.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="Stairs step-over-step"
          className={`mt-1 ${FIELD}`}
        />
      </div>
      <div>
        <label htmlFor={`${id}-criterion`} className="block text-sm font-semibold text-slate-900">
          What counts as reaching it
        </label>
        <input
          id={`${id}-criterion`}
          type="text"
          maxLength={MILESTONE_CRITERION_MAX}
          value={draft.criterion}
          onChange={(e) => patch({ criterion: e.target.value })}
          placeholder="One flight, no rail, pain under 3"
          className={`mt-1 ${FIELD}`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-phase`} className="block text-sm font-semibold text-slate-900">
            Phase of care
          </label>
          <select id={`${id}-phase`} value={draft.phase} onChange={(e) => patch({ phase: e.target.value })} className={`mt-1 ${FIELD}`}>
            <option value="">Not set</option>
            {phases.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-status`} className="block text-sm font-semibold text-slate-900">
            Where it is now
          </label>
          <select
            id={`${id}-status`}
            value={draft.status}
            onChange={(e) => patch({ status: e.target.value === "working" ? "working" : "planned" })}
            className={`mt-1 ${FIELD}`}
          >
            <option value="planned">{MILESTONE_STATUS_LABEL.planned}</option>
            <option value="working">{MILESTONE_STATUS_LABEL.working}</option>
          </select>
          <p className="mt-1 text-xs text-slate-600">Reached has its own button, so the proof travels with it.</p>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <label htmlFor={`${id}-measure`} className="block text-sm font-semibold text-slate-900">
            Linked measure (optional)
          </label>
          <select
            id={`${id}-measure`}
            value={draft.linkedMeasureKey}
            onChange={(e) => relink({ linkedMeasureKey: e.target.value })}
            className={`mt-1 ${FIELD}`}
          >
            <option value="">None - described in words</option>
            {links.map(({ measure: m, selectable, reason }) => (
              <option key={m.key} value={m.key} disabled={!selectable}>
                {m.label}
                {reason ? ` - ${reason}` : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-600">
            A linked measure lets the app show progress and suggest when the step is reached. Measures with no better or worse (a
            stage, a classification) are described in words.
          </p>
        </div>

        {measure?.variants && (
          <div>
            <label htmlFor={`${id}-variant`} className="block text-sm font-semibold text-slate-900">
              Which one?
            </label>
            <select id={`${id}-variant`} value={draft.linkedVariant} onChange={(e) => relink({ linkedVariant: e.target.value })} className={`mt-1 ${FIELD}`}>
              <option value="">Choose</option>
              {measure.variants.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {measure?.sided && (
          <div>
            <label htmlFor={`${id}-side`} className="block text-sm font-semibold text-slate-900">
              Which side?
            </label>
            <select
              id={`${id}-side`}
              value={draft.linkedSide}
              onChange={(e) => relink({ linkedSide: e.target.value === "left" ? "left" : e.target.value === "right" ? "right" : "" })}
              className={`mt-1 ${FIELD}`}
            >
              <option value="">Choose</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
            <p className="mt-1 text-xs text-slate-600">A right-side step is never met by a left-side reading.</p>
          </div>
        )}

        {measure && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-target`} className="block text-sm font-semibold text-slate-900">
                Target ({measure.unit})
              </label>
              <input
                id={`${id}-target`}
                type="number"
                inputMode="decimal"
                step="any"
                value={draft.targetText}
                onChange={(e) => patch({ targetText: e.target.value })}
                className={`mt-1 ${FIELD}`}
              />
              <p className="mt-1 text-xs text-slate-600">
                {measure.better === "lower" ? "Lower is better: the target is met at or below this." : measure.better === "higher" ? "Higher is better: the target is met at or above this." : "Closer to the usual range is better: give the starting point too."}
              </p>
            </div>
            <div>
              <label htmlFor={`${id}-baseline`} className="block text-sm font-semibold text-slate-900">
                Starting point
              </label>
              <input
                id={`${id}-baseline`}
                type="number"
                inputMode="decimal"
                step="any"
                value={draft.baselineText}
                onChange={(e) => patch({ baselineText: e.target.value })}
                className={`mt-1 ${FIELD}`}
              />
              <p className="mt-1 text-xs text-slate-600">Filled from the latest reading when there is one. It sets the progress bar.</p>
            </div>
          </div>
        )}
        {heldElsewhere && (
          <p className="text-xs font-semibold text-amber-900">
            This measure is recorded on the Pain Map or in the neurological examination, so this step is marked reached on your
            clinical judgement, with no measurement attached.
          </p>
        )}
      </div>

      <div>
        <label htmlFor={`${id}-date`} className="block text-sm font-semibold text-slate-900">
          Target date (optional)
        </label>
        <input
          id={`${id}-date`}
          type="date"
          value={draft.targetDate}
          onChange={(e) => patch({ targetDate: e.target.value })}
          className={`mt-1 max-w-[14rem] ${FIELD}`}
        />
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={BUTTON} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" disabled={busy} className={PRIMARY}>
          {busy && <Spinner />}
          {busy ? "Saving…" : editing ? "Save changes" : "Add the step"}
        </button>
      </div>
    </form>
  );
}

// --- Marking reached --------------------------------------------------------------------------------------

function ReachPanel({
  view,
  profileKind,
  measurements,
  busy,
  onCancel,
  onConfirm,
}: {
  view: MilestoneView;
  profileKind: ProfileKind;
  measurements: MeasurementPoint[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (measurementId: string | null) => void;
}) {
  const { milestone } = view;
  const proof = needsProof(milestone, profileKind);
  const candidates = useMemo(() => (proof ? proofCandidates(milestone, measurements) : []), [proof, milestone, measurements]);
  const [picked, setPicked] = useState<string | null>(candidates[0]?.id ?? null);
  const measure = milestone.linkedMeasureKey ? outcomeMeasure(milestone.linkedMeasureKey) : null;
  const reading = (v: number) => (measure ? formatReading(v, measure.decimals, measure.unit) : String(v));
  const groupId = useId();

  return (
    <div className="space-y-3 rounded-2xl border border-teal-200 bg-teal-50/30 p-4">
      <h4 className="font-display text-base font-bold text-slate-900 [overflow-wrap:anywhere]">Mark {"“"}{milestone.title}{"”"} reached</h4>
      {proof ? (
        candidates.length > 0 ? (
          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">
              Which reading showed it? (target {reading(milestone.targetValue!)})
            </legend>
            <ul className="mt-2 space-y-1.5">
              {candidates.map((p) => (
                <li key={p.id}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800">
                    <input
                      type="radio"
                      name={groupId}
                      checked={picked === p.id}
                      onChange={() => setPicked(p.id)}
                      className="h-4 w-4 accent-teal-700"
                    />
                    <span>
                      <span className="font-semibold">{reading(p.value)}</span> on {formatClinicDate(p.measuredAt)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-slate-600">The step is dated at that reading, and the reading is kept as its proof.</p>
          </fieldset>
        ) : (
          <p role="status" className="rounded-xl bg-white px-3 py-2 text-sm text-slate-800">
            No recorded reading of this measure meets the target yet. Record one in a session first; this step is reached when a
            reading shows it.
          </p>
        )
      ) : (
        <p className="rounded-xl bg-white px-3 py-2 text-sm text-slate-800">
          {milestone.linkedMeasureKey
            ? "This measure is not stored as a measurement here, so this step is marked reached on your clinical judgement, with no reading attached."
            : "This step is described in words, so it is marked reached on your clinical judgement, with no reading attached."}
        </p>
      )}
      <p className="text-xs text-slate-600">Reaching a step is recorded from a session you have started with this patient. It cannot be edited afterwards; the clinic can reopen it with a reason.</p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={BUTTON} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={PRIMARY}
          disabled={busy || (proof && !picked)}
          onClick={() => onConfirm(proof ? picked : null)}
        >
          {busy && <Spinner />}
          {busy ? "Saving…" : proof ? "Mark reached with this reading" : "Mark reached on my judgement"}
        </button>
      </div>
      {proof && candidates.length === 0 && <p className="text-xs text-slate-600">Marking is off until a reading meets the target.</p>}
    </div>
  );
}
