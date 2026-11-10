import { outcomeMeasure, type ProfileKind } from "@/lib/outcomeMeasures";
import { formatReading } from "@/lib/progressChart";
import { CARE_STATUS_SUMMARY_MAX } from "@/lib/careStatus";
import { SKIP_REASONS, STOP_REASONS, type ProtocolStep, type SessionProtocol } from "@/lib/sessionProtocols";
import { END_REASONS, runStateFromEvents, type AssessmentRun, type EndReason, type RunEvent } from "@/lib/assessmentRun";
import { teachingSummarySentence, type TeachingEvent } from "@/lib/exercisePlan";

// The "Where things stand" draft a guided video assessment leaves behind
// (phase 7a; the home exercises taught were added in phase 7d): two to four
// plain sentences, five when exercises were taught, built ONLY from what was saved in
// the run -- a reading that was stopped is never a result, a skipped or
// stopped step is named honestly, a red flag or an early end is said. It is a
// draft: the physiotherapist edits it and saves it through the existing
// care-status `set_summary` action (careStatusRoute.ts), which is where it
// becomes their written summary with their byline. Nothing here is shown to
// the patient on its own.

export type SummaryVoice = "patient" | "clinician";

export type SummaryMeasurement = {
  id: string;
  measureKey: string;
  variant: string | null;
  side: "left" | "right" | null;
  value: number;
  /** A calculated measure's readings (blood pressure's two numbers). */
  items?: unknown;
};

/** The skip reasons in the patient's own words (the cockpit's are the
 *  clinician's, in SKIP_REASONS). */
const SKIP_REASON_PATIENT: Record<keyof typeof SKIP_REASONS, string> = {
  patient_declined: "you preferred not to today",
  too_painful: "it was too painful today",
  not_safe_today: "it was not safe to do today",
  no_helper: "no one could stand beside you",
  no_equipment: "the equipment was not to hand",
  no_space: "there was not enough space",
  out_of_time: "we ran out of time",
  other: "we will try it another time",
};

const END_REASON_PATIENT: Record<EndReason, string> = {
  red_flag: "one of the safety questions raised a concern",
  patient_unwell: "you were not feeling well",
  connection_lost: "the video call dropped",
  out_of_time: "we ran out of time",
  patient_declined: "you preferred to stop",
  other: "we needed to stop",
};

const MAX_READINGS = 6;

function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function readingText(step: ProtocolStep, m: SummaryMeasurement, voice: SummaryVoice): string {
  const measure = outcomeMeasure(m.measureKey);
  if (!measure) return `${lowerFirst(step.title)} ${m.value}`;
  const variant = measure.variants?.find((v) => v.key === m.variant)?.label ?? null;
  let name: string;
  if (measure.key === "joint_range" && variant) name = variant;
  else {
    name = step.measures.length === 1 ? step.title : voice === "patient" ? measure.plainName : measure.label;
    if (variant) name = `${name} (${lowerFirst(variant)})`;
  }
  const bp = m.items && typeof m.items === "object" && !Array.isArray(m.items) ? (m.items as Record<string, unknown>) : null;
  const value =
    measure.key === "blood_pressure" && bp && typeof bp.systolic === "number" && typeof bp.diastolic === "number"
      ? `${bp.systolic}/${bp.diastolic} mmHg`
      : formatReading(m.value, measure.decimals, measure.unit);
  const outOf = /^0-(\d+)$/.test(measure.unit) ? ` out of ${measure.unit.slice(2)}` : "";
  const side = m.side ? `, ${m.side}` : "";
  return `${lowerFirst(name)} ${value}${outOf}${side}`;
}

/**
 * The draft, or null when the run holds nothing to say (no step past the
 * safety check was reached). `measurements` are the rows the run's "saved"
 * events point at; any other row is ignored.
 */
export function assessmentSummaryDraft(input: {
  run: AssessmentRun;
  protocol: SessionProtocol;
  events: readonly RunEvent[];
  measurements: readonly SummaryMeasurement[];
  profileKind: ProfileKind;
  voice: SummaryVoice;
  /** What the physiotherapist marked while teaching the home exercises in
   *  this run (exercise_teaching_events); rows of another run are ignored. */
  teaching?: readonly TeachingEvent[];
}): string | null {
  const { run, protocol, voice } = input;
  const state = runStateFromEvents(input.events.filter((e) => e.runId === run.id));
  const byId = new Map(input.measurements.map((m) => [m.id, m]));
  // The Home exercises step is teaching, not a check: it is said in its own
  // sentence below, never counted as one of the tests.
  const testSteps = protocol.steps.filter((s) => s.tool !== "red_flags" && s.tool !== "summary" && s.tool !== "teach_exercises");
  const teachStep = protocol.steps.find((s) => s.tool === "teach_exercises");
  const teaching = (input.teaching ?? []).filter((e) => e.runId === run.id);

  const readings: string[] = [];
  const recordedElsewhere: string[] = [];
  const skipped: string[] = [];
  const stopped: string[] = [];
  let done = 0;
  for (const step of testSteps) {
    const outcome = state.outcomes.get(step.id);
    if (outcome === "saved") {
      done++;
      const ids = state.savedMeasurements.get(step.id) ?? [];
      const rows = ids.map((id) => byId.get(id)).filter((m): m is SummaryMeasurement => !!m);
      if (rows.length > 0) for (const m of rows) readings.push(readingText(step, m, voice));
      else recordedElsewhere.push(lowerFirst(step.title));
    } else if (outcome === "skipped") {
      const reason = state.reasons.get(step.id) as keyof typeof SKIP_REASONS | undefined;
      const why = reason && reason in SKIP_REASONS ? (voice === "patient" ? SKIP_REASON_PATIENT[reason] : lowerFirst(SKIP_REASONS[reason])) : null;
      skipped.push(`${lowerFirst(step.title)}${why ? ` (${why})` : ""}`);
    } else if (outcome === "stopped") {
      const reason = state.reasons.get(step.id) as keyof typeof STOP_REASONS | undefined;
      const why = voice === "clinician" && reason && reason in STOP_REASONS ? ` (${lowerFirst(STOP_REASONS[reason])})` : "";
      stopped.push(`${lowerFirst(step.title)}${why}`);
    }
  }

  const flagged = (state.redFlags?.flagged.length ?? 0) > 0;
  const teachSkipped = !!teachStep && state.outcomes.get(teachStep.id) === "skipped" && teaching.length === 0;
  const reachedAnything = done + skipped.length + stopped.length + teaching.length > 0 || teachSkipped;
  if (!reachedAnything && !flagged && !state.redFlags) return null;

  const sentences: string[] = [];
  const total = testSteps.length;
  if (voice === "patient") {
    sentences.push(done > 0 ? `In today's video session we did ${done} of the ${total} checks together.` : "In today's video session we did not get to the checks.");
  } else {
    sentences.push(done > 0 ? `Guided video assessment: ${done} of ${total} tests recorded.` : "Guided video assessment: no tests recorded.");
  }

  const shown = readings.slice(0, MAX_READINGS);
  const more = readings.length - shown.length;
  const results = [...shown, ...recordedElsewhere.map((t) => (voice === "patient" ? `${t} noted` : `${t} recorded`))];
  if (results.length > 0) {
    const list = listWords(more > 0 ? [...results, `${more} more`] : results);
    sentences.push(voice === "patient" ? `Your results: ${list}.` : `Results: ${list}.`);
  }

  const exercises = teachingSummarySentence(teaching, voice);
  if (exercises) sentences.push(exercises);
  else if (teachSkipped) sentences.push(voice === "patient" ? "We did not go through home exercises today." : "Home exercises skipped.");

  const gaps: string[] = [];
  if (skipped.length) gaps.push(voice === "patient" ? `we left out ${listWords(skipped)}` : `skipped ${listWords(skipped)}`);
  if (stopped.length) {
    gaps.push(voice === "patient" ? `we stopped ${listWords(stopped)} before the end, so nothing was kept` : `stopped ${listWords(stopped)} before the end, nothing kept`);
  }
  if (gaps.length) {
    const text = gaps.join("; ");
    sentences.push(`${text.charAt(0).toUpperCase()}${text.slice(1)}.`);
  }

  if (flagged) {
    sentences.push(
      voice === "patient"
        ? "One of the safety questions raised a concern, so we did no tests today."
        : "A red-flag question was answered yes, so testing stopped."
    );
  } else if (run.status === "abandoned" && run.endedReason) {
    sentences.push(
      voice === "patient"
        ? `We finished early because ${END_REASON_PATIENT[run.endedReason]}.`
        : `Ended early: ${lowerFirst(END_REASONS[run.endedReason])}.`
    );
  }

  let text = sentences.slice(0, exercises || teachSkipped ? 5 : 4).join(" ");
  if (text.length > CARE_STATUS_SUMMARY_MAX) text = `${text.slice(0, CARE_STATUS_SUMMARY_MAX - 1).trimEnd()}…`;
  return text;
}
