"use client";

import { displayForTimerEvent, type TimerClockEvent } from "@/lib/timerClock";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { EmbeddedHandle, EmbeddedSaveResult, EmbeddedStatus } from "@/components/profile/progress/RecordTestDialog";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import {
  END_REASONS,
  buildLiveDisplay,
  runStateFromEvents,
  type AssessmentRun,
  type EndReason,
  type LiveDisplayText,
  type RunEvent,
} from "@/lib/assessmentRun";
import {
  COCKPIT_KEY_HINT,
  OFFLINE_FAILURE,
  READY_NOTE,
  SKIP_OPTIONS,
  STOP_OPTIONS,
  cockpitFailure,
  cockpitShortcut,
  currentStep,
  mergeCarried,
  NO_CARRIED_FACTS,
  type CarriedFacts,
  exertionBlock,
  firstOpenStepId,
  isLastStep,
  nextStepId,
  patientControls,
  preExerciseFromEvents,
  redFlagsRaised,
  resultRows,
  saveReadiness,
  setupProgress,
  stepAvailability,
  stepNav,
  summaryRows,
  timerStartBlock,
  toolMode,
  toolSlots,
  type CockpitFailure,
} from "@/lib/cockpit";
import type { ProfileKind } from "@/lib/outcomeMeasures";
import type { MeasurementPoint, MeasureSeries } from "@/lib/outcomeSeries";
import { STOP_REASONS, sessionProtocol } from "@/lib/sessionProtocols";
import type { ContraFlag } from "@/lib/exerciseLibrary";
import type { AreaPainEntry } from "@/lib/conditionIntake";
import { measurementProvesMilestone, type CareMilestone } from "@/lib/careGoals";
import type { TeachingEvent } from "@/lib/exercisePlan";
import { addTeachMark, teachMissing } from "@/lib/teachTool";
import type { TeachPlan } from "@/components/therapist/assessment/teach/TeachTool";
import ActionBar from "@/components/therapist/assessment/ActionBar";
import FinishedPanel from "@/components/therapist/assessment/FinishedPanel";
import PatientPreview from "@/components/therapist/assessment/PatientPreview";
import ReasonDialog from "@/components/therapist/assessment/ReasonDialog";
import ResultsPanel from "@/components/therapist/assessment/ResultsPanel";
import StepBar from "@/components/therapist/assessment/StepBar";
import StepCard from "@/components/therapist/assessment/StepCard";
import ToolArea from "@/components/therapist/assessment/ToolArea";
import BeforeYouStart from "@/components/therapist/assessment/BeforeYouStart";
import type { Briefing } from "@/lib/cockpitBriefing";
import type { FinishContext } from "@/lib/assessmentRunServer";
import { treatedLineFromRun } from "@/lib/finishFromRun";
import { homeExerciseNotePrefill, type ExercisePlan } from "@/lib/exercisePlan";
import { SESSION_SUMMARY_MAX_CHARS } from "@/lib/sessionSummary";
import { postEnd, postEvent } from "@/components/therapist/assessment/api";
import type { QuickPainSave } from "@/components/therapist/assessment/LayerTool";
import { useDisplaySender } from "@/components/therapist/assessment/useDisplaySender";

function mergeById<T extends { id: string }>(fromServer: readonly T[], local: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of local) byId.set(item.id, item);
  for (const item of fromServer) byId.set(item.id, item);
  return [...byId.values()];
}

/** A collapsible block below `lg`, always open from `lg` up: on a phone the
 *  results and the preview fold away under the step. */
function Disclosure({ title, defaultOpen, children }: { title: string; defaultOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[48px] w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-left text-base font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 lg:hidden"
      >
        {title}
        <i aria-hidden="true" className={`fa-solid fa-chevron-down text-xs transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`${open ? "mt-2 block" : "hidden"} lg:mt-0 lg:block`}>{children}</div>
    </div>
  );
}

export type CockpitProps = {
  patient: { id: string; name: string };
  /** "Knee pain · Video · 6:00 PM", built on the server in the clinic's zone. */
  headline: string;
  run: AssessmentRun;
  events: RunEvent[];
  /** The readings the run's saved events point at. */
  measurements: MeasurementPoint[];
  series: MeasureSeries[];
  profileKind: ProfileKind;
  enabledLicensed: string[];
  licenceUnreadable: boolean;
  chartHref: string;
  /** The run's own session, for "Finish this session" at the end (B3). */
  finish?: FinishContext;
  /** The patient's milestones, for the summary's "target met" (B8). */
  milestones?: { status: "ok"; items: CareMilestone[] } | { status: "unreadable" };
  /** "Before you start": one line in the header that opens to the list. */
  briefing?: Briefing;
  /** The areas the patient marked in their intake (orthopaedic): the pain step starts on the worst. */
  intakeAreas?: AreaPainEntry[];
  /** The patient's active home exercise plan and this run's marks (phase 7d). */
  exercises: {
    loadStatus: "ok" | "not_migrated" | "unreadable";
    plan: TeachPlan | null;
    marks: TeachingEvent[];
    contraFlags: ContraFlag[];
  };
};

/**
 * The session cockpit: the therapist's second screen next to Google Meet.
 * Steps across the top, the current step as one card, exactly three actions,
 * today's results and a live preview of the patient's screen beside it.
 * The server is the gate for everything this does (assessmentRun.ts); the
 * screen mirrors the gate in advance (what is missing, what is shut) and
 * words every refusal as a sentence with the single fix.
 */
export default function SessionCockpit(props: CockpitProps) {
  const protocol = sessionProtocol(props.run.protocolKey);
  if (!protocol) {
    return (
      <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
        This assessment is no longer offered. End it from the chart and start a new one.
      </p>
    );
  }
  return <Cockpit {...props} protocolKey={protocol.key} />;
}

function Cockpit(props: CockpitProps & { protocolKey: string }) {
  const { patient, run, profileKind, chartHref } = props;
  const protocol = sessionProtocol(props.protocolKey)!;
  const router = useRouter();
  const { show } = useToast();
  const firstName = patient.name.split(" ")[0] || "the patient";

  // --- The run, as the server last said, plus what this page has just done ---------------
  const [extraEvents, setExtraEvents] = useState<RunEvent[]>([]);
  const [extraMeasurements, setExtraMeasurements] = useState<MeasurementPoint[]>([]);
  const events = mergeById(props.events, extraEvents);
  const measurements = mergeById(props.measurements, extraMeasurements);
  const state = runStateFromEvents(events);
  const preExercise = preExerciseFromEvents(events);

  function addEvent(e: RunEvent | undefined) {
    if (e) setExtraEvents((prev) => (prev.some((p) => p.id === e.id) ? prev : [...prev, e]));
  }
  function addLocalEvent(stepId: string, kind: RunEvent["kind"], extra: Partial<RunEvent> = {}) {
    // Only ever called from a handler, after a save: the time is the moment of the save.
    const at = new Date();
    addEvent({
      id: extra.id ?? `local-${kind}-${stepId}-${at.getTime()}`,
      runId: run.id,
      stepId,
      kind,
      measurementId: null,
      details: {},
      actor: run.therapistId,
      createdAt: at.toISOString(),
      ...extra,
    });
  }

  // --- The Home exercises step: the plan and the marks, as last said plus what this page has done ---
  const [teachPlan, setTeachPlan] = useState<TeachPlan | null>(props.exercises.plan);
  const [teachMarks, setTeachMarks] = useState<TeachingEvent[]>(props.exercises.marks);
  const [teachPreview, setTeachPreview] = useState<LiveDisplayText | null>(null);

  // --- Where the person is and what they have entered --------------------------------------
  const [currentId, setCurrentId] = useState(() => firstOpenStepId(protocol, state));
  const step = currentStep(protocol, currentId);
  const currentIdRef = useRef(currentId);
  useEffect(() => {
    currentIdRef.current = currentId;
  });
  const stepNumber = protocol.steps.findIndex((s) => s.id === step.id) + 1;
  const mode = toolMode(step);
  const availability = stepAvailability(protocol, state, step);
  const [ticked, setTicked] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      protocol.steps.filter((s) => state.setupConfirmed.has(s.id)).map((s) => [s.id, s.setup.map((i) => i.id)])
    )
  );
  const tickedSet = new Set(ticked[step.id] ?? []);
  const [answers, setAnswers] = useState<Record<string, boolean>>(() => ({ ...(state.redFlags?.answers ?? {}) }));
  const [resetKeys, setResetKeys] = useState<Record<string, number>>({});
  const resetKey = resetKeys[step.id] ?? 0;

  const handles = useRef<Record<string, EmbeddedHandle | null>>({});
  const [slotStatus, setSlotStatus] = useState<Record<string, EmbeddedStatus>>({});
  function registerSlot(slotKey: string, handle: EmbeddedHandle | null) {
    handles.current[`${step.id}|${slotKey}`] = handle;
  }
  function statusSlot(slotKey: string, status: EmbeddedStatus) {
    const key = `${step.id}|${slotKey}`;
    setSlotStatus((prev) => {
      const old = prev[key];
      if (old && old.hasResult === status.hasResult && old.missing === status.missing && old.saved === status.saved) return prev;
      return { ...prev, [key]: status };
    });
  }
  // ON/OFF and the last dose, the side, active or passive: asked once, carried to the next step.
  // The intake's affected side, when it is one side, is where a test starts.
  const [carried, setCarried] = useState<CarriedFacts>(() => ({ ...NO_CARRIED_FACTS, side: props.briefing?.startSide ?? "" }));
  const onCarry = useCallback((facts: CarriedFacts) => setCarried((prev) => mergeCarried(prev, facts)), []);
  const [layerRecord, setLayerRecord] = useState<{ stepId: string; id: string | null; missing: string | null } | null>(null);
  // The pain step's quick score (B4): its save, run by Save and next, and
  // which step it belongs to. Null when no number is picked.
  const quickPain = useRef<{ stepId: string; save: QuickPainSave } | null>(null);
  const [quickPainStep, setQuickPainStep] = useState<string | null>(null);
  const onQuickPain = useCallback(
    (save: QuickPainSave | null) => {
      quickPain.current = save ? { stepId: currentIdRef.current, save } : null;
      setQuickPainStep(save ? currentIdRef.current : null);
    },
    []
  );
  function recordLayer(id: string | null, missing: string | null) {
    setLayerRecord((prev) => (prev && prev.stepId === step.id && prev.id === id && prev.missing === missing ? prev : { stepId: step.id, id, missing }));
  }

  // --- Progress through a save -------------------------------------------------------------------
  const [busy, setBusy] = useState<"save" | "stop" | "skip" | "end" | null>(null);
  const [failure, setFailure] = useState<CockpitFailure | null>(null);
  const [dialog, setDialog] = useState<"stop" | "skip" | "end" | null>(null);
  // Stop test: the step it stopped (the dialog asks why afterwards), and a
  // stop the server has not recorded yet (the patient already has Rest).
  const [stoppedStepId, setStoppedStepId] = useState<string | null>(null);
  const [pendingStop, setPendingStop] = useState<{ stepId: string; reason: string | null; failure: CockpitFailure } | null>(null);
  // A stop for symptoms or a near-fall: the two next actions, under the card.
  const [stopFollowUp, setStopFollowUp] = useState<{ stepId: string; line: string } | null>(null);
  const [ended, setEnded] = useState<{ outcome: "completed" | "abandoned"; reason: EndReason | null; draft: string | null; readable: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Lines for the session note's "Anything to watch", added from the run
  // (a safety yes, a stop for symptoms or a near-fall) by the physiotherapist.
  const [watchLines, setWatchLines] = useState<string[]>([]);
  function addWatchLine(line: string) {
    setWatchLines((prev) => (prev.includes(line) ? prev : [...prev, line]));
  }

  // --- The patient's screen -------------------------------------------------------------------------
  const [startingText] = useState<LiveDisplayText>(() => {
    const built = buildLiveDisplay({ protocol, step: currentStep(protocol, firstOpenStepId(protocol, state)), phase: "ready", startClock: false });
    return built.ok ? built.write.display : { progress: "", title: "", line: "", picture: "sitting" };
  });
  const patientScreen = useDisplaySender({ runId: run.id, protocol, startingText, onFailure: setFailure });
  const pushDisplay = patientScreen.push;

  // Tell the patient's screen where we are as soon as the page opens.
  const firstPush = useRef(false);
  useEffect(() => {
    if (firstPush.current) return;
    firstPush.current = true;
    pushDisplay(currentId, patientControls(currentStep(protocol, currentId))[0], true);
    // The first moment only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openStep(id: string) {
    const target = protocol.steps.find((s) => s.id === id);
    if (!target || id === currentId) return;
    if (!stepAvailability(protocol, state, target).available) return;
    setCurrentId(id);
    setFailure(null);
    setNotice(null);
    setTeachPreview(null);
    pushDisplay(id, patientControls(target)[0], true);
    if (!state.outcomes.has(id)) {
      void postEvent({ runId: run.id, stepId: id, kind: "step_opened" }).then((r) => {
        if (r.ok) addEvent(r.data.event);
      });
    }
  }

  // --- What Save and next needs ---------------------------------------------------------------------------
  const slots = toolSlots(step);
  const answeredCount = (step.redFlags ?? []).filter((q) => typeof answers[q.id] === "boolean").length;
  let resultReady = true;
  let resultMissing: string | null = null;
  if (mode === "red_flags") {
    resultReady = answeredCount === (step.redFlags ?? []).length;
  } else if (mode === "measure") {
    for (const slot of slots) {
      const s = slotStatus[`${step.id}|${slot.key}`];
      if (!s || !s.hasResult) {
        resultReady = false;
        resultMissing = s?.missing ?? "Take the reading first.";
        break;
      }
    }
  } else if (mode === "layer") {
    const rec = layerRecord && layerRecord.stepId === step.id ? layerRecord : null;
    const quick = quickPainStep === step.id;
    resultReady = !!rec?.id || quick;
    resultMissing = quick ? null : rec?.missing ?? null;
  } else if (mode === "teach") {
    const planKeys = teachPlan ? teachPlan.items.map((i) => i.exerciseKey) : [];
    const marked = new Set(teachMarks.filter((m) => teachPlan && m.planId === teachPlan.id && m.runId === run.id).map((m) => m.exerciseKey));
    resultMissing = teachMissing(!!teachPlan, planKeys, marked);
    resultReady = resultMissing === null;
  }
  const blocked = !availability.available
    ? availability.reason
    : mode === "measure" || mode === "layer" || mode === "teach"
      ? exertionBlock(protocol, step, preExercise)
      : null;
  const readiness = saveReadiness({
    step,
    ticked: tickedSet,
    redFlags: mode === "red_flags" ? { answered: answeredCount, total: (step.redFlags ?? []).length } : undefined,
    resultReady,
    resultMissing,
    blocked,
  });
  const outcome = state.outcomes.get(step.id);
  const alreadyDone = outcome === "saved" || outcome === "skipped";
  const last = isLastStep(protocol, step.id);
  const upcoming = nextStepId(protocol, state, step.id);
  // A step already finished, with nothing new entered, simply moves on.
  const justMoveOn = alreadyDone && !readiness.ready && !!upcoming && availability.available && mode !== "red_flags" && mode !== "summary";
  const primaryLabel = justMoveOn ? "Next step" : last ? "Save and finish" : "Save and next";
  const canPrimary = justMoveOn || readiness.ready;
  const note = justMoveOn ? "This step is already saved. Enter a new reading to record another, or go on." : readiness.ready ? READY_NOTE : readiness.missing ?? "";

  const nav = stepNav(protocol, state, step.id);
  const rows = resultRows(protocol, state, measurements);
  const savedCount = rows.filter((r) => r.tone === "done").length;
  const summaryLine = `${savedCount} of ${rows.length} steps recorded so far${rows.some((r) => r.tone === "skipped") ? ", some skipped" : ""}.`;

  // --- Doing things -------------------------------------------------------------------------------------------
  function toFailure(r: Exclude<EmbeddedSaveResult, { ok: true }>): CockpitFailure {
    if (r.kind === "local") return { message: r.message, fix: null, kind: "refused" };
    if (r.kind === "server") return cockpitFailure(r.failure);
    return OFFLINE_FAILURE;
  }

  /** The Home exercises tool needs the ticked set-up on the run before the
   *  patient's turn, a mark or a plan with a helper exercise. Null when it
   *  stands; otherwise why not. */
  async function ensureSetup(): Promise<CockpitFailure | null> {
    const items = step.setup.filter((i) => tickedSet.has(i.id)).map((i) => i.id);
    const helperTicked = step.setup.some((i) => i.helper === true && tickedSet.has(i.id));
    if (state.setupConfirmed.has(step.id) && (!helperTicked || state.helperConfirmed.has(step.id))) return null;
    const r = await postEvent({ runId: run.id, stepId: step.id, kind: "setup_confirmed", details: { items } });
    if (!r.ok) return r.failure;
    addEvent(r.data.event);
    return null;
  }

  async function save() {
    if (busy) return;
    if (justMoveOn && upcoming) {
      openStep(upcoming);
      return;
    }
    if (!readiness.ready) return;
    setBusy("save");
    setFailure(null);
    setNotice(null);
    try {
      // 1. The set-up, ticked in full, is a fact the run keeps.
      if (!state.setupConfirmed.has(step.id)) {
        const r = await postEvent({ runId: run.id, stepId: step.id, kind: "setup_confirmed", details: { items: step.setup.filter((i) => tickedSet.has(i.id)).map((i) => i.id) } });
        if (!r.ok) return setFailure(r.failure);
        addEvent(r.data.event);
      }

      let flaggedAfter = false;
      // 2. The step's own result.
      if (mode === "red_flags") {
        const r = await postEvent({ runId: run.id, stepId: step.id, kind: "safety_confirmed", details: { answers } });
        if (!r.ok) return setFailure(r.failure);
        addEvent(r.data.event);
        flaggedAfter = (r.data.flagged?.length ?? 0) > 0;
        const saved = await postEvent({ runId: run.id, stepId: step.id, kind: "saved" });
        if (!saved.ok) return setFailure(saved.failure);
        addEvent(saved.data.event);
      } else if (mode === "measure") {
        for (const slot of slots) {
          const handle = handles.current[`${step.id}|${slot.key}`];
          if (!handle) return setFailure({ message: "The reading is not ready yet.", fix: "Take it, then save again.", kind: "refused" });
          const r = await handle.save();
          if (!r.ok) return setFailure(toFailure(r));
          if (r.measurement) {
            const point = r.measurement;
            setExtraMeasurements((prev) => (prev.some((p) => p.id === point.id) ? prev : [...prev, point]));
            if (r.eventRecorded) {
              addLocalEvent(step.id, "saved", { id: r.eventId ?? undefined, measurementId: point.id });
            } else {
              // The reading stands (it is append-only); only the run's note of it is missing.
              const again = await postEvent({ runId: run.id, stepId: step.id, kind: "saved", measurementId: point.id });
              if (!again.ok) return setFailure(again.failure);
              addEvent(again.data.event);
            }
          }
        }
        // The resting vitals of a heart and lung assessment: the server works
        // out the pre-exercise check from what was just saved.
        if (step.id === protocol.preExerciseVitalsStepId) {
          const check = await postEvent({ runId: run.id, stepId: step.id, kind: "safety_confirmed", details: {} });
          if (!check.ok) return setFailure(check.failure);
          addEvent(check.data.event);
          if (check.data.preExercise?.status === "stop") {
            setNotice(check.data.preExercise.refusal ?? "The resting check says not to exercise today. Skip the exercise steps and contact the patient's doctor.");
          } else if (check.data.preExercise?.status === "incomplete") {
            setNotice("The resting check is not complete yet: not every reading was taken.");
          }
        }
      } else if (mode === "layer") {
        let recordId = layerRecord?.stepId === step.id ? layerRecord.id : null;
        // A pain score picked on the buttons is recorded on the Pain Map first.
        const quick = quickPain.current && quickPain.current.stepId === step.id ? quickPain.current.save : null;
        if (quick) {
          const q = await quick();
          if (!q.ok) return setFailure(q.failure);
          recordId = q.id;
        }
        if (!recordId) return setFailure({ message: layerRecord?.missing ?? "Record the exam first.", fix: null, kind: "refused" });
        const r = await postEvent({ runId: run.id, stepId: step.id, kind: "saved", details: { recordId } });
        if (!r.ok) return setFailure(r.failure);
        addEvent(r.data.event);
      } else {
        const r = await postEvent({ runId: run.id, stepId: step.id, kind: "saved" });
        if (!r.ok) return setFailure(r.failure);
        addEvent(r.data.event);
      }

      // 3. The summary ends the run; anything else moves on.
      if (mode === "summary") {
        const done = await postEnd({ runId: run.id, outcome: "completed" });
        if (!done.ok) return setFailure(done.failure);
        setEnded({ outcome: "completed", reason: null, draft: done.data.summaryDraft, readable: done.data.summaryDraftReadable });
        show("Assessment saved");
        router.refresh();
        return;
      }
      show(`${step.title} saved`);
      router.refresh();
      const target =
        mode === "red_flags" && flaggedAfter
          ? protocol.steps.find((s) => s.tool === "summary")?.id ?? null
          : mode === "red_flags"
            ? protocol.steps[1]?.id ?? null
            : nextStepId(protocol, state, step.id);
      if (target) {
        const targetStep = currentStep(protocol, target);
        setCurrentId(target);
        setTeachPreview(null);
        pushDisplay(target, patientControls(targetStep)[0], true);
        void postEvent({ runId: run.id, stepId: target, kind: "step_opened" }).then((r) => {
          if (r.ok) addEvent(r.data.event);
        });
      }
    } finally {
      setBusy(null);
    }
  }

  /**
   * Stop test is an emergency stop: the first tap stops the clock (the tool
   * starts again from nothing, so a running timer is gone) and puts Rest on
   * the patient's screen at once. Only then does it ask why, and the answer
   * is optional; the `stopped` event is written after. A second tap while the
   * question is open does nothing.
   */
  function stopNow() {
    if (busy || dialog === "stop") return;
    const id = step.id;
    setResetKeys((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
    setSlotStatus((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${id}|`))));
    if (mode === "red_flags") setAnswers({});
    setTeachPreview(null);
    pushDisplay(id, patientControls(step).find((c) => c.key === "rest")!, true);
    setFailure(null);
    setNotice("Stopped. Nothing from that attempt was kept.");
    setStoppedStepId(id);
    setDialog("stop");
  }

  /** Writes the stop (with its optional reason). A failure keeps the stop
   *  waiting with a retry: the patient already has Rest either way. */
  async function recordStop(stepId: string, reasonKey: string | null) {
    if (busy === "stop") return;
    setBusy("stop");
    const r = await postEvent({ runId: run.id, stepId, kind: "stopped", details: reasonKey ? { reason: reasonKey } : {} });
    setBusy(null);
    setDialog(null);
    setStoppedStepId(null);
    if (!r.ok) {
      setPendingStop({ stepId, reason: reasonKey, failure: r.failure });
      return;
    }
    setPendingStop(null);
    addEvent(r.data.event);
    const stopped = protocol.steps.find((s) => s.id === stepId);
    if (stopped && (reasonKey === "symptoms" || reasonKey === "near_fall")) {
      setStopFollowUp({ stepId, line: `${stopped.title} stopped: ${STOP_REASONS[reasonKey].toLowerCase()}.` });
    }
    router.refresh();
  }

  async function skipStep(reasonKey: string | null) {
    if (busy) return;
    setBusy("skip");
    setFailure(null);
    const r = await postEvent({ runId: run.id, stepId: step.id, kind: "skipped", details: reasonKey ? { reason: reasonKey } : {} });
    setBusy(null);
    setDialog(null);
    if (!r.ok) return setFailure(r.failure);
    addEvent(r.data.event);
    show(`${step.title} skipped`);
    router.refresh();
    const target = nextStepId(protocol, state, step.id);
    if (target) openStep(target);
  }

  async function endEarly(reasonKey: string | null) {
    if (busy || !reasonKey) return;
    setBusy("end");
    setFailure(null);
    const r = await postEnd({ runId: run.id, outcome: "abandoned", reason: reasonKey as EndReason });
    setBusy(null);
    setDialog(null);
    if (!r.ok) return setFailure(r.failure);
    setEnded({ outcome: "abandoned", reason: reasonKey as EndReason, draft: r.data.summaryDraft, readable: r.data.summaryDraftReadable });
    router.refresh();
  }

  // An embedded timer started, finished or was thrown away: the patient's
  // clock follows (Go with the clock, Done, or Rest, which clears it).
  function onTimerEvent(event: TimerClockEvent) {
    pushDisplay(step.id, displayForTimerEvent(step, event), true);
  }
  const startBlocked = timerStartBlock(protocol, step, preExercise, tickedSet);

  // N is Save and next (when it is on), Esc is Stop test. The handler reads
  // the latest render through a ref; cockpitShortcut ignores typing, an open
  // dialog (its own Esc closes it), repeats and modifiers.
  const keyActions = useRef({ save: () => {}, stop: () => {}, canSave: false, dialogOpen: false, ended: false });
  useEffect(() => {
    keyActions.current = { save: () => void save(), stop: stopNow, canSave: canPrimary && !busy, dialogOpen: dialog !== null, ended: !!ended };
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const now = keyActions.current;
      if (now.ended) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      const modal = now.dialogOpen || !!document.querySelector('[aria-modal="true"]');
      const action = cockpitShortcut(
        e,
        el ? { tag: el.tagName, inputType: el instanceof HTMLInputElement ? el.type : null, editable: el.isContentEditable } : null,
        modal
      );
      if (action === "save" && now.canSave) {
        e.preventDefault();
        now.save();
      } else if (action === "stop") {
        e.preventDefault();
        now.stop();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const flagged = redFlagsRaised(state);
  const safetyChip = !state.redFlags
    ? { text: "Safety questions not asked yet", tone: "bg-slate-100 text-slate-800" }
    : flagged
      ? { text: "A safety concern was noted", tone: "bg-red-100 text-red-900" }
      : { text: "Safety check passed", tone: "bg-emerald-50 text-emerald-900" };

  return (
    <div className="flex flex-col gap-3.5" data-testid="session-cockpit">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-display text-xl font-extrabold text-slate-900 [overflow-wrap:anywhere]">{patient.name}</h1>
          <span className="text-sm text-slate-700">{props.headline}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span data-testid="safety-chip" className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${safetyChip.tone}`}>
            {safetyChip.text}
          </span>
          <Link
            href={chartHref}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:border-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
          >
            Chart
          </Link>
          {!ended && (
            <button
              type="button"
              data-testid="end-assessment"
              onClick={() => setDialog("end")}
              disabled={!!busy}
              className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:border-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-60"
            >
              End assessment
            </button>
          )}
        </div>
        {props.briefing && !ended && <BeforeYouStart briefing={props.briefing} compact />}
      </header>

      {!ended && <StepBar items={nav} onPick={openStep} />}

      {!ended && (
        <p data-testid="stop-at-once" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] leading-snug text-amber-950 sm:text-sm">
          <strong>Stop at once if</strong> {protocol.stopAtOnce.map((s) => s.toLowerCase()).join(", ")}.
        </p>
      )}

      {preExercise === "stop" && (
        <p role="alert" data-testid="no-exercise-banner" className="rounded-xl border-2 border-red-600 bg-red-50 px-4 py-3 text-[15px] font-semibold text-red-950">
          The resting check says not to exercise today. Skip the exercise steps and contact the patient{"'"}s doctor.
        </p>
      )}

      <div className="flex flex-col gap-3.5 lg:flex-row lg:items-start">
        <section className="flex min-w-0 flex-col gap-3.5 lg:flex-[3_1_30rem]" aria-label="Current step">
          {ended ? (
            <FinishedPanel
              patientId={patient.id}
              patientName={patient.name}
              profileKind={profileKind}
              outcome={ended.outcome}
              reason={ended.reason}
              summaryDraft={ended.draft}
              draftReadable={ended.readable}
              chartHref={chartHref}
              finish={props.finish ?? { status: "none" }}
              prefill={{
                treated: treatedLineFromRun(protocol.title, rows),
                // Only the two fields the line is built from are read.
                homeExercise: teachPlan && teachPlan.items.length > 0 ? homeExerciseNotePrefill(teachPlan as unknown as ExercisePlan) : null,
                watch: watchLines.length > 0 ? watchLines.join(" ") : null,
                whatWeDid: ended.draft ? ended.draft.slice(0, SESSION_SUMMARY_MAX_CHARS) : null,
              }}
            />
          ) : (
            <>
              <StepCard
                key={step.id}
                step={step}
                helperCarried={[...state.helperConfirmed].some((id) => id !== step.id)}
                number={stepNumber}
                total={protocol.steps.length}
                ticked={tickedSet}
                locked={availability.available ? null : availability.reason}
                onToggle={(itemId) =>
                  setTicked((prev) => {
                    const now = new Set(prev[step.id] ?? []);
                    if (now.has(itemId)) now.delete(itemId);
                    else now.add(itemId);
                    return { ...prev, [step.id]: [...now] };
                  })
                }
              >
                <ToolArea
                  step={step}
                  locked={!availability.available}
                  resetKey={resetKey}
                  redFlags={{
                    answers,
                    onAnswer: (id, yes) => {
                      setFailure(null);
                      setAnswers((prev) => ({ ...prev, [id]: yes }));
                    },
                    onEnd: () => setDialog("end"),
                    onWatch: addWatchLine,
                    watched: watchLines,
                  }}
                  measure={{
                    runId: run.id,
                    helperPresent: step.setup.some((i) => i.helper === true && tickedSet.has(i.id)),
                    patientId: patient.id,
                    patientName: patient.name,
                    profileKind,
                    series: props.series,
                    enabledLicensed: props.enabledLicensed,
                    licenceUnreadable: props.licenceUnreadable,
                    appointmentId: run.appointmentId,
                    onRegister: registerSlot,
                    onStatus: statusSlot,
                    onTimerEvent: onTimerEvent,
                    startBlocked,
                    carry: carried,
                    onCarry,
                  }}
                  layer={{
                    patientId: patient.id,
                    patientName: patient.name,
                    runStartedAt: run.startedAt,
                    onRecord: recordLayer,
                    onQuick: onQuickPain,
                    intakeAreas: props.intakeAreas ?? [],
                    fallbackRegion: protocol.key === "ortho_knee" ? "knee" : null,
                  }}
                  teach={{
                    runId: run.id,
                    protocol,
                    step,
                    profileKind,
                    contraFlags: props.exercises.contraFlags,
                    loadStatus: props.exercises.loadStatus,
                    plan: teachPlan,
                    marks: teachMarks,
                    helperTicked: step.setup.some((i) => i.helper === true && tickedSet.has(i.id)),
                    setupReady: setupProgress(step, tickedSet).remaining === 0,
                    exertionBlocked: blocked,
                    ensureSetup,
                    onPlan: setTeachPlan,
                    onMark: (e) => setTeachMarks((prev) => addTeachMark(prev, e)),
                    onPreview: setTeachPreview,
                  }}
                  summaryLine={summaryLine}
                  summary={{
                    patientId: patient.id,
                    rows:
                      mode === "summary"
                        ? summaryRows(
                            protocol,
                            state,
                            measurements,
                            props.series,
                            props.milestones?.status === "ok" ? props.milestones.items : [],
                            (ms, m) => measurementProvesMilestone(ms, m).ok
                          )
                        : [],
                    milestonesUnreadable: props.milestones?.status === "unreadable",
                  }}
                />
              </StepCard>

              <div aria-live="polite" className="empty:hidden">
                {failure && (
                  <p
                    role="alert"
                    data-testid="cockpit-failure"
                    data-kind={failure.kind}
                    className={`rounded-xl border px-4 py-3 text-[15px] ${
                      failure.kind === "refused" ? "border-red-200 bg-red-50 text-red-950" : "border-amber-300 bg-amber-50 text-amber-950"
                    }`}
                  >
                    <span className="font-semibold">{failure.message}</span>
                    {failure.fix && <span className="mt-0.5 block font-bold">{failure.fix}</span>}
                  </p>
                )}
                {pendingStop && (
                  <div role="alert" data-testid="stop-not-recorded" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[15px] text-amber-950">
                    <p className="font-semibold">
                      {firstName}
                      {"'"}s screen says Rest, but the stop is not on the record yet. {pendingStop.failure.message}
                    </p>
                    <button
                      type="button"
                      data-testid="stop-retry"
                      disabled={busy === "stop"}
                      onClick={() => void recordStop(pendingStop.stepId, pendingStop.reason)}
                      className="mt-2 min-h-[44px] rounded-xl border border-amber-500 bg-white px-4 text-sm font-bold text-amber-950 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 disabled:opacity-60"
                    >
                      Record the stop again
                    </button>
                  </div>
                )}
                {stopFollowUp && stopFollowUp.stepId === step.id && (
                  <div data-testid="stop-follow-up" className="rounded-xl border-2 border-red-600 bg-red-50 px-4 py-3 text-[15px] text-red-950">
                    <p className="font-semibold">{stopFollowUp.line} Check how they are before anything else.</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className="font-semibold">Next:</span>
                      <button type="button" onClick={() => setDialog("end")} className="min-h-[44px] font-bold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">
                        End the assessment
                      </button>
                      {watchLines.includes(stopFollowUp.line) ? (
                        <span className="font-semibold text-teal-900">Added to Anything to watch</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addWatchLine(stopFollowUp.line)}
                          className="min-h-[44px] font-bold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                        >
                          Add to Anything to watch
                        </button>
                      )}
                    </p>
                  </div>
                )}
                {!failure && notice && (
                  <p data-testid="cockpit-notice" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] font-semibold text-slate-900">
                    {notice}
                  </p>
                )}
              </div>

              <ActionBar
                skippable={step.skippable && availability.available}
                canSave={canPrimary}
                saving={busy === "save"}
                busy={!!busy}
                primaryLabel={primaryLabel}
                note={note}
                onStop={stopNow}
                onSkip={() => setDialog("skip")}
                onSave={() => void save()}
                keyHint={COCKPIT_KEY_HINT}
                screen={{
                  firstName,
                  controls: patientControls(step),
                  active: patientScreen.activeControl,
                  status: patientScreen.status,
                  onControl: (c) => pushDisplay(step.id, c, true),
                  onRetry: patientScreen.retry,
                }}
              />
            </>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-3.5 lg:flex-[1_1_17.5rem]" aria-label="Results and the patient's screen">
          <Disclosure title="Today's results" defaultOpen={false}>
            <ResultsPanel rows={rows} />
          </Disclosure>
          <Disclosure title={`What ${firstName} sees`} defaultOpen={false}>
            <div className="flex flex-col gap-3.5">
              <PatientPreview
                firstName={firstName}
                text={
                  ended
                    ? { progress: patientScreen.text.progress, title: "All done", line: "That is everything for today. Thank you.", picture: "talking" }
                    : mode === "teach" && teachPreview
                      ? teachPreview
                      : patientScreen.text
                }
                view={ended ? null : patientScreen.view}
                serverOffsetMs={patientScreen.offsetMs}
                status={patientScreen.status}
                onRetry={patientScreen.retry}
              />
            </div>
          </Disclosure>
        </aside>
      </div>

      {dialog === "stop" && stoppedStepId && (
        <ReasonDialog
          title="Test stopped"
          body={`The clock is stopped and ${firstName}'s screen says Rest. Nothing from this attempt is kept. Why did you stop? (optional)`}
          options={STOP_OPTIONS}
          noReasonLabel="No reason"
          cancelLabel={null}
          busy={busy === "stop"}
          onPick={(key) => void recordStop(stoppedStepId, key)}
          onClose={() => void recordStop(stoppedStepId, null)}
        />
      )}
      {dialog === "skip" && (
        <ReasonDialog
          title={`Skip ${step.title.toLowerCase()}?`}
          body="It is left out of today's record, and the summary says so. Why? (optional)"
          options={SKIP_OPTIONS}
          noReasonLabel="Skip without a reason"
          busy={busy === "skip"}
          onPick={(key) => void skipStep(key)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "end" && (
        <ReasonDialog
          title="End the assessment now?"
          body="What you have saved stays on the record. The patient's screen says All done. Why are you ending it?"
          options={Object.entries(END_REASONS).map(([key, label]) => ({ key, label }))}
          confirmTone="danger"
          busy={busy === "end"}
          onPick={(key) => void endEarly(key)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

