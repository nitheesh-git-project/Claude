// The patient's summary of a session: a few plain-language lines the
// therapist writes for the patient, beside (never inside) the private
// session note. See the session_summaries table in supabase/schema.sql and
// "Session notes are clinician-only" in docs/rules/clinical.md.
//
// Two separate records on purpose. `session_notes` is written in the
// register clinicians use with each other and has no patient select policy
// at all; the summary is the one thing from a session a patient is meant to
// read. Folding the summary into the note's jsonb would have meant giving
// the patient a policy on the note table, which is the rule that must never
// break, so it is its own table with its own policy.
//
// Dependency-free, so what a patient may see is decided here and tested
// without rendering: the patient's card and the admin drawer both read their
// state out of this module rather than deciding it inline.

import { SESSION_NOTE_EDIT_WINDOW_HOURS } from "@/lib/sessionNotes";

/** Per field. A summary is a few sentences, not a second note. Matches the
 *  CHECK on session_summaries in schema.sql. */
export const SESSION_SUMMARY_MAX_CHARS = 600;

/** Same window as the note it is written beside: long enough to fix a typo
 *  between patients, short enough that what a patient read last week is not
 *  quietly rewritten. Every edit inside it keeps what it replaced. */
export const SESSION_SUMMARY_EDIT_WINDOW_HOURS = SESSION_NOTE_EDIT_WINDOW_HOURS;

export type SessionSummaryFieldKey = "what_we_did" | "before_next_time";

export type SessionSummaryField = {
  key: SessionSummaryFieldKey;
  /** The body key the submit route takes. */
  bodyKey: "whatWeDid" | "beforeNextTime";
  /** What the therapist is asked, in the dialog. */
  label: string;
  /** The heading the patient reads it under. */
  patientLabel: string;
  placeholder: string;
};

export const SESSION_SUMMARY_FIELDS: SessionSummaryField[] = [
  {
    key: "what_we_did",
    bodyKey: "whatWeDid",
    label: "What we did today",
    patientLabel: "What we did",
    placeholder: "e.g. We worked on bending your knee further and on getting up from a chair without pushing off.",
  },
  {
    key: "before_next_time",
    bodyKey: "beforeNextTime",
    label: "What to do before next time",
    patientLabel: "Before your next session",
    placeholder: "e.g. The heel slides we practised, 10 at a time, morning and evening. Ice for 10 minutes if it aches.",
  },
];

export type SessionSummaryText = {
  whatWeDid: string | null;
  beforeNextTime: string | null;
};

export type SessionSummaryRow = {
  id: string;
  appointment_id: string;
  patient_id: string;
  therapist_id: string;
  what_we_did: string | null;
  before_next_time: string | null;
  created_at: string;
  updated_at: string | null;
};

/** The columns every reader selects. Named once so no reader can widen it
 *  by accident -- and it is the only table read, so nothing of the private
 *  note can ride along. */
export const SESSION_SUMMARY_SELECT =
  "id, appointment_id, patient_id, therapist_id, what_we_did, before_next_time, created_at, updated_at";

/** What the note dialog needs about a session's summary, decided on the
 *  server so it cannot disagree with the submit route. */
export type SummaryForDialog = {
  row: SessionSummaryRow | null;
  /** The read failed: the dialog says so and leaves the summary alone,
   *  rather than offering a blank box over one that may exist. */
  loadFailed: boolean;
  editable: boolean;
};

export function summaryForDialog(
  row: SessionSummaryRow | null | undefined,
  loadFailed: boolean,
  nowMs: number
): SummaryForDialog {
  if (loadFailed) return { row: null, loadFailed: true, editable: false };
  return { row: row ?? null, loadFailed: false, editable: !row || isSummaryEditable(row, nowMs) };
}

export type SummaryValidation =
  | { ok: true; value: SessionSummaryText; empty: boolean }
  | { ok: false; error: string };

/**
 * Checks what the dialog sent. Both fields are optional and each is plain
 * text up to `SESSION_SUMMARY_MAX_CHARS`; anything else is refused rather
 * than coerced, because this is text the patient will read word for word.
 */
export function validateSessionSummary(input: {
  whatWeDid?: unknown;
  beforeNextTime?: unknown;
}): SummaryValidation {
  const out: SessionSummaryText = { whatWeDid: null, beforeNextTime: null };
  for (const field of SESSION_SUMMARY_FIELDS) {
    const raw = input[field.bodyKey];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== "string") {
      return { ok: false, error: "The summary must be text." };
    }
    const trimmed = raw.trim();
    if (trimmed.length > SESSION_SUMMARY_MAX_CHARS) {
      return {
        ok: false,
        error: `Keep "${field.label}" to ${SESSION_SUMMARY_MAX_CHARS} characters - it is a short summary for the patient, not a second note.`,
      };
    }
    out[field.bodyKey] = trimmed || null;
  }
  return { ok: true, value: out, empty: !out.whatWeDid && !out.beforeNextTime };
}

export function summaryTextOf(row: Pick<SessionSummaryRow, "what_we_did" | "before_next_time">): SessionSummaryText {
  return {
    whatWeDid: row.what_we_did?.trim() || null,
    beforeNextTime: row.before_next_time?.trim() || null,
  };
}

export function sameSummaryText(a: SessionSummaryText, b: SessionSummaryText): boolean {
  return (a.whatWeDid ?? "") === (b.whatWeDid ?? "") && (a.beforeNextTime ?? "") === (b.beforeNextTime ?? "");
}

export function isSummaryEditable(summary: { created_at: string }, nowMs: number): boolean {
  const written = new Date(summary.created_at).getTime();
  if (!Number.isFinite(written)) return false;
  return nowMs - written < SESSION_SUMMARY_EDIT_WINDOW_HOURS * 3600_000;
}

/** Care plan statuses a patient is shown (loadCarePlanHistory's own rule):
 *  a thread waiting on the clinic, or turned down by it, is not theirs to
 *  read. */
const PLAN_STATUSES_HIDDEN_FROM_PATIENT = new Set(["pending_review", "rejected"]);

/**
 * Where the patient reads the programme recommended after this session, if
 * there is one they are allowed to see -- so the summary links to the plan
 * (its exercises and instructions) rather than repeating it.
 */
export function summaryPlanHref(
  appointmentId: string,
  plans: { sourceAppointmentId: string | null; planStatus: string }[]
): string | null {
  const visible = plans.some(
    (p) => p.sourceAppointmentId === appointmentId && !PLAN_STATUSES_HIDDEN_FROM_PATIENT.has(p.planStatus)
  );
  return visible ? "/patient/dashboard/suggested" : null;
}

export type PatientSummaryState =
  /** Not a session that was delivered: nothing to summarise, nothing shown. */
  | { kind: "hidden" }
  /** The read failed. Never shown as "no summary" -- that would be a claim
   *  about the session the page could not check. */
  | { kind: "unavailable" }
  | { kind: "none"; planHref: string | null }
  | {
      kind: "summary";
      whatWeDid: string | null;
      beforeNextTime: string | null;
      writtenBy: string;
      writtenAt: string;
      updatedAt: string | null;
      planHref: string | null;
    };

/**
 * What a patient's session card shows about the session afterwards.
 *
 * The summary has to belong to this session *and* to this patient -- RLS
 * already guarantees the second, and this checks both again so a row handed
 * to the wrong card can never be rendered. Only the summary's own fields are
 * copied out, never the row: the state carries nothing a caller did not
 * explicitly ask this module to show.
 */
export function patientSummaryState(args: {
  session: { id: string; status: string; no_show?: boolean | null; patient_id?: string | null };
  viewerId: string;
  summary: SessionSummaryRow | null | undefined;
  loadFailed: boolean;
  therapistName: string | null;
  planHref?: string | null;
}): PatientSummaryState {
  const { session, viewerId, summary, loadFailed, therapistName } = args;
  const planHref = args.planHref ?? null;
  if (session.status !== "completed" || session.no_show) return { kind: "hidden" };
  if (session.patient_id && session.patient_id !== viewerId) return { kind: "hidden" };
  if (loadFailed) return { kind: "unavailable" };
  if (!summary || summary.appointment_id !== session.id || summary.patient_id !== viewerId) {
    return { kind: "none", planHref };
  }
  const text = summaryTextOf(summary);
  if (!text.whatWeDid && !text.beforeNextTime) return { kind: "none", planHref };
  return {
    kind: "summary",
    whatWeDid: text.whatWeDid,
    beforeNextTime: text.beforeNextTime,
    writtenBy: therapistName?.trim() || "Your therapist",
    writtenAt: summary.created_at,
    updatedAt: summary.updated_at,
    planHref,
  };
}
