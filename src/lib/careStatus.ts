import { isProfileKind, type ProfileKind } from "@/lib/outcomeMeasures";
import { PHASES_BY_PROFILE_KIND } from "@/lib/milestoneTemplates";
import { STATUS_OVERRIDE_REASON_MAX, validateStatusOverride, type StatusOverride } from "@/lib/profileStatus";

// The physiotherapist's two judgements on a Health Profile that the maths
// does not make: which PHASE of the course the patient is in (one of the
// profile kind's four, milestoneTemplates.ts), and an OVERRIDE of the
// computed status pill (Improving / Holding steady / Needs attention) with a
// reason (profileStatus.ts).
//
// Both are history, not a mutable cell: every change is a row in the
// append-only care_status_events table (supabase/schema.sql, phase 3a), and
// what a screen shows is shaped from the rows here -- the latest phase
// wins, the latest override wins, and an "override_cleared" row ends the
// override before it. So "who said Needs attention, when, and why" always
// has an answer, and an override is never silently replaced.
//
// The phase is set by the physiotherapist; inferPhase() (progressView.ts) is
// only the fallback a screen uses when no phase has been set. An override
// is flagged `stale` when a review (a newer measurement) has happened since
// it was set, so the screen can ask the physiotherapist to look again
// rather than letting an old judgement sit over new numbers.
//
// Phase 4a adds a third judgement: "Where things stand", WRITTEN by the
// physiotherapist (kind "summary", the text in `value`). The latest summary
// is the one in force -- whatever profile kind it was written under, since
// it is prose about this patient rather than one of a kind's phases -- and
// it is `stale` when a review is newer, the override's rule. The generated
// wording (orthoProfile.ts standSummary) is only a draft the screen offers to
// start from, and a fallback labelled as auto-generated when nothing has been
// written (whereThingsStand.ts).
//
// Dependency-free: the routes, the loader and the screens all shape it the
// same way, and it is tested without a database.

export type CareStatusEventKind = "phase" | "status_override" | "override_cleared" | "summary";

export const CARE_STATUS_EVENT_KINDS: readonly CareStatusEventKind[] = ["phase", "status_override", "override_cleared", "summary"];

/** The longest written summary the table accepts (its shape CHECK says the
 *  same). A few plain sentences, not a report. */
export const CARE_STATUS_SUMMARY_MAX = 1200;

/** The longest phase name the table accepts (the CHECK says the same). */
export const CARE_STATUS_PHASE_MAX = 60;

/** An optional note on a phase change or a cleared override. */
export const CARE_STATUS_NOTE_MAX = STATUS_OVERRIDE_REASON_MAX;

export type CareStatusEvent = {
  id: string;
  patientId: string;
  kind: CareStatusEventKind;
  /** The phase name, the override's status, or the written summary's text;
   *  null for a clear. */
  value: string | null;
  reason: string | null;
  /** The profile kind the phase was chosen from. */
  profileKind: ProfileKind;
  setBy: string;
  setByRole: "therapist" | "admin";
  createdAt: string;
};

export const CARE_STATUS_EVENT_SELECT = "id, patient_id, kind, value, reason, profile_kind, set_by, set_by_role, created_at";

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export function parseCareStatusEventRow(raw: unknown): CareStatusEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  const patientId = str(r.patient_id);
  const kind = str(r.kind);
  const createdAt = str(r.created_at);
  const setBy = str(r.set_by);
  const role = str(r.set_by_role);
  const profileKind = r.profile_kind;
  if (!id || !patientId || !createdAt || !setBy) return null;
  if (kind !== "phase" && kind !== "status_override" && kind !== "override_cleared" && kind !== "summary") return null;
  if (role !== "therapist" && role !== "admin") return null;
  if (!isProfileKind(profileKind)) return null;
  return {
    id,
    patientId,
    kind,
    value: str(r.value),
    reason: str(r.reason),
    profileKind,
    setBy,
    setByRole: role,
    createdAt,
  };
}

// --- Shaping ---------------------------------------------------------------------------

export type CurrentPhase = {
  phase: string;
  eventId: string;
  setAt: string;
  setBy: string;
  setByRole: "therapist" | "admin";
  reason: string | null;
};

export type ActiveOverride = StatusOverride & {
  eventId: string;
  setAt: string;
  setBy: string;
  setByRole: "therapist" | "admin";
  /** A review (a measurement) is newer than the override: the screen asks
   *  the physiotherapist to look again. Still applied until they do. */
  stale: boolean;
};

/** "Where things stand" as the physiotherapist (or an admin on their
 *  behalf) last wrote it. */
export type WrittenSummary = {
  text: string;
  eventId: string;
  setAt: string;
  setBy: string;
  setByRole: "therapist" | "admin";
  /** The profile kind it was written under (kept for the history). */
  profileKind: ProfileKind;
  /** A review is newer than the summary: the screen asks for a fresh one.
   *  Still shown until then. */
  stale: boolean;
};

export type CareStatusState = {
  /** The phase the physiotherapist set, or null when none has been set for
   *  this profile kind (the screen may fall back to inferPhase()). */
  phase: CurrentPhase | null;
  /** The override in force, or null when there is none or it was cleared. */
  override: ActiveOverride | null;
  /** The latest written summary, or null when nobody has written one. */
  summary: WrittenSummary | null;
};

/** What a caller with no history (or an unreadable one) starts from. */
export const EMPTY_CARE_STATUS: CareStatusState = { phase: null, override: null, summary: null };

const ms = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : -Infinity;
};

/** Oldest first; a tie on the timestamp falls back to the id so the answer
 *  never depends on the order rows came back in. */
export function orderCareStatusEvents(events: readonly CareStatusEvent[]): CareStatusEvent[] {
  return [...events].sort((a, b) => ms(a.createdAt) - ms(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function isOverrideStatus(v: string | null): v is StatusOverride["status"] {
  return v === "improving" || v === "steady" || v === "needs_attention";
}

/**
 * What is in force now. The latest phase event that names one of this
 * profile kind's phases wins -- a phase chosen under another kind (the
 * record moved from neuro to the Parkinson's sub-profile) is not one of
 * this kind's and is passed over. The latest override-or-clear event decides
 * the override: an override if it is one, nothing if it is a clear.
 * `latestReviewAt`, when given, is the newest review's time (the newest
 * measurement's measured_at); an override set before it is `stale`.
 */
export function shapeCareStatus(
  events: readonly CareStatusEvent[],
  opts: { profileKind: ProfileKind; latestReviewAt?: string | null }
): CareStatusState {
  const ordered = orderCareStatusEvents(events);
  const phases = PHASES_BY_PROFILE_KIND[opts.profileKind];

  let phase: CurrentPhase | null = null;
  let override: ActiveOverride | null = null;
  let summary: WrittenSummary | null = null;
  for (const e of ordered) {
    if (e.kind === "summary") {
      if (e.value !== null && e.value.trim()) {
        summary = {
          text: e.value,
          eventId: e.id,
          setAt: e.createdAt,
          setBy: e.setBy,
          setByRole: e.setByRole,
          profileKind: e.profileKind,
          stale: false,
        };
      }
    } else if (e.kind === "phase") {
      if (e.profileKind === opts.profileKind && e.value !== null && phases.includes(e.value)) {
        phase = { phase: e.value, eventId: e.id, setAt: e.createdAt, setBy: e.setBy, setByRole: e.setByRole, reason: e.reason };
      }
    } else if (e.kind === "override_cleared") {
      override = null;
    } else if (isOverrideStatus(e.value) && e.reason) {
      override = {
        status: e.value,
        reason: e.reason,
        eventId: e.id,
        setAt: e.createdAt,
        setBy: e.setBy,
        setByRole: e.setByRole,
        stale: false,
      };
    }
  }
  if (override && opts.latestReviewAt) override = { ...override, stale: isOverrideStale(override.setAt, opts.latestReviewAt) };
  if (summary && opts.latestReviewAt) summary = { ...summary, stale: isOverrideStale(summary.setAt, opts.latestReviewAt) };
  return { phase, override, summary };
}

/** An override older than the latest review. */
export function isOverrideStale(overrideSetAt: string, latestReviewAt: string | null | undefined): boolean {
  if (!latestReviewAt) return false;
  return ms(latestReviewAt) > ms(overrideSetAt);
}

// --- What a route accepts ----------------------------------------------------------------

/**
 * The body of POST /api/therapist/care-status/set and
 * /api/admin/care-status/set, beside `patientId`:
 *
 *   { action: "set_phase", phase: string, reason?: string }
 *   { action: "override_status", status: "improving" | "steady" | "needs_attention", reason: string }
 *   { action: "clear_override", reason?: string }
 *   { action: "set_summary", text: string }
 *
 * `phase` must be one of the patient's profile kind's phases (re-derived on
 * the server, never sent). An override's reason is required, at least
 * STATUS_OVERRIDE_REASON_MIN characters (validateStatusOverride); the phase
 * and the clear take an optional note. A summary's text is required, up to
 * CARE_STATUS_SUMMARY_MAX characters, line breaks kept (normaliseSummary);
 * the patient reads it, so it is scanned (care_status_summary).
 */
export type CareStatusRequest =
  | { action: "set_phase"; phase: string; reason?: string | null }
  | { action: "override_status"; status: StatusOverride["status"]; reason: string }
  | { action: "clear_override"; reason?: string | null }
  | { action: "set_summary"; text: string };

export type CleanCareStatusChange =
  | { kind: "phase"; value: string; reason: string | null }
  | { kind: "status_override"; value: StatusOverride["status"]; reason: string }
  | { kind: "override_cleared"; value: null; reason: string | null }
  | { kind: "summary"; value: string; reason: null };

/** A written summary as it is stored: spaces and tabs collapsed inside each
 *  line, trailing space dropped, at most one blank line between paragraphs,
 *  trimmed. The line breaks stay -- WhereThingsStand keeps them. */
export function normaliseSummary(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function optionalNote(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: "The note must be text." };
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return { ok: true, value: null };
  if (text.length > CARE_STATUS_NOTE_MAX) return { ok: false, error: `Keep the note to ${CARE_STATUS_NOTE_MAX} characters or fewer.` };
  return { ok: true, value: text };
}

export function validateCareStatusChange(
  raw: unknown,
  profileKind: ProfileKind
): { ok: true; change: CleanCareStatusChange } | { ok: false; error: string; code?: "reason_required" } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "Nothing to save." };
  const body = raw as Record<string, unknown>;
  switch (body.action) {
    case "set_phase": {
      const phases = PHASES_BY_PROFILE_KIND[profileKind];
      if (typeof body.phase !== "string" || !phases.includes(body.phase)) {
        return { ok: false, error: `Choose one of this profile's phases: ${phases.join(", ")}.` };
      }
      const note = optionalNote(body.reason);
      if (!note.ok) return note;
      return { ok: true, change: { kind: "phase", value: body.phase, reason: note.value } };
    }
    case "override_status": {
      const checked = validateStatusOverride({ status: body.status, reason: body.reason });
      if (!checked.ok) {
        const reasonProblem = body.status === "improving" || body.status === "steady" || body.status === "needs_attention";
        return reasonProblem ? { ok: false, error: checked.error, code: "reason_required" } : { ok: false, error: checked.error };
      }
      return { ok: true, change: { kind: "status_override", value: checked.override.status, reason: checked.override.reason } };
    }
    case "clear_override": {
      const note = optionalNote(body.reason);
      if (!note.ok) return note;
      return { ok: true, change: { kind: "override_cleared", value: null, reason: note.value } };
    }
    case "set_summary": {
      if (typeof body.text !== "string") return { ok: false, error: "Write the summary as text." };
      const text = normaliseSummary(body.text);
      if (!text) return { ok: false, error: "Write a few plain sentences for the patient, or leave the summary as it is." };
      if (text.length > CARE_STATUS_SUMMARY_MAX) {
        return { ok: false, error: `Keep the summary to ${CARE_STATUS_SUMMARY_MAX} characters or fewer (${text.length} now).` };
      }
      return { ok: true, change: { kind: "summary", value: text, reason: null } };
    }
    default:
      return { ok: false, error: "Say what to change: set_phase, override_status, clear_override or set_summary." };
  }
}

/**
 * Whether a change would alter nothing in force, so the route answers
 * 200 unchanged without a row: the same phase again, or the same status
 * and reason again. A clear with no override in force is not "unchanged"
 * but a conflict (the screen was showing one that is gone) -- see
 * `clearHasNothingToEnd`.
 */
export function changeIsNoOp(change: CleanCareStatusChange, state: CareStatusState): boolean {
  if (change.kind === "phase") return state.phase?.phase === change.value;
  if (change.kind === "summary") return state.summary?.text === change.value;
  if (change.kind === "status_override") {
    return state.override?.status === change.value && state.override.reason === change.reason;
  }
  return false;
}

export function clearHasNothingToEnd(change: CleanCareStatusChange, state: CareStatusState): boolean {
  return change.kind === "override_cleared" && state.override === null;
}
