// Session notes: what a therapist did in one session, written straight
// after it and read before the next one (see the session_notes table in
// supabase/schema.sql for the data model and the clinician-only access
// rule).
//
// Field set lives here rather than in the form so the same definition
// drives the write form, the read-back on the prep tab, and the
// server-side validation on submit -- the same split the intake questions
// use. Dependency-free per AGENTS.md's business-math rule.

export const SESSION_NOTE_EDIT_WINDOW_HOURS = 24;

export type SessionNoteFieldType = "textarea" | "text" | "select";

export type SessionNoteField = {
  key: string;
  label: string;
  /** Two or three words for the prep summary and the review list. */
  shortLabel: string;
  type: SessionNoteFieldType;
  options?: string[];
  required?: boolean;
  placeholder?: string;
  /** Why this field earns a therapist's time, in one line. Shown under the
   *  label -- a note nobody understands the purpose of gets filled with
   *  "done" and stops being useful to the next session. */
  help?: string;
};

export const SESSION_NOTE_FIELDS: SessionNoteField[] = [
  {
    key: "treated",
    label: "What did you treat today?",
    shortLabel: "Treated",
    type: "textarea",
    required: true,
    placeholder: "e.g. L4-L5 segmental mobilisation, glute med activation",
    help: "The clinical content of the session. This is the first thing you (or a covering therapist) read before the next visit.",
  },
  {
    key: "techniques",
    label: "Techniques and dosage",
    shortLabel: "Techniques",
    type: "text",
    placeholder: "e.g. Grade III PA mobilisation ×3 sets, 30s hold",
    help: "What you actually applied, at what dosage — so progression next time is a decision, not a guess.",
  },
  {
    key: "response",
    label: "How did the patient respond?",
    shortLabel: "Response",
    type: "select",
    options: ["Improved", "No change", "Worse", "Mixed"],
    required: true,
    help: "The single most useful field for the next session: it tells you whether to progress, hold, or change approach.",
  },
  {
    key: "home_exercise",
    label: "Home exercise prescribed",
    shortLabel: "Home exercise",
    type: "textarea",
    placeholder: "e.g. Cat-camel ×10, twice daily. Walking 15 min.",
    help: "What you asked them to do between sessions. Next time you can ask about adherence specifically rather than in general.",
  },
  {
    key: "next_plan",
    label: "Plan for the next session",
    shortLabel: "Next session plan",
    type: "textarea",
    required: true,
    placeholder: "e.g. Progress to loaded hinge if pain stays under 3/10; reassess SLR",
    help: "Written for whoever runs the next session — possibly you in three weeks, possibly a colleague covering.",
  },
  {
    key: "red_flags",
    label: "Anything to watch",
    shortLabel: "Watch for",
    type: "text",
    placeholder: "e.g. Reports night pain — reassess if it persists",
    help: "Red flags, cautions, or anything that would change the plan if it shows up again. Leave blank if nothing.",
  },
];

export type SessionNoteData = Record<string, string>;

export type SessionNoteRow = {
  id: string;
  appointment_id: string;
  patient_id: string;
  therapist_id: string;
  data: SessionNoteData;
  free_text: string | null;
  created_at: string;
  updated_at: string | null;
};

export const SESSION_NOTE_FIELD_KEYS = new Set(SESSION_NOTE_FIELDS.map((f) => f.key));

/** Every required field answered. Shared by the form and the submit route
 *  so client and server can never disagree about what "complete" means. */
export function missingRequiredNoteFields(data: SessionNoteData): string[] {
  return SESSION_NOTE_FIELDS.filter((f) => f.required)
    .filter((f) => !(data[f.key] ?? "").trim())
    .map((f) => f.key);
}

/** Notes stay editable for a day after writing, then freeze -- long enough
 *  to fix what you meant to type between patients, short enough that a
 *  record can't be quietly rewritten weeks later. */
export function isNoteEditable(note: { created_at: string }, nowMs: number): boolean {
  const written = new Date(note.created_at).getTime();
  if (!Number.isFinite(written)) return false;
  return nowMs - written < SESSION_NOTE_EDIT_WINDOW_HOURS * 3600_000;
}

export function noteEditHoursLeft(note: { created_at: string }, nowMs: number): number {
  const written = new Date(note.created_at).getTime();
  const msLeft = SESSION_NOTE_EDIT_WINDOW_HOURS * 3600_000 - (nowMs - written);
  return Math.max(0, Math.ceil(msLeft / 3600_000));
}

export type SessionForNote = {
  id: string;
  slot_time: string | null;
  status: string;
  patient_id: string;
};

/** Sessions that happened and have no note yet -- the therapist's own
 *  to-do list, and the count behind the prep tab's badge. A session is
 *  only "owed" once it is actually delivered: a cancelled or no-showed
 *  session has nothing to write about. */
export function sessionsAwaitingNote(
  sessions: SessionForNote[],
  noteByAppointmentId: Map<string, unknown>,
  nowMs: number
): SessionForNote[] {
  return sessions.filter(
    (s) =>
      (s.status === "completed" ||
        (s.status === "confirmed" && !!s.slot_time && new Date(s.slot_time).getTime() < nowMs)) &&
      !noteByAppointmentId.has(s.id)
  );
}

export type PatientPrepSummary = {
  patientId: string;
  lastNote: SessionNoteRow | null;
  /** The plan the last note left for this session, which is the single
   *  line a therapist wants on the way in. */
  plan: string | null;
  response: string | null;
  homeExercise: string | null;
  redFlags: string | null;
  notesCount: number;
};

/** Rolls a patient's notes into what the prep tab shows at a glance. */
export function prepSummary(patientId: string, notes: SessionNoteRow[]): PatientPrepSummary {
  const mine = notes
    .filter((n) => n.patient_id === patientId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const last = mine[0] ?? null;
  const value = (key: string) => {
    const raw = (last?.data?.[key] ?? "").trim();
    return raw ? raw : null;
  };
  return {
    patientId,
    lastNote: last,
    plan: value("next_plan"),
    response: value("response"),
    homeExercise: value("home_exercise"),
    redFlags: value("red_flags"),
    notesCount: mine.length,
  };
}
