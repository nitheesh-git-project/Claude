"use client";

import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import OverlayPortal from "@/components/system/OverlayPortal";
import Spinner from "@/components/system/Spinner";
import {
  ChecklistEditor,
  ChoiceButtons,
  NumberBox,
  ReadingsEditor,
  ScoreSheetEditor,
  StrengthEditor,
  TrialsEditor,
} from "@/components/profile/progress/RecordTestEditors";
import BalanceHolds from "@/components/profile/progress/timers/BalanceHolds";
import CountdownCounter from "@/components/profile/progress/timers/CountdownCounter";
import SixMinuteWalkGuide, { type SixMinuteWalkResult } from "@/components/profile/progress/timers/SixMinuteWalkGuide";
import { sixMinuteWalkEquationKeyFor, type SixMinuteWalkEquationRead } from "@/lib/sixMinuteWalkEquation";
import type { OxygenStopLimit } from "@/lib/cardioSafety";
import { afterWalkReadings, restingReadings } from "@/lib/walkMeasurements";
import AngleTool from "@/components/profile/progress/angle/AngleTool";
import { canMeasureFromImage } from "@/lib/angleMeasure";
import TapTimer from "@/components/profile/progress/timers/TapTimer";
import { useDialogChrome } from "@/lib/useDialogChrome";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import { debugNow, debugNowHeaders } from "@/lib/debugNow";
import { formatClinicDate } from "@/lib/formatDateTime";
import {
  JOINT_MODES,
  JOINT_READING_RULE,
  joinJointVariant,
  landmarksFor,
  movementLabel,
  type JointMode,
} from "@/lib/jointLandmarks";
import { JOINT_MOVEMENTS, maxTrialsFor, outcomeMeasure, STANDS_WITH_ARMS_KEY, usedArmsEntry, validateMeasurement, type OutcomeMeasure, type ProfileKind } from "@/lib/outcomeMeasures";
import type { MeasureSeries } from "@/lib/outcomeSeries";
import { formatReading } from "@/lib/progressChart";
import { NETWORK_ERROR_MESSAGE, progressErrorMessage, readProgressFailure } from "@/lib/progressErrors";
import {
  EMPTY_CONDITION_DRAFT,
  buildConditions,
  computeEntry,
  conditionFieldsFor,
  emptyEditorState,
  mustUseTrials,
  otherSideReading,
  ownedElsewhereNote,
  pendingExtensionLag,
  previousReading,
  recordableMeasures,
  timerFor,
  type ConditionDraft,
  type EditorState,
} from "@/lib/recordTest";

const FIELD =
  "min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";

const SIDE_LABEL = { left: "Left", right: "Right" } as const;

type PatientFacts = {
  sex?: "female" | "male" | null;
  ageYears?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
};

/**
 * Recording one standardised test, in the clinician's voice: pick the test,
 * say how it was done, get the number (an embedded timer, a score sheet, a
 * tap on the scale or a typed value), see the last reading beside it, save.
 *
 * What it offers is the registry's, filtered (`recordableMeasures`): tests the
 * Pain Map or the neurological exam already owns are not listed at all, a
 * licensed scale the clinic has not switched on is listed but cannot be
 * chosen (with the reason), and when the switch could not be read it says it
 * could not check. The conditions a test needs - in person or video (with a
 * helper or a home measurement where the test needs one), walking aid and
 * footwear, ON or OFF and the last dose for Parkinson's - come from
 * `conditionFieldsFor`. The whole measurement is checked with the same
 * `validateMeasurement` the route runs, so a refusal is said here, in the
 * same words, before the round trip; the route's own answer is mapped by
 * `progressErrorMessage` (a 503 is "we couldn't check", never "not allowed").
 *
 * The test time is "now" on the debug bar's clock; backdating a result is
 * not offered, because the clinic zone is the only zone a date means
 * anything in (see frontend.md) and a result entered late is a note.
 *
 * `asAdmin` posts to the admin door (no session gate); otherwise the
 * therapist's. The therapist's needs a started session, which the route
 * answers with 409 session_not_started and this says in a sentence.
 */
export default function RecordTestDialog({
  patientId,
  patientName,
  profileKind,
  series,
  enabledLicensed,
  licenceUnreadable = false,
  patient = null,
  walkEquation,
  appointmentId = null,
  asAdmin = false,
  initialMeasureKey,
  lockedMeasure = false,
  oxygenLimit,
  flow,
  initialConditions,
  onSaved,
  onClose,
}: {
  patientId: string;
  patientName?: string;
  profileKind: ProfileKind;
  /** The record so far, for "last time" beside the new reading. */
  series: MeasureSeries[];
  /** Licensed scales the clinic has switched on. */
  enabledLicensed: readonly string[];
  /** The licence switch could not be read: licensed scales say so. */
  licenceUnreadable?: boolean;
  /** For the six-minute walk's predicted distance. */
  patient?: PatientFacts | null;
  /** The clinic's six-minute walk equation (loadSixMinuteWalkEquation).
   *  Absent is "formula not chosen yet" -- never the US equation. */
  walkEquation?: SixMinuteWalkEquationRead;
  /** File the reading against this session. */
  appointmentId?: string | null;
  asAdmin?: boolean;
  initialMeasureKey?: string;
  /** Hide the "Which test?" picker: a guided flow has chosen the test. */
  lockedMeasure?: boolean;
  /** The patient's own oxygen stop limit, for the six-minute walk's
   *  pre-exercise refusal. */
  oxygenLimit?: OxygenStopLimit;
  /** A guided flow ("Start the falls check"): where this step sits, and the
   *  way to leave it out. The flow owns what happens after a save. */
  flow?: { position: number; of: number; title: string; onSkip: () => void };
  /** Conditions carried from the step before (in person, the walking aid). */
  initialConditions?: ConditionDraft;
  /** Called after a reading is saved, instead of closing the dialog. */
  onSaved?: (saved: { measureKey: string; conditions: ConditionDraft }) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const { show } = useToast();
  const titleId = useId();
  const baseId = useId();

  const enabledSet = useMemo(() => new Set(enabledLicensed), [enabledLicensed]);
  const choices = useMemo(
    () => recordableMeasures(profileKind, { enabledLicensed: enabledSet, licenceUnreadable }),
    [profileKind, enabledSet, licenceUnreadable]
  );
  const startKey = choices.find((c) => c.selectable && c.measure.key === initialMeasureKey)?.measure.key ?? "";

  const [measureKey, setMeasureKey] = useState(startKey);
  const [variant, setVariant] = useState("");
  // Goniometry stores the movement and its mode in one variant string; the
  // screen asks for them as two answers (jointLandmarks.ts joins them).
  const [jointMovement, setJointMovement] = useState("");
  const [jointMode, setJointMode] = useState<JointMode | "">("");
  const [side, setSide] = useState<"" | "left" | "right">("");
  const [editor, setEditor] = useState<EditorState>(() => emptyEditorState(startKey ? outcomeMeasure(startKey) : null));
  const [useTimer, setUseTimer] = useState(true);
  const [timerRun, setTimerRun] = useState(0);
  const [walks, setWalks] = useState<SixMinuteWalkResult[]>([]);
  const [timerFlag, setTimerFlag] = useState(false);
  const [cond, setCond] = useState<ConditionDraft>(initialConditions ?? EMPTY_CONDITION_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [angleOpen, setAngleOpen] = useState(false);
  const savingRef = useRef(false);

  const measure = measureKey ? outcomeMeasure(measureKey) : null;
  const fields = measure ? conditionFieldsFor(measure, profileKind) : null;
  const timer = measure ? timerFor(measure) : null;
  const trialsOnly = measure ? mustUseTrials(measure, profileKind) : false;
  const timerOn = !!timer && (useTimer || trialsOnly);
  const entry = measure ? computeEntry(measure, editor, timerOn) : null;
  const medicationState = fields?.medication && cond.medicationState ? cond.medicationState : null;
  const previous = measure
    ? previousReading(series, {
        measureKey: measure.key,
        variant: variant || null,
        side: side || null,
        medicationState,
      })
    : null;

  const otherSide = measure
    ? otherSideReading(series, { measureKey: measure.key, variant: variant || null, side: side || null, medicationState })
    : null;
  const lagNow = measure
    ? pendingExtensionLag(series, { measureKey: measure.key, variant: variant || null, side: side || null }, entry?.value ?? null)
    : null;
  const landmark = measure?.key === "joint_range" && jointMovement ? landmarksFor(jointMovement) : null;

  const dirty = !!measure && (entry?.value != null || (cond !== EMPTY_CONDITION_DRAFT && cond !== initialConditions));

  function requestClose() {
    if (saving) return;
    // Escape inside "Measure from a photo" goes back to the form, not out of the dialog.
    if (angleOpen) {
      setAngleOpen(false);
      return;
    }
    if (dirty && !confirmingDiscard) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  }
  const { panelRef, dialogProps } = useDialogChrome({ onClose: requestClose, labelledBy: titleId });

  function pickMeasure(key: string) {
    setConfirmingDiscard(false);
    setError(null);
    setMeasureKey(key);
    const m = key ? outcomeMeasure(key) : null;
    setVariant("");
    setJointMovement("");
    setJointMode("");
    setSide("");
    setEditor(emptyEditorState(m));
    setUseTimer(true);
    setWalks([]);
    setTimerFlag(false);
    setTimerRun((n) => n + 1);
    setCond((c) => (c === EMPTY_CONDITION_DRAFT || c === initialConditions ? c : { ...EMPTY_CONDITION_DRAFT, setting: c.setting, testerName: c.testerName }));
  }

  function patchCond(patch: Partial<ConditionDraft>) {
    setConfirmingDiscard(false);
    setError(null);
    setCond((c) => ({ ...c, ...patch }));
  }
  function patchEditor(patch: Partial<EditorState>) {
    setConfirmingDiscard(false);
    setError(null);
    setEditor((e) => ({ ...e, ...patch }));
  }

  /** Save the vitals a walk produced, one reading at a time through the
   *  existing route; returns a sentence for each that did not save. */
  async function saveExtraReadings(
    readings: { label: string; measurement: Parameters<typeof validateMeasurement>[0] }[],
    nowMs: number
  ): Promise<string[]> {
    const failed: string[] = [];
    for (const r of readings) {
      const checked = validateMeasurement(r.measurement, { profileKind, nowMs, enabledLicensed: enabledSet });
      if (!checked.ok) {
        failed.push(`${r.label} (${checked.error})`);
        continue;
      }
      try {
        const res = await fetch(asAdmin ? "/api/admin/measurements/submit" : "/api/therapist/measurements/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...debugNowHeaders() },
          body: JSON.stringify({ patientId, appointmentId, measurement: checked.measurement }),
        });
        if (!res.ok) failed.push(`${r.label} (${progressErrorMessage(await readProgressFailure(res), "measurement")})`);
      } catch {
        failed.push(`${r.label} (${NETWORK_ERROR_MESSAGE})`);
      }
    }
    return failed;
  }

  async function save() {
    if (savingRef.current || !measure || !fields || !entry) return;
    setConfirmingDiscard(false);
    if (!cond.setting) {
      setError("Say whether the test was in person or over video.");
      return;
    }
    if (measure.sided && !side) {
      setError(`${measure.label}: say which side.`);
      return;
    }
    if (measure.variants && !variant) {
      setError(`${measure.label}: say which one was measured.`);
      return;
    }
    if (entry.problem) {
      setError(entry.problem);
      return;
    }
    if (entry.value === null) {
      setError("Enter the result first.");
      return;
    }
    const nowMs = debugNow();
    const measurement = {
      measureKey: measure.key,
      value: entry.value,
      measuredAt: new Date(nowMs).toISOString(),
      conditions: buildConditions(measure, profileKind, cond, nowMs, entry.usedArms),
      ...(measure.sided ? { side } : {}),
      ...(measure.variants ? { variant } : {}),
      ...(entry.items !== null ? { items: entry.items } : {}),
    };
    // The route's own check, in the route's own words, before the round trip.
    const checked = validateMeasurement(measurement, { profileKind, nowMs, enabledLicensed: enabledSet });
    if (!checked.ok) {
      setError(checked.error);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(asAdmin ? "/api/admin/measurements/submit" : "/api/therapist/measurements/submit", {
        method: "POST",
        // The therapist route judges "a session has started" on the debug
        // bar's simulated clock, like the exam dialogs.
        headers: { "Content-Type": "application/json", ...debugNowHeaders() },
        body: JSON.stringify({ patientId, appointmentId, measurement: checked.measurement }),
      });
      if (!res.ok) {
        setError(progressErrorMessage(await readProgressFailure(res), "measurement"));
        return;
      }
      const variantLabel = measure.variants?.find((v) => v.key === variant)?.label;
      show(
        `${measure.label}${variantLabel ? ` (${variantLabel})` : ""} recorded: ${formatReading(entry.value, measure.decimals, measure.unit)}${
          patientName ? ` for ${patientName}` : ""
        }`
      );
      // A guided six-minute walk also leaves its vitals behind, each its own
      // reading through the same route. The distance is already saved; a
      // vital that cannot be saved is said, never dropped quietly.
      let vitalsFailed: string[] = [];
      if (measure.key === "six_minute_walk" && walks.length > 0) {
        const best = walks.reduce((a, b) => (b.distance > a.distance ? b : a));
        const base = { measuredAt: measurement.measuredAt, conditions: measurement.conditions };
        const extras = [
          ...restingReadings({ ...best.before }, base),
          ...afterWalkReadings({ ...best.after }, best.talkTest, base),
        ];
        vitalsFailed = await saveExtraReadings(extras.map((x) => ({ label: x.label, measurement: x.measurement })), nowMs);
      }
      if (vitalsFailed.length > 0) {
        setError(`The walk was saved, but these readings were not: ${vitalsFailed.join("; ")}. Record them with Record a test.`);
        router.refresh();
        return;
      }
      router.refresh();
      if (onSaved) onSaved({ measureKey: measure.key, conditions: cond });
      else onClose();
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  // --- The result section -----------------------------------------------------------------------

  const resultBar = (text: string, onRedo: () => void) => (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2">
      <p className="text-sm font-semibold text-teal-900">{text}</p>
      <button
        type="button"
        onClick={onRedo}
        className="min-h-[44px] rounded-lg px-3 text-sm font-semibold text-teal-900 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
      >
        Redo
      </button>
    </div>
  );

  function resultSection(m: OutcomeMeasure): ReactNode {
    if (m.scoreSheet) {
      return (
        <ScoreSheetEditor measure={m} sheet={m.scoreSheet} answers={editor.answers} onChange={(answers) => patchEditor({ answers })} />
      );
    }
    if (m.readings && m.checklist) {
      return <ChecklistEditor items={m.checklist} texts={editor.readingTexts} onTexts={(readingTexts) => patchEditor({ readingTexts })} />;
    }
    if (m.readings) {
      return <ReadingsEditor keys={m.readings.keys} texts={editor.readingTexts} onTexts={(readingTexts) => patchEditor({ readingTexts })} />;
    }
    if (m.key === "strength_symmetry") {
      return (
        <StrengthEditor
          injured={editor.injuredTexts}
          healthy={editor.healthyTexts}
          onInjured={(injuredTexts) => patchEditor({ injuredTexts })}
          onHealthy={(healthyTexts) => patchEditor({ healthyTexts })}
          note={m.trials?.note}
        />
      );
    }

    if (timer && timerOn) {
      const redo = () => {
        patchEditor({ timer: null });
        setWalks([]);
        setTimerRun((n) => n + 1);
      };
      if (editor.timer) {
        const addWalk = () => {
          patchEditor({ timer: null });
          setTimerRun((n) => n + 1);
        };
        return (
          <div className="space-y-2">
            {resultBar(
              `Result: ${formatReading(editor.timer.value, m.decimals, m.unit)}${
                editor.timer.usedArms && editor.timer.items && !Array.isArray(editor.timer.items)
                  ? ` (arms used; ${editor.timer.items[STANDS_WITH_ARMS_KEY]} with the arms)`
                  : ""
              }`,
              redo
            )}
            {timer.kind === "six_minute_walk" && (
              <>
                <ul className="text-xs text-slate-700">
                  {walks.map((w, i) => (
                    <li key={i}>
                      Walk {i + 1}: {w.distance} m
                      {w.percentPredicted !== null
                        ? ` (${w.percentPredicted}% of predicted${w.equation ? `, ${w.equation}` : ""})`
                        : walkEquation?.status === "unreadable"
                          ? " (couldn't check the predicted-distance formula)"
                          : !walkEquation || !walkEquation.chosen
                            ? " (predicted-distance formula not chosen yet)"
                            : ""}
                      {w.stoppedEarly ? ", stopped early" : ""}
                    </li>
                  ))}
                </ul>
                {walks.length < 2 && (
                  <button
                    type="button"
                    onClick={addWalk}
                    className="min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                  >
                    Add a second walk
                  </button>
                )}
                <p className="text-xs text-slate-600">
                  On the first visit do two walks at least 30 minutes apart and keep the better one: people walk further the
                  second time just from learning the test.
                </p>
              </>
            )}
          </div>
        );
      }
      const flag = (interrupted: boolean) => {
        if (interrupted) setTimerFlag(true);
      };
      switch (timer.kind) {
        case "tap":
          return (
            <TapTimer
              key={timerRun}
              label={m.label}
              count={timer.count}
              maxTrials={timer.maxTrials}
              keep={timer.keep}
              better={m.better}
              decimals={m.decimals}
              practice={timer.practice}
              distanceMetres={timer.distanceMetres}
              requireAll={trialsOnly}
              onUse={(r) => {
                flag(r.interrupted);
                patchEditor({ timer: { value: r.value, items: r.trials } });
              }}
            />
          );
        case "countdown":
          return (
            <CountdownCounter
              key={timerRun}
              seconds={timer.seconds}
              max={timer.max}
              title={timer.title}
              description={timer.description}
              armsRule={timer.armsRule}
              onUse={(r) => {
                flag(r.interrupted);
                // The CDC rule: arms used scores 0, and the count with the
                // arms is kept in items (validateUsedArms checks the pair).
                patchEditor({
                  timer:
                    timer.armsRule && r.armsUsed && r.standsWithArms !== null
                      ? { ...usedArmsEntry(r.standsWithArms), usedArms: true }
                      : { value: r.stands, items: null, ...(timer.armsRule ? { usedArms: false } : {}) },
                });
              }}
            />
          );
        case "balance":
          return (
            <BalanceHolds
              key={timerRun}
              helperRequired={cond.setting === "video"}
              onUse={(r) => {
                flag(r.interrupted);
                patchEditor({ timer: { value: r.stage, items: null } });
              }}
            />
          );
        case "six_minute_walk":
          return (
            <SixMinuteWalkGuide
              key={timerRun}
              patient={patient}
              equationKey={walkEquation ? sixMinuteWalkEquationKeyFor(walkEquation) : undefined}
              equationUnreadable={walkEquation?.status === "unreadable"}
              oxygenLimit={oxygenLimit}
              onUse={(walk) => {
                flag(walk.interrupted);
                const next = [...walks, walk];
                setWalks(next);
                const distances = next.map((w) => w.distance);
                patchEditor({ timer: { value: Math.max(...distances), items: distances } });
              }}
            />
          );
      }
    }

    // Hand-entered readings.
    const typed =
      m.capture === "trials" && m.trials && !timer ? (
        <TrialsEditor
          measure={m}
          texts={editor.trialTexts}
          onTexts={(trialTexts) => patchEditor({ trialTexts })}
          maxTrials={maxTrialsFor(m)}
        />
      ) : m.grades || m.capture === "rating" ? (
        <ChoiceButtons measure={m} label={`${m.plainName} (${m.label})`} value={editor.choice} onChange={(choice) => patchEditor({ choice })} />
      ) : (
        <NumberBox measure={m} label={`Result (${m.unit})`} text={editor.numberText} onText={(numberText) => patchEditor({ numberText })} />
      );
    return (
      <div className="space-y-3">
        {typed}
        {timer && !trialsOnly && (
          <button
            type="button"
            onClick={() => setUseTimer(true)}
            className="min-h-[44px] text-sm font-semibold text-teal-800 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
          >
            Use the timer instead
          </button>
        )}
      </div>
    );
  }

  const radio = (name: string, value: string, current: string, label: string, onPick: () => void, disabledReason?: string) => (
    <label
      className={`flex min-h-[44px] flex-1 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${
        disabledReason ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-600" : current === value ? "border-teal-700 bg-teal-50 text-teal-900" : "border-slate-300 bg-white text-slate-800"
      }`}
    >
      <input
        type="radio"
        name={`${baseId}-${name}`}
        value={value}
        checked={current === value}
        disabled={!!disabledReason}
        onChange={onPick}
        className="h-4 w-4 accent-teal-700"
      />
      <span>
        {label}
        {disabledReason && <span className="block text-xs font-normal">{disabledReason}</span>}
      </span>
    </label>
  );

  const ownedNote = ownedElsewhereNote(profileKind);

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4">
        <div
          ref={panelRef}
          {...dialogProps}
          className="relative flex h-full w-full flex-col overflow-hidden bg-white shadow-xl sm:h-[92vh] sm:max-w-3xl sm:rounded-2xl"
        >
          <div inert={angleOpen} className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-teal-800">Record a test</p>
              <h2 id={titleId} className="font-display text-lg font-bold text-slate-900 [overflow-wrap:anywhere]">
                {patientName ? `Measuring ${patientName}` : "Recording a measurement"}
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Stored as a new reading on the record. An earlier reading is never changed; a re-test is a new one.
              </p>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              <i aria-hidden className="fa-solid fa-xmark text-lg" />
            </button>
          </div>

          <div inert={angleOpen} className="flex-1 space-y-6 overflow-y-auto px-4 py-4 sm:px-6">
            {flow && (
              <div data-testid="flow-step" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2">
                <p className="text-sm font-bold text-teal-900">
                  Step {flow.position} of {flow.of}: {flow.title}
                </p>
                <button
                  type="button"
                  onClick={flow.onSkip}
                  disabled={saving}
                  className="min-h-[44px] rounded-lg px-3 text-sm font-semibold text-teal-900 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                >
                  Leave this one out
                </button>
              </div>
            )}
            {/* 1. Which test */}
            <section className="space-y-3">
              <div className={lockedMeasure && measure ? "sr-only" : undefined}>
                <label htmlFor={`${baseId}-measure`} className="block text-sm font-semibold text-slate-900">
                  Which test?
                </label>
                <select
                  id={`${baseId}-measure`}
                  value={measureKey}
                  onChange={(e) => pickMeasure(e.target.value)}
                  className={`mt-1 ${FIELD}`}
                >
                  <option value="">Choose a test</option>
                  {choices.map(({ measure: m, selectable, reason }) => (
                    <option key={m.key} value={m.key} disabled={!selectable}>
                      {m.label}
                      {reason ? ` - ${reason}` : ""}
                    </option>
                  ))}
                </select>
                {ownedNote && <p className="mt-1 text-xs text-slate-600">{ownedNote}</p>}
                {licenceUnreadable && choices.some((c) => c.measure.licence === "licensed") && (
                  <p role="status" className="mt-1 text-xs font-semibold text-amber-900">
                    {"We couldn't check which licensed scales the clinic has switched on, so they can't be chosen just now. Reload to try again."}
                  </p>
                )}
                {measure?.note && <p className="mt-1 text-xs text-slate-600">{measure.note}</p>}
              </div>

              {measure?.key === "joint_range" ? (
                <>
                  <div>
                    <label htmlFor={`${baseId}-movement`} className="block text-sm font-semibold text-slate-900">
                      Which movement?
                    </label>
                    <select
                      id={`${baseId}-movement`}
                      value={jointMovement}
                      onChange={(e) => {
                        setJointMovement(e.target.value);
                        setVariant(joinJointVariant(e.target.value, jointMode));
                        setError(null);
                      }}
                      className={`mt-1 ${FIELD}`}
                    >
                      <option value="">Choose</option>
                      {JOINT_MOVEMENTS.map((mv) => (
                        <option key={mv.key} value={mv.key}>
                          {mv.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <fieldset>
                    <legend className="text-sm font-semibold text-slate-900">Active or passive?</legend>
                    <div className="mt-1 flex gap-2">
                      {JOINT_MODES.map((md) =>
                        radio("mode", md.key, jointMode, md.label, () => {
                          setJointMode(md.key);
                          setVariant(joinJointVariant(jointMovement, md.key));
                          setError(null);
                        })
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      Active and passive are drawn as separate lines and never compared with each other. Keep to the same one each time.
                    </p>
                  </fieldset>
                </>
              ) : (
                measure?.variants && (
                  <div>
                    <label htmlFor={`${baseId}-variant`} className="block text-sm font-semibold text-slate-900">
                      Which one?
                    </label>
                    <select
                      id={`${baseId}-variant`}
                      value={variant}
                      onChange={(e) => {
                        setVariant(e.target.value);
                        setError(null);
                      }}
                      className={`mt-1 ${FIELD}`}
                    >
                      <option value="">Choose</option>
                      {measure.variants.map((v) => (
                        <option key={v.key} value={v.key}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              )}

              {measure?.sided && (
                <fieldset>
                  <legend className="text-sm font-semibold text-slate-900">Which side?</legend>
                  <div className="mt-1 flex gap-2">
                    {radio("side", "left", side, SIDE_LABEL.left, () => setSide("left"))}
                    {radio("side", "right", side, SIDE_LABEL.right, () => setSide("right"))}
                  </div>
                </fieldset>
              )}

              {landmark && (
                <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                  <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold text-teal-900">
                    How to measure {movementLabel(jointMovement)?.toLowerCase()}
                  </summary>
                  <dl className="mt-1 grid gap-x-3 gap-y-1.5 pb-2 sm:grid-cols-[8rem_1fr]">
                    <dt className="font-semibold text-slate-700">Position</dt>
                    <dd>{landmark.position}</dd>
                    <dt className="font-semibold text-slate-700">Centre of the goniometer</dt>
                    <dd>{landmark.centre}</dd>
                    <dt className="font-semibold text-slate-700">Fixed arm</dt>
                    <dd>{landmark.fixedArm}</dd>
                    <dt className="font-semibold text-slate-700">Moving arm</dt>
                    <dd>{landmark.movingArm}</dd>
                  </dl>
                  {landmark.note && <p className="pb-1 text-xs text-slate-700">{landmark.note}</p>}
                  <p className="pb-2 text-xs text-slate-700">{JOINT_READING_RULE}</p>
                </details>
              )}

              {measure?.key === "joint_range" && jointMovement && canMeasureFromImage(jointMovement) && (
                <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3">
                  <button
                    type="button"
                    data-testid="measure-from-image"
                    onClick={() => setAngleOpen(true)}
                    disabled={!side || !jointMode}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-teal-700 bg-white px-4 text-sm font-bold text-teal-900 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <i aria-hidden className="fa-solid fa-camera" /> Measure from an image
                  </button>
                  <p className="mt-1 text-xs text-slate-700">
                    {!side || !jointMode
                      ? "Choose the side and active or passive first."
                      : "For a video session: tap the joint on a screenshot and the angle is worked out for you. It is an estimate, and the photo is not saved."}
                  </p>
                </div>
              )}
            </section>

            {measure && fields && (
              <>
                {/* 2. How it was done */}
                <section className="space-y-3">
                  <h3 className="font-display text-base font-bold text-slate-900">How it was done</h3>

                  <fieldset>
                    <legend className="text-sm font-semibold text-slate-900">Where</legend>
                    <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                      {radio("setting", "in_person", cond.setting, "In person", () => patchCond({ setting: "in_person", estimatedFromImage: false }))}
                      {radio(
                        "setting",
                        "video",
                        cond.setting,
                        "Over video",
                        () => patchCond({ setting: "video" }),
                        fields.videoRefused ? "This test is done in person only" : undefined
                      )}
                    </div>
                  </fieldset>

                  {cond.setting === "video" && fields.helperOverVideo && (
                    <label className="flex min-h-[44px] items-start gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        checked={cond.helperPresent}
                        onChange={(e) => patchCond({ helperPresent: e.target.checked })}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-teal-700"
                      />
                      <span>Another adult stood beside the patient throughout</span>
                    </label>
                  )}
                  {cond.setting === "video" && fields.homeOverVideo && (
                    <label className="flex min-h-[44px] items-start gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        checked={cond.homeMeasured}
                        onChange={(e) => patchCond({ homeMeasured: e.target.checked })}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-teal-700"
                      />
                      <span>Measured at home (distance marked out or a home device used)</span>
                    </label>
                  )}
                  {cond.setting === "video" && fields.estimateOverVideo && (
                    <p className="text-xs text-slate-600">Over video this reading is shown as an estimate on the graph.</p>
                  )}
                  {cond.setting === "video" && fields.estimateOverVideo && cond.estimatedFromImage && (
                    <div data-testid="image-estimate-chip" className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-sm font-bold text-amber-950">
                      <span>Estimated from a photo. It is marked as an estimate everywhere it is shown.</span>
                      <button
                        type="button"
                        onClick={() => patchCond({ estimatedFromImage: false })}
                        className="min-h-[44px] rounded-lg px-3 text-sm font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                      >
                        It was not from a photo
                      </button>
                    </div>
                  )}
                  {cond.setting === "video" && fields.parentOverVideo && (
                    <p className="text-xs text-slate-600">Over video, the parent does the activity with the child while you watch.</p>
                  )}

                  {fields.medication && (
                    <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
                      <fieldset>
                        <legend className="text-sm font-semibold text-slate-900">Medication state (required)</legend>
                        <div className="mt-1 flex gap-2">
                          {radio("med", "on", cond.medicationState, "ON", () => patchCond({ medicationState: "on" }))}
                          {radio("med", "off", cond.medicationState, "OFF", () => patchCond({ medicationState: "off" }))}
                        </div>
                      </fieldset>
                      <div>
                        <label htmlFor={`${baseId}-dose`} className="block text-sm font-semibold text-slate-900">
                          Time of the last dose, 24-hour (clinic time, today)
                        </label>
                        <input
                          id={`${baseId}-dose`}
                          type="text"
                          inputMode="numeric"
                          placeholder="08:30"
                          maxLength={5}
                          pattern="[0-2][0-9]:[0-5][0-9]"
                          value={cond.lastDoseTime}
                          onChange={(e) => patchCond({ lastDoseTime: e.target.value })}
                          className={`mt-1 max-w-[10rem] ${FIELD}`}
                        />
                        <p className="mt-1 text-xs text-slate-600">
                          ON and OFF readings are drawn as separate lines, so they are never compared with each other.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    {fields.walkingAid && (
                      <div>
                        <label htmlFor={`${baseId}-aid`} className="block text-sm font-semibold text-slate-900">
                          Walking aid
                        </label>
                        <input
                          id={`${baseId}-aid`}
                          type="text"
                          maxLength={80}
                          value={cond.walkingAid}
                          onChange={(e) => patchCond({ walkingAid: e.target.value })}
                          placeholder="None, stick, frame..."
                          className={`mt-1 ${FIELD}`}
                        />
                      </div>
                    )}
                    {fields.footwear && (
                      <div>
                        <label htmlFor={`${baseId}-shoes`} className="block text-sm font-semibold text-slate-900">
                          Footwear, orthoses or splints
                        </label>
                        <input
                          id={`${baseId}-shoes`}
                          type="text"
                          maxLength={80}
                          value={cond.footwear}
                          onChange={(e) => patchCond({ footwear: e.target.value })}
                          placeholder="Barefoot, usual shoes, AFO..."
                          className={`mt-1 ${FIELD}`}
                        />
                      </div>
                    )}
                    {fields.painBefore && (
                      <div>
                        <label htmlFor={`${baseId}-pain`} className="block text-sm font-semibold text-slate-900">
                          Pain before the test, 0 to 10
                        </label>
                        <input
                          id={`${baseId}-pain`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={10}
                          step={1}
                          value={cond.painBefore}
                          onChange={(e) => patchCond({ painBefore: e.target.value })}
                          className={`mt-1 ${FIELD}`}
                        />
                      </div>
                    )}
                    {fields.oxygen && (
                      <div>
                        <label htmlFor={`${baseId}-o2`} className="block text-sm font-semibold text-slate-900">
                          Extra oxygen, litres a minute
                        </label>
                        <input
                          id={`${baseId}-o2`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={15}
                          step="any"
                          value={cond.oxygenLpm}
                          onChange={(e) => patchCond({ oxygenLpm: e.target.value })}
                          placeholder="Leave blank if none"
                          className={`mt-1 ${FIELD}`}
                        />
                      </div>
                    )}
                    <div className={fields.walkingAid ? "sm:col-span-2" : ""}>
                      <label htmlFor={`${baseId}-tester`} className="block text-sm font-semibold text-slate-900">
                        Measured by, if not you
                      </label>
                      <input
                        id={`${baseId}-tester`}
                        type="text"
                        maxLength={80}
                        value={cond.testerName}
                        onChange={(e) => patchCond({ testerName: e.target.value })}
                        placeholder="Leave blank if you measured it"
                        className={`mt-1 ${FIELD}`}
                      />
                      <p className="mt-1 text-xs text-slate-600">
                        A different person measuring widens the allowance before a change counts as real.
                      </p>
                    </div>
                  </div>

                  {fields.method && (
                    <fieldset>
                      <legend className="text-sm font-semibold text-slate-900">Seen in the session, or reported?</legend>
                      <div className="mt-1 flex gap-2">
                        {radio("method", "observed", cond.method, "Observed", () => patchCond({ method: "observed" }))}
                        {radio("method", "reported", cond.method, "Reported", () => patchCond({ method: "reported" }))}
                      </div>
                    </fieldset>
                  )}
                </section>

                {/* 3. The result */}
                <section className="space-y-3">
                  <h3 className="font-display text-base font-bold text-slate-900">The result</h3>
                  {resultSection(measure)}
                  {timer && !trialsOnly && timerOn && !editor.timer && (
                    <button
                      type="button"
                      onClick={() => setUseTimer(false)}
                      className="min-h-[44px] text-sm font-semibold text-slate-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                    >
                      Type the result instead
                    </button>
                  )}
                  {trialsOnly && (
                    <p className="text-xs text-slate-600">
                      On a Parkinson{"'"}s measurement every trial is recorded, so the timer is used.
                    </p>
                  )}
                  {timerFlag && (
                    <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      A timer noted that the screen was in the background, or the device slept, while it ran. Check the result
                      against what you saw before you save.
                    </p>
                  )}
                  {entry?.working && <p className="text-xs text-slate-600">{entry.working}</p>}
                  {entry?.problem && (
                    <p role="alert" className="text-sm font-semibold text-red-800">
                      {entry.problem}
                    </p>
                  )}
                </section>

                {/* 4. Last time and this time */}
                <section aria-label="Last reading and this one" className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Last time</p>
                    {previous ? (
                      <>
                        <p className="font-display text-xl font-bold text-slate-900">
                          {formatReading(previous.value, previous.decimals, previous.unit)}
                        </p>
                        <p className="text-xs text-slate-600">{formatClinicDate(previous.measuredAt)}</p>
                      </>
                    ) : (
                      <p className="text-sm text-slate-600">
                        {measure.sided && !side
                          ? "Choose a side."
                          : measure.variants && !variant
                            ? "Choose one."
                            : "Nothing recorded yet for this."}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">This time</p>
                    {entry?.value != null ? (
                      <p className="font-display text-xl font-bold text-teal-900">
                        {formatReading(entry.value, measure.decimals, measure.unit)}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-600">Not entered yet.</p>
                    )}
                  </div>
                </section>
                {(otherSide || lagNow) && (
                  <section aria-label="Other side and extension lag" className="space-y-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800">
                    {otherSide && (
                      <p>
                        <span className="font-semibold">Other side ({SIDE_LABEL[otherSide.side].toLowerCase()}):</span>{" "}
                        {formatReading(otherSide.value, otherSide.decimals, otherSide.unit)}
                        <span className="text-slate-600"> on {formatClinicDate(otherSide.measuredAt)} - the best normal for this joint.</span>
                      </p>
                    )}
                    {lagNow && (
                      <p>
                        <span className="font-semibold">Extension lag:</span>{" "}
                        {lagNow.lag === 0 ? "none" : `${lagNow.lag}°`}
                        <span className="text-slate-600">
                          {" "}
                          against the latest {lagNow.partner} reading of {lagNow.partnerValue}° ({lagNow.working}). A lag points to thigh strength, not stiffness.
                        </span>
                      </p>
                    )}
                  </section>
                )}
              </>
            )}
          </div>

          <div inert={angleOpen} className="border-t border-slate-100 px-4 py-3 sm:px-6">
            {error && (
              <p role="alert" data-form-error className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              {confirmingDiscard ? (
                <>
                  <p className="mr-auto text-xs text-slate-600">Discard what you have entered?</p>
                  <button
                    type="button"
                    onClick={() => setConfirmingDiscard(false)}
                    className="min-h-[44px] rounded-xl px-4 text-sm font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                  >
                    Keep editing
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-h-[44px] rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
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
                    className="min-h-[44px] rounded-xl px-4 text-sm font-semibold text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving || !measure}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:opacity-60"
                  >
                    {saving && <Spinner />}
                    {saving ? "Saving…" : measure ? "Save reading" : "Choose a test to save"}
                  </button>
                </>
              )}
            </div>
          </div>
          {angleOpen && jointMovement && (side === "left" || side === "right") && jointMode && (
            <AngleTool
              movement={jointMovement}
              side={side}
              mode={jointMode}
              previous={previous?.value ?? null}
              onClose={() => setAngleOpen(false)}
              onUse={(value) => {
                // The number goes into the first empty reading box; the photo and the points stay behind.
                const room = maxTrialsFor(measure!);
                const texts = Array.from({ length: room }, (_, i) => editor.trialTexts[i] ?? "");
                const at = texts.findIndex((t) => t.trim() === "");
                texts[at < 0 ? room - 1 : at] = String(value);
                patchEditor({ trialTexts: texts });
                patchCond({ setting: "video", estimatedFromImage: true });
                setAngleOpen(false);
              }}
            />
          )}
        </div>
      </div>
    </OverlayPortal>
  );
}
