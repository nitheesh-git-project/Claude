"use client";

import { useId, useMemo, useRef, useState } from "react";
import OverlayPortal from "@/components/system/OverlayPortal";
import Spinner from "@/components/system/Spinner";
import DateField from "@/components/system/DateField";
import { useDialogChrome } from "@/lib/useDialogChrome";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import { debugNowHeaders, getDebugNowOffsetMs } from "@/lib/debugNow";
import { formatClinicDate } from "@/lib/formatDateTime";
import {
  GMFCS_LEVELS,
  PEDS_EQUIPMENT_MAX,
  PEDS_MILESTONES,
  PEDS_MILESTONE_STATUSES,
  PEDS_NOTES_MAX,
  PEDS_OBSERVATION_SOURCES,
  validatePedsFindings,
  type ParsedPedsAssessment,
} from "@/lib/pedsExam";
import { pedsTodayIso } from "@/lib/pedsAge";
import {
  assessedCount,
  emptyPedsForm,
  isPedsFormDirty,
  lastTimeLine,
  pedsExamErrorMessage,
  pedsFormToRaw,
  setMilestone,
  type PedsFormState,
} from "@/lib/pedsExamForm";

const SEGMENTS: {
  value: PedsFormState["milestones"][keyof PedsFormState["milestones"]]["status"];
  label: string;
  meaning: string;
}[] = [
  {
    value: "",
    label: "Not assessed",
    meaning: "Nobody looked for this today. It is not the same as not yet.",
  },
  ...PEDS_MILESTONE_STATUSES.map((s) => ({
    value: s.key,
    label: s.label,
    meaning: s.meaning,
  })),
];

/**
 * Recording one paediatric examination on a surface of its own - the
 * neurological dialog's pattern, sized for what this chart is: six WHO
 * milestones, the GMFCS level, equipment and a note.
 *
 * "Not assessed" is the first choice of every milestone and a choice like any
 * other: not looked at and not yet there are different facts on a record. An
 * emerging or achieved milestone says who saw it (the physiotherapist, in a
 * session or on a parent's video, or the family reported it); an achieved one
 * says when it was first seen, and a parent's recollection can be marked
 * approximate - a date the physiotherapist saw is exact. Every choice is
 * rendered from the tables the validator reads, and the whole form is checked
 * with the same `validatePedsFindings` the route runs before the round trip.
 * Standing time and steps are not here: they are Record a test.
 */
export default function PedsExamDialog({
  endpoint,
  patientId,
  patientName,
  previous,
  onClose,
  onSaved,
}: {
  endpoint: string;
  patientId: string;
  patientName?: string;
  previous: ParsedPedsAssessment | null;
  onClose: () => void;
  /** Called after a successful save, before the dialog closes (the session
   *  step reloads its own read). */
  onSaved?: () => void;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [form, setForm] = useState<PedsFormState>(emptyPedsForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const savingRef = useRef(false);
  const titleId = useId();
  const idBase = useId();

  const dirty = isPedsFormDirty(form);
  const assessed = useMemo(() => assessedCount(form), [form]);

  function requestClose() {
    if (saving) return;
    if (dirty && !confirmingDiscard) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  }

  const { panelRef, dialogProps } = useDialogChrome({
    onClose: requestClose,
    labelledBy: titleId,
  });

  function edit(next: PedsFormState) {
    setConfirmingDiscard(false);
    setError(null);
    setForm(next);
  }

  async function save() {
    if (savingRef.current) return;
    setConfirmingDiscard(false);
    // The clinic's day on the debug bar's simulated clock, exactly as the
    // route judges it; the date of birth is the server's to check.
    const checked = validatePedsFindings(pedsFormToRaw(form), {
      todayIso: pedsTodayIso(Date.now() + getDebugNowOffsetMs()),
      birthDate: null,
    });
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...debugNowHeaders() },
        body: JSON.stringify({ patientId, findings: checked.findings }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(pedsExamErrorMessage(res.status, data));
        return;
      }
      show(
        `Paediatric examination saved${patientName ? ` for ${patientName}` : ""}`,
      );
      onSaved?.();
      onClose();
      router.refresh();
    } catch {
      setError(
        "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const fieldClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4">
        <div
          ref={panelRef}
          {...dialogProps}
          data-testid="peds-exam-dialog"
          className="flex h-full w-full flex-col overflow-hidden bg-white shadow-xl sm:h-[92vh] sm:max-w-3xl sm:rounded-2xl"
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-violet-700">
                Paediatric examination
              </p>
              <h2
                id={titleId}
                className="font-display text-lg font-bold text-slate-900 [overflow-wrap:anywhere]"
              >
                {patientName
                  ? `Examining ${patientName}`
                  : "Recording an examination"}
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                {previous
                  ? `Last recorded ${formatClinicDate(previous.createdAt)}. Each examination is a new entry; earlier ones are never edited.`
                  : "The first examination. Each one is a new entry, so the next can show what changed."}
              </p>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
              className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              <i aria-hidden className="fa-solid fa-xmark" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-700">
              Mark only what you looked for today. Standing time and independent
              steps are not here - they are timed with three tries in Record a
              test.
            </p>

            <ol className="space-y-3">
              {PEDS_MILESTONES.map((milestone) => {
                const m = form.milestones[milestone.key];
                const id = `${idBase}-${milestone.key}`;
                const last = lastTimeLine(previous, milestone.key);
                const needsWho =
                  m.status === "emerging" || m.status === "achieved";
                return (
                  <li
                    key={milestone.key}
                    data-milestone={milestone.key}
                    className="rounded-xl border border-slate-200 p-3.5 sm:p-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <h3 className="font-display text-sm font-bold text-slate-900">
                        {milestone.label}
                      </h3>
                      {last && (
                        <span className="text-[11px] text-violet-700">
                          Last time: {last}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-700">
                      <span className="font-semibold">
                        Counts as reached when:
                      </span>{" "}
                      {milestone.reachedWhen.replace(/\.?$/, ".")} Most
                      children: {milestone.windowMonths[0]} to{" "}
                      {milestone.windowMonths[1]} months.
                    </p>

                    <div
                      role="radiogroup"
                      aria-label={`${milestone.label}: finding`}
                      className="mt-2.5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:grid-cols-4"
                    >
                      {SEGMENTS.map((seg) => {
                        const checked = m.status === seg.value;
                        return (
                          <button
                            key={seg.label}
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            title={seg.meaning}
                            onClick={() =>
                              edit(
                                setMilestone(form, milestone.key, {
                                  status: seg.value,
                                }),
                              )
                            }
                            className={`min-h-[44px] rounded-lg px-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                              checked
                                ? seg.value === ""
                                  ? "bg-white text-slate-700 shadow-sm"
                                  : "bg-teal-700 text-white shadow-sm"
                                : "text-slate-700 hover:bg-white/70"
                            }`}
                          >
                            {seg.label}
                          </button>
                        );
                      })}
                    </div>

                    {needsWho && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <fieldset className="min-w-0">
                          <legend className="mb-1 text-xs font-semibold text-slate-800">
                            Who saw it
                          </legend>
                          <div className="grid gap-1.5">
                            {PEDS_OBSERVATION_SOURCES.map((src) => {
                              const checked = m.source === src.key;
                              return (
                                <label
                                  key={src.key}
                                  className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm focus-within:ring-2 focus-within:ring-teal-600 ${
                                    checked
                                      ? "border-teal-700 bg-teal-50 text-slate-900"
                                      : "border-slate-200 text-slate-700 hover:border-teal-400"
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={`${id}-who`}
                                    checked={checked}
                                    onChange={() =>
                                      edit(
                                        setMilestone(form, milestone.key, {
                                          source: src.key,
                                        }),
                                      )
                                    }
                                    className="h-4 w-4 accent-teal-700"
                                  />
                                  {src.label}
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>
                        <div className="min-w-0">
                          <DateField
                            id={`${id}-date`}
                            label={
                              m.status === "achieved"
                                ? "Date first seen"
                                : "Date first seen (optional)"
                            }
                            value={m.date}
                            onChange={(date) =>
                              edit(setMilestone(form, milestone.key, { date }))
                            }
                            maxToday
                            clearable={m.status !== "achieved"}
                            placeholder="Choose a date"
                            dialogTitle={`${milestone.label}: date first seen`}
                          />
                          {m.source === "reported" && (
                            <label className="mt-2 flex min-h-[44px] cursor-pointer items-start gap-2 text-xs leading-snug text-slate-800">
                              <input
                                type="checkbox"
                                checked={m.approximate}
                                disabled={!m.date}
                                onChange={(e) =>
                                  edit(
                                    setMilestone(form, milestone.key, {
                                      approximate: e.target.checked,
                                    }),
                                  )
                                }
                                className="mt-0.5 h-5 w-5 shrink-0 accent-teal-700"
                              />
                              <span>
                                The date is approximate
                                <span className="block text-slate-600">
                                  {m.date
                                    ? "The parent recalls it roughly. It is shown as “about”."
                                    : "Choose a date first."}
                                </span>
                              </span>
                            </label>
                          )}
                          {m.source === "seen" && m.date && (
                            <p className="mt-2 text-xs text-slate-600">
                              A date you saw is exact.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>

            <section
              aria-label="Gross motor classification"
              className="mt-5 rounded-xl border border-slate-200 p-3.5 sm:p-4"
            >
              <label
                htmlFor={`${idBase}-gmfcs`}
                className="font-display text-sm font-bold text-slate-900"
              >
                GMFCS level
              </label>
              <p className="mt-0.5 text-xs text-slate-700">
                For a child with cerebral palsy. It describes usual mobility; it
                is not a score that goes up or down.
              </p>
              <select
                id={`${idBase}-gmfcs`}
                value={form.gmfcs}
                onChange={(e) =>
                  edit({
                    ...form,
                    gmfcs: e.target.value as PedsFormState["gmfcs"],
                  })
                }
                className={`mt-2 min-h-[44px] ${fieldClass}`}
              >
                <option value="">Not recorded / not applicable</option>
                {GMFCS_LEVELS.map((g) => (
                  <option key={g.value} value={String(g.value)}>
                    {g.label} - {g.meaning}
                  </option>
                ))}
              </select>
              {previous?.findings.gmfcsLevel !== undefined && (
                <p className="mt-1 text-[11px] text-violet-700">
                  Last time: Level{" "}
                  {
                    ["I", "II", "III", "IV", "V"][
                      previous.findings.gmfcsLevel - 1
                    ]
                  }
                </p>
              )}
            </section>

            <section
              aria-label="Equipment"
              className="mt-3 rounded-xl border border-slate-200 p-3.5 sm:p-4"
            >
              <label
                htmlFor={`${idBase}-equipment`}
                className="font-display text-sm font-bold text-slate-900"
              >
                Orthoses and equipment
              </label>
              <p className="mt-0.5 text-xs text-slate-700">
                Braces, splints, walkers, wheelchair, footwear - and whether
                they still fit.
              </p>
              <input
                id={`${idBase}-equipment`}
                type="text"
                maxLength={PEDS_EQUIPMENT_MAX}
                value={form.equipment}
                onChange={(e) => edit({ ...form, equipment: e.target.value })}
                className={`mt-2 min-h-[44px] ${fieldClass}`}
              />
              {previous?.findings.equipment && (
                <p className="mt-1 text-[11px] text-violet-700 [overflow-wrap:anywhere]">
                  Last time: {previous.findings.equipment}
                </p>
              )}
            </section>

            <section
              aria-label="Clinical notes"
              className="mt-3 rounded-xl border border-slate-200 p-3.5 sm:p-4"
            >
              <label
                htmlFor={`${idBase}-notes`}
                className="font-display text-sm font-bold text-slate-900"
              >
                Clinical notes
              </label>
              <p className="mt-0.5 text-xs text-slate-700">
                Anything the chart cannot hold: tone, posture, how the child
                tolerated it. The family can read these on the Health Profile;
                anything for colleagues only belongs in the session note.
              </p>
              <textarea
                id={`${idBase}-notes`}
                rows={5}
                maxLength={PEDS_NOTES_MAX}
                value={form.notes}
                onChange={(e) => edit({ ...form, notes: e.target.value })}
                className={`mt-2 ${fieldClass}`}
              />
              <p className="mt-1 text-right text-[11px] text-slate-600">
                {form.notes.length}/{PEDS_NOTES_MAX}
              </p>
            </section>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:px-6">
            <div className="min-w-0 flex-1 text-xs" aria-live="polite">
              {confirmingDiscard ? (
                <span className="font-semibold text-amber-800">
                  Close without saving? What you recorded here will be lost.
                </span>
              ) : error ? (
                <span
                  role="alert"
                  data-form-error
                  className="font-semibold text-red-700"
                >
                  {error}
                </span>
              ) : (
                <span className="text-slate-600">
                  {assessed === 0
                    ? "Nothing assessed yet."
                    : `${assessed} of ${PEDS_MILESTONES.length} milestones assessed`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {confirmingDiscard ? (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmingDiscard(false)}
                    className="min-h-[44px] rounded-xl px-4 text-xs font-semibold text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                  >
                    Keep editing
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-h-[44px] rounded-xl border border-red-200 px-4 text-xs font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                  >
                    Discard
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={requestClose}
                    disabled={saving}
                    className="min-h-[44px] rounded-xl px-4 text-xs font-semibold text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-700 px-5 text-xs font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:opacity-60"
                  >
                    {saving && <Spinner />}
                    {saving ? "Saving…" : "Save examination"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
