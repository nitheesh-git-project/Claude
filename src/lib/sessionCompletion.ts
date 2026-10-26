// When a therapist may close a session, as either delivered or a no-show.
//
// Completion used to open at `slot time - join window` -- the moment the Join
// button lights up -- for both outcomes. A session could be marked done
// before it had begun, and a patient marked a no-show before they could
// possibly be late: a premature no-show forfeits the patient's programme
// credit and creates the therapist's earnings for a session that never had a
// chance to happen.
//
// - Done: once the session's scheduled start has arrived.
// - No-show: once the late-arrival grace (`join_window_after_minutes`, the
//   same "how late can somebody join" figure the Join button uses) has
//   passed after the start.
//
// An admin correcting the record is not subject to either; the route
// exempts them. Dependency-free so the boundary is unit-tested.

import type { ConditionSpecialty } from "@/lib/conditionSpecialty";

export type CompletionKind = "done" | "no_show";

export function completionOpensAtMs(
  slotMs: number,
  kind: CompletionKind,
  lateGraceMinutes: number
): number {
  if (kind === "done") return slotMs;
  return slotMs + Math.max(0, lateGraceMinutes) * 60_000;
}

export function completionRefusal(kind: CompletionKind, lateGraceMinutes: number): string {
  return kind === "done"
    ? "This session hasn't started yet. You can mark it done once it's under way."
    : `A patient counts as a no-show once they're more than ${Math.max(
        0,
        lateGraceMinutes
      )} minutes late. Try again after that.`;
}

/** How long before the slot a Pain Map exam still counts as this session's
 *  -- one recorded while setting up the call is part of it. */
export const SESSION_EXAM_LEAD_MS = 60 * 60_000;

/**
 * The earliest real `created_at` a Pain Map exam may carry and still count
 * as recorded during this session -- the evidence Done requires.
 *
 * `debugOffsetMs` is the debug clock's offset (serverNowOffsetMs on the
 * server, getDebugNowOffsetMs in the browser; 0 whenever the bar is off).
 * The row's `created_at` is stamped by the database on the real clock, so
 * under a simulated clock an exam taken "during" a session that is still
 * hours away in real time carries a real time hours before it. Shifting the
 * window by the offset compares like with like; it is deliberately a
 * required argument, because a silent real-time default is exactly how the
 * exam gate came to judge one session by two clocks.
 */
export function sessionExamWindowStartMs(slotMs: number, debugOffsetMs: number): number {
  return slotMs - SESSION_EXAM_LEAD_MS - debugOffsetMs;
}

// --- Which examination Done requires -----------------------------------------

/** The examination a delivered session must leave on the record, by the
 *  patient's condition type: the Pain Map for an orthopaedic patient, the
 *  neurological examination chart for a neurological one, the paediatric
 *  examination (milestones) for a paediatric one. Geriatric and
 *  cardiopulmonary patients have none (requiredSessionExam returns null). */
export type SessionExamKind = "pain_map" | "neuro_exam" | "peds_exam";

/**
 * Whether a paediatric Done requires the paediatric examination: it does,
 * exactly like ortho and neuro (the owner's decision), now that the note
 * dialog can record one - `SessionPedsExamStep`, mounted as the "peds_exam"
 * arm of `SessionExamStep` (Health Profile redesign, phase 5b). The server
 * half (peds_assessments, both submit routes, the complete-session read and
 * its 409 `peds_exam_required`) was built first (phase 5a) and held the
 * requirement off until a control existed to satisfy it, since a gate with
 * nothing to press would have blocked every paediatric session.
 *
 * sessionCompletion.test.ts fails if this is on while SessionExamStep has no
 * paediatric arm, so the two cannot drift apart again.
 */
export const PEDS_EXAM_REQUIRED_FOR_DONE = true;

/**
 * Which exam Done requires, or null when the condition type has none.
 * `pedsGate` is `PEDS_EXAM_REQUIRED_FOR_DONE` unless a test says otherwise.
 * The exhaustive switch makes a new condition type without an arm a type
 * error rather than an ungated condition type.
 */
export function requiredSessionExam(
  specialty: ConditionSpecialty,
  pedsGate: boolean = PEDS_EXAM_REQUIRED_FOR_DONE
): SessionExamKind | null {
  switch (specialty) {
    case "ortho":
      return "pain_map";
    case "neuro":
      return "neuro_exam";
    case "pediatrics":
      return pedsGate ? "peds_exam" : null;
    // Phase 6a, the owner's decision: Strength and balance care and Heart and
    // lung rehabilitation have NO exam before Done. Their progress is the
    // shared measurements (the four STEADI tests, the six-minute walk, the
    // vitals) recorded through Record a test, and no single layer stands for
    // "this session was examined" the way the Pain Map does for ortho. A
    // therapist's Done still needs the session note. If that decision
    // changes, this is the one place to give them a layer.
    case "geriatric":
    case "cardiopulmonary":
      return null;
    default: {
      const exhaustive: never = specialty;
      return exhaustive;
    }
  }
}

/** The refusal code and sentence for a Done with no exam this session. */
export const SESSION_EXAM_REFUSAL: Record<SessionExamKind, { code: string; error: string }> = {
  pain_map: {
    code: "pain_map_required",
    error: "Update the Pain Map for this session before marking it done.",
  },
  neuro_exam: {
    code: "neuro_exam_required",
    error: "Record the neurological examination for this session before marking it done.",
  },
  peds_exam: {
    code: "peds_exam_required",
    error: "Record the paediatric examination for this session before marking it done.",
  },
};

const MISSING_MESSAGE: Record<SessionExamKind, string> = {
  pain_map: "Update the Pain Map for this session before finishing it.",
  neuro_exam: "Record the neurological examination for this session before finishing it.",
  peds_exam: "Record the paediatric examination for this session before finishing it.",
};

/** The same refusal as the note dialog says it, where the act is "finishing". */
export function sessionExamMissingMessage(kind: SessionExamKind): string {
  return MISSING_MESSAGE[kind];
}

/**
 * The exam Done is still missing, or null when the session may close.
 * `counts` are the rows this therapist recorded inside
 * `sessionExamWindowStartMs`, per layer. Only the layer the condition type
 * requires counts: a neurological patient is never asked for pain scores,
 * nor an orthopaedic one for a neurological chart, and no layer stands in
 * for another.
 */
export function missingSessionExam(
  specialty: ConditionSpecialty,
  counts: { painMap: number; neuroExam: number; pedsExam?: number },
  pedsGate: boolean = PEDS_EXAM_REQUIRED_FOR_DONE
): SessionExamKind | null {
  const required = requiredSessionExam(specialty, pedsGate);
  if (required === "pain_map") return counts.painMap > 0 ? null : "pain_map";
  if (required === "neuro_exam") return counts.neuroExam > 0 ? null : "neuro_exam";
  if (required === "peds_exam") return (counts.pedsExam ?? 0) > 0 ? null : "peds_exam";
  return null;
}
