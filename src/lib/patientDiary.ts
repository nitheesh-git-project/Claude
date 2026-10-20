import { clinicDateKey } from "@/lib/clinicWeek";
import type { ProfileKind } from "@/lib/outcomeMeasures";

// The patient diary (Health Profile redesign, phase 4a): what a patient --
// or the family member holding their phone -- writes down between sessions.
// Freezing episodes, falls and near-misses for the Parkinson's sub-profile
// today; active minutes for heart and lung rehabilitation once that becomes
// a condition type. ONE generic, append-only table (patient_diary_entries,
// supabase/schema.sql) with a `kind` and a `details` object in the shape
// this module validates, the outcome_measurements pattern: every reader
// (weekly counts, falls since a date, the freezing graph) asks the same
// question of every kind.
//
// Four rules:
//  1. It is the patient's own account, and says so. Everything shaped from
//     it carries its provenance ("patient reported"), and a physiotherapist
//     may CONFIRM an entry once -- the one stamp the trigger permits -- but
//     never edit it. A wrong entry stays, with the truer one beside it.
//  2. `details` holds structured answers only, checked here key by key; an
//     unknown key or a value the screen cannot offer is a 400, never stored.
//     The free text lives in its own `note` column so the contact scanner
//     has one surface to read (patient_diary_note).
//  3. Which kinds a patient is offered follows their profile kind, decided
//     on the server (profileKindFor), never by the client.
//  4. Weeks are the clinic's weeks (Monday start, clinic zone), the same
//     rule clinicWeek.ts applies to bookings: a fall at 01:00 IST on a
//     Monday belongs to that Monday's week, not to the UTC Sunday's.
//
// Dependency-free so the route, the loader and the screens agree, and it is
// tested without a database.

export type DiaryKind = "freezing" | "fall" | "near_miss" | "active_minutes";
export const DIARY_KINDS: readonly DiaryKind[] = ["freezing", "fall", "near_miss", "active_minutes"];

export function isDiaryKind(value: unknown): value is DiaryKind {
  return typeof value === "string" && (DIARY_KINDS as readonly string[]).includes(value);
}

export type DiaryEnteredByRole = "patient" | "therapist" | "admin";

/** The kinds each profile kind's diary offers. Falls and near-misses matter
 *  wherever falls are the risk; freezing is a Parkinson's symptom; active
 *  minutes are the heart and lung programme's dose (defined now, reachable
 *  when that condition type is). Ortho and paediatric records have no
 *  diary yet. */
export const DIARY_KINDS_BY_PROFILE_KIND: Record<ProfileKind, readonly DiaryKind[]> = {
  ortho: [],
  neuro: ["fall", "near_miss"],
  neuro_parkinsons: ["freezing", "fall", "near_miss"],
  pediatrics: [],
  geriatric: ["fall", "near_miss"],
  cardiopulmonary: ["active_minutes"],
};

export function diaryKindsFor(profileKind: ProfileKind): readonly DiaryKind[] {
  return DIARY_KINDS_BY_PROFILE_KIND[profileKind] ?? [];
}

/** How far back an entry may be dated. A fall last month is worth writing
 *  down; one "last year" belongs in a conversation, not a diary point. */
export const DIARY_BACKDATE_MAX_DAYS = 92;
/** A phone clock running a little fast is tolerated (the table's CHECK says
 *  the same); an entry dated tomorrow is not. */
export const DIARY_FUTURE_TOLERANCE_MS = 5 * 60_000;
export const DIARY_NOTE_MAX = 500;
/** One entry may tally a day's or a week's freezing episodes. */
export const DIARY_FREEZING_COUNT_MAX = 200;
export const DIARY_ACTIVE_MINUTES_MAX = 1440;

// --- The details, kind by kind ------------------------------------------------------------

export type DiaryMedicationState = "on" | "off" | "not_sure";
export type DiaryPlace = "indoors_home" | "outdoors_home" | "out_and_about" | "other";
export type FreezingPeriod = "episode" | "day" | "week";
export type FreezingTrigger = "starting" | "turning" | "doorway" | "crowded_or_narrow" | "other";
export type ActivityIntensity = "light" | "moderate" | "vigorous";

export type FreezingDetails = {
  /** What one entry covers: a single episode (count 1), or a tally of a day
   *  or a week -- a family member often fills it in once, at the end. */
  period: FreezingPeriod;
  count: number;
  trigger?: FreezingTrigger;
  medicationState?: DiaryMedicationState;
};
export type FallDetails = {
  injured: boolean;
  /** Could they get up without help: the question STEADI asks after a fall. */
  gotUpAlone?: boolean;
  place?: DiaryPlace;
  medicationState?: DiaryMedicationState;
};
export type NearMissDetails = {
  place?: DiaryPlace;
  medicationState?: DiaryMedicationState;
};
export type ActiveMinutesDetails = {
  minutes: number;
  intensity?: ActivityIntensity;
};

export type DiaryDetails = FreezingDetails | FallDetails | NearMissDetails | ActiveMinutesDetails;

export const DIARY_MEDICATION_STATES: readonly DiaryMedicationState[] = ["on", "off", "not_sure"];
export const DIARY_PLACES: readonly DiaryPlace[] = ["indoors_home", "outdoors_home", "out_and_about", "other"];
export const FREEZING_PERIODS: readonly FreezingPeriod[] = ["episode", "day", "week"];
export const FREEZING_TRIGGERS: readonly FreezingTrigger[] = ["starting", "turning", "doorway", "crowded_or_narrow", "other"];
export const ACTIVITY_INTENSITIES: readonly ActivityIntensity[] = ["light", "moderate", "vigorous"];

/** The words a screen shows for each kind, by reader. */
export const DIARY_KIND_LABEL: Record<DiaryKind, { patient: string; clinician: string }> = {
  freezing: { patient: "Feet getting stuck", clinician: "Freezing of gait" },
  fall: { patient: "A fall", clinician: "Fall" },
  near_miss: { patient: "Nearly fell", clinician: "Near-miss" },
  active_minutes: { patient: "Active minutes", clinician: "Active minutes" },
};

type DetailsCheck = { ok: true; details: DiaryDetails } | { ok: false; error: string };

function pickOne<T extends string>(value: unknown, allowed: readonly T[]): T | undefined | null {
  if (value === undefined || value === null) return undefined;
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function wholeNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

const ALLOWED_KEYS: Record<DiaryKind, readonly string[]> = {
  freezing: ["period", "count", "trigger", "medicationState"],
  fall: ["injured", "gotUpAlone", "place", "medicationState"],
  near_miss: ["place", "medicationState"],
  active_minutes: ["minutes", "intensity"],
};

/**
 * One kind's details, refused rather than repaired: an unknown key, a count
 * that is not a whole number in range, or a choice the screen cannot offer
 * is a 400 with a sentence, never rounded into shape. Optional choices that
 * are absent stay absent ("not said" is not "no").
 */
export function validateDiaryDetails(kind: DiaryKind, raw: unknown): DetailsCheck {
  const input = raw === undefined || raw === null ? {} : raw;
  if (typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "The details must be a set of answers." };
  const body = input as Record<string, unknown>;
  const unknown = Object.keys(body).filter((k) => !ALLOWED_KEYS[kind].includes(k));
  if (unknown.length > 0) return { ok: false, error: `Unexpected detail: ${unknown.join(", ")}.` };

  const medicationState = pickOne(body.medicationState, DIARY_MEDICATION_STATES);
  if (medicationState === null) return { ok: false, error: "Medicine timing must be ON, OFF or not sure." };
  const place = pickOne(body.place, DIARY_PLACES);
  if (place === null) return { ok: false, error: "Choose where it happened from the list." };

  switch (kind) {
    case "freezing": {
      const period = pickOne(body.period, FREEZING_PERIODS);
      if (!period) return { ok: false, error: "Say whether this is one episode, a day or a week." };
      const count = wholeNumber(body.count, 1, DIARY_FREEZING_COUNT_MAX);
      if (count === null) return { ok: false, error: `The number of episodes must be a whole number from 1 to ${DIARY_FREEZING_COUNT_MAX}.` };
      if (period === "episode" && count !== 1) return { ok: false, error: "One episode is a count of 1. Choose a day or a week to add up several." };
      const trigger = pickOne(body.trigger, FREEZING_TRIGGERS);
      if (trigger === null) return { ok: false, error: "Choose what was happening from the list." };
      const details: FreezingDetails = { period, count };
      if (trigger) details.trigger = trigger;
      if (medicationState) details.medicationState = medicationState;
      return { ok: true, details };
    }
    case "fall": {
      if (typeof body.injured !== "boolean") return { ok: false, error: "Say whether they were hurt." };
      if (body.gotUpAlone !== undefined && body.gotUpAlone !== null && typeof body.gotUpAlone !== "boolean") {
        return { ok: false, error: "Say whether they got up without help." };
      }
      const details: FallDetails = { injured: body.injured };
      if (typeof body.gotUpAlone === "boolean") details.gotUpAlone = body.gotUpAlone;
      if (place) details.place = place;
      if (medicationState) details.medicationState = medicationState;
      return { ok: true, details };
    }
    case "near_miss": {
      const details: NearMissDetails = {};
      if (place) details.place = place;
      if (medicationState) details.medicationState = medicationState;
      return { ok: true, details };
    }
    case "active_minutes": {
      const minutes = wholeNumber(body.minutes, 1, DIARY_ACTIVE_MINUTES_MAX);
      if (minutes === null) return { ok: false, error: `Active minutes must be a whole number from 1 to ${DIARY_ACTIVE_MINUTES_MAX}.` };
      const intensity = pickOne(body.intensity, ACTIVITY_INTENSITIES);
      if (intensity === null) return { ok: false, error: "Choose how hard it felt from the list." };
      const details: ActiveMinutesDetails = { minutes };
      if (intensity) details.intensity = intensity;
      return { ok: true, details };
    }
  }
}

// --- What the patient's route accepts ----------------------------------------------------

/**
 * The body of POST /api/patient/diary/add:
 *
 *   { kind: "freezing" | "fall" | "near_miss" | "active_minutes",
 *     occurredAt: string,      // ISO 8601; not in the future, not older than
 *                              // DIARY_BACKDATE_MAX_DAYS
 *     details?: object,        // validateDiaryDetails, per kind
 *     note?: string }          // up to DIARY_NOTE_MAX characters, scanned
 *
 * The patient, the author and the role are the session's, never the body's.
 */
export type DiaryAddRequest = {
  kind: DiaryKind;
  occurredAt: string;
  details?: Record<string, unknown>;
  note?: string | null;
};

export type CleanDiaryEntry = {
  kind: DiaryKind;
  occurredAt: string;
  details: DiaryDetails;
  note: string | null;
};

export type DiaryEntryCheck =
  | { ok: true; entry: CleanDiaryEntry }
  | { ok: false; error: string; code?: "diary_kind_not_offered" };

export function validateDiaryEntry(raw: unknown, ctx: { profileKind: ProfileKind; nowMs: number }): DiaryEntryCheck {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "Nothing to save." };
  const body = raw as Record<string, unknown>;
  if (!isDiaryKind(body.kind)) return { ok: false, error: "Say what you are writing down." };
  const kind = body.kind;
  if (!diaryKindsFor(ctx.profileKind).includes(kind)) {
    return {
      ok: false,
      error: "This kind of diary entry is not part of your care plan. Your physiotherapist can tell you what to note down.",
      code: "diary_kind_not_offered",
    };
  }

  const at = typeof body.occurredAt === "string" ? Date.parse(body.occurredAt) : NaN;
  if (!Number.isFinite(at)) return { ok: false, error: "Say when it happened." };
  if (at > ctx.nowMs + DIARY_FUTURE_TOLERANCE_MS) return { ok: false, error: "That time is in the future." };
  if (at < ctx.nowMs - DIARY_BACKDATE_MAX_DAYS * 86_400_000) {
    return { ok: false, error: `Diary entries go back ${DIARY_BACKDATE_MAX_DAYS} days at most. Tell your physiotherapist about anything older.` };
  }

  const details = validateDiaryDetails(kind, body.details);
  if (!details.ok) return details;

  let note: string | null = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== "string") return { ok: false, error: "The note must be text." };
    const text = body.note.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (text.length > DIARY_NOTE_MAX) return { ok: false, error: `Keep the note to ${DIARY_NOTE_MAX} characters or fewer.` };
    note = text || null;
  }

  return { ok: true, entry: { kind, occurredAt: new Date(at).toISOString(), details: details.details, note } };
}

// --- Rows --------------------------------------------------------------------------------

export const PATIENT_DIARY_SELECT =
  "id, patient_id, kind, occurred_at, details, note, entered_by, entered_by_role, confirmed_by, confirmed_by_role, confirmed_at, created_at";

export type DiaryEntry = {
  id: string;
  patientId: string;
  kind: DiaryKind;
  occurredAt: string;
  details: DiaryDetails;
  note: string | null;
  enteredBy: string;
  enteredByRole: DiaryEnteredByRole;
  confirmedBy: string | null;
  confirmedByRole: "therapist" | "admin" | null;
  confirmedAt: string | null;
  createdAt: string;
};

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** A stored row, or null when it does not parse. A row whose details no
 *  longer validate (a later schema) is still read -- with the details it
 *  carries -- because dropping a patient's fall from their record because a
 *  field was renamed would be the worse failure. */
export function parseDiaryEntryRow(raw: unknown): DiaryEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  const patientId = str(r.patient_id);
  const occurredAt = str(r.occurred_at);
  const createdAt = str(r.created_at);
  const enteredBy = str(r.entered_by);
  const role = r.entered_by_role;
  if (!id || !patientId || !occurredAt || !createdAt || !enteredBy || !isDiaryKind(r.kind)) return null;
  if (role !== "patient" && role !== "therapist" && role !== "admin") return null;
  const checked = validateDiaryDetails(r.kind, r.details);
  const details = checked.ok
    ? checked.details
    : ((typeof r.details === "object" && r.details !== null && !Array.isArray(r.details) ? r.details : {}) as DiaryDetails);
  const confirmedRole = r.confirmed_by_role === "therapist" || r.confirmed_by_role === "admin" ? r.confirmed_by_role : null;
  return {
    id,
    patientId,
    kind: r.kind,
    occurredAt,
    details,
    note: str(r.note),
    enteredBy,
    enteredByRole: role,
    confirmedBy: str(r.confirmed_by),
    confirmedByRole: confirmedRole,
    confirmedAt: str(r.confirmed_at),
    createdAt,
  };
}

/** Whether a stored entry says exactly what a clean one does -- the double
 *  tap the table's unique index refuses. Key order does not matter (jsonb
 *  returns keys in its own order). */
export function sameDiaryContent(
  stored: Pick<DiaryEntry, "kind" | "occurredAt" | "details" | "note">,
  clean: CleanDiaryEntry
): boolean {
  const canonical = (v: unknown) =>
    JSON.stringify(
      Object.fromEntries(Object.entries((v ?? {}) as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    );
  return (
    stored.kind === clean.kind &&
    Date.parse(stored.occurredAt) === Date.parse(clean.occurredAt) &&
    (stored.note ?? null) === clean.note &&
    canonical(stored.details) === canonical(clean.details)
  );
}

// --- Provenance --------------------------------------------------------------------------

export type DiaryProvenance = "patient_reported" | "patient_reported_confirmed" | "clinician_recorded";

/** Who this entry is the account of. A patient's entry is "patient
 *  reported" until a physiotherapist confirms it, and stays patient
 *  reported after (confirmed is a stamp on their account, not a rewrite
 *  into the clinician's). */
export function diaryProvenance(entry: Pick<DiaryEntry, "enteredByRole" | "confirmedAt">): DiaryProvenance {
  if (entry.enteredByRole !== "patient") return "clinician_recorded";
  return entry.confirmedAt ? "patient_reported_confirmed" : "patient_reported";
}

export function diaryProvenanceLabel(provenance: DiaryProvenance, voice: "patient" | "clinician"): string {
  if (provenance === "clinician_recorded") return voice === "patient" ? "Noted by your physiotherapist" : "Recorded by a clinician";
  if (provenance === "patient_reported_confirmed") {
    return voice === "patient" ? "You noted this - your physiotherapist has seen it" : "Patient reported - confirmed";
  }
  return voice === "patient" ? "You noted this" : "Patient reported";
}

/** The confirmation stamp a therapist may put on an entry: a patient's own,
 *  not yet confirmed. */
export function confirmationRefusal(entry: Pick<DiaryEntry, "enteredByRole" | "confirmedAt">):
  | null
  | { code: "already_confirmed" | "not_patient_reported" } {
  if (entry.enteredByRole !== "patient") return { code: "not_patient_reported" };
  if (entry.confirmedAt) return { code: "already_confirmed" };
  return null;
}

// --- Shaping -----------------------------------------------------------------------------

/** What one entry adds to its kind's weekly total: a freezing tally adds
 *  its episodes, a fall or a near-miss adds one, active minutes add their
 *  minutes. */
export function diaryEntryAmount(entry: Pick<DiaryEntry, "kind" | "details">): number {
  const d = entry.details as Record<string, unknown>;
  if (entry.kind === "freezing") return typeof d.count === "number" && d.count > 0 ? d.count : 1;
  if (entry.kind === "active_minutes") return typeof d.minutes === "number" && d.minutes > 0 ? d.minutes : 0;
  return 1;
}

/** `YYYY-MM-DD` of the Monday that starts the clinic week `value` falls in. */
export function clinicWeekStart(value: string | number | Date): string {
  const [y, m, d] = clinicDateKey(value).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const back = (date.getUTCDay() + 6) % 7; // Monday = 0
  date.setUTCDate(date.getUTCDate() - back);
  return date.toISOString().slice(0, 10);
}

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export type DiaryWeek = {
  /** The Monday the clinic week starts on, `YYYY-MM-DD`. */
  weekStart: string;
  /** Per kind: episodes, falls, near-misses, or active minutes. */
  totals: Record<DiaryKind, number>;
  /** Per kind: how many entries made up the total. */
  entries: Record<DiaryKind, number>;
  /** Entries in the week still waiting for a physiotherapist's confirmation. */
  unconfirmed: number;
};

const zeroes = (): Record<DiaryKind, number> => ({ freezing: 0, fall: 0, near_miss: 0, active_minutes: 0 });

/**
 * Weekly totals per kind, one row per clinic week from the first entry's
 * week (or `fromWeekStart`, when given) to the week of `nowMs`, oldest
 * first, with the empty weeks in between present as zeroes. A week nobody
 * wrote in is drawn as zero, which is what a diary means by it: the graph
 * is told so by the caller ("nothing written down" is the honest label for
 * a zero, not "no freezing").
 */
export function weeklyDiaryTotals(
  entries: readonly Pick<DiaryEntry, "kind" | "details" | "occurredAt" | "enteredByRole" | "confirmedAt">[],
  opts: { nowMs: number; fromWeekStart?: string; kinds?: readonly DiaryKind[] }
): DiaryWeek[] {
  const kinds = opts.kinds ?? DIARY_KINDS;
  const relevant = entries.filter((e) => kinds.includes(e.kind) && Number.isFinite(Date.parse(e.occurredAt)));
  const lastWeek = clinicWeekStart(opts.nowMs);
  const firstWeek =
    opts.fromWeekStart ??
    (relevant.length > 0 ? relevant.map((e) => clinicWeekStart(e.occurredAt)).sort()[0] : lastWeek);
  if (firstWeek > lastWeek) return [];

  const byWeek = new Map<string, DiaryWeek>();
  for (let week = firstWeek; week <= lastWeek; week = addDays(week, 7)) {
    byWeek.set(week, { weekStart: week, totals: zeroes(), entries: zeroes(), unconfirmed: 0 });
  }
  for (const e of relevant) {
    const row = byWeek.get(clinicWeekStart(e.occurredAt));
    if (!row) continue;
    row.totals[e.kind] += diaryEntryAmount(e);
    row.entries[e.kind] += 1;
    if (diaryProvenance(e) === "patient_reported") row.unconfirmed += 1;
  }
  return [...byWeek.values()];
}

export type FreezingWeekPoint = {
  weekStart: string;
  episodes: number;
  /** False for a week with no freezing entry at all, so a graph can say
   *  "nothing written down" rather than imply none happened. */
  written: boolean;
  /** Every freezing entry that week is the patient's own account. */
  patientReported: boolean;
};

/** The freezing graph: episodes per clinic week for the last `weeks` weeks
 *  (default 12) up to `nowMs`'s week. */
export function freezingWeeklySeries(
  entries: readonly Pick<DiaryEntry, "kind" | "details" | "occurredAt" | "enteredByRole" | "confirmedAt">[],
  opts: { nowMs: number; weeks?: number }
): FreezingWeekPoint[] {
  const weeks = Math.max(1, Math.floor(opts.weeks ?? 12));
  const fromWeekStart = addDays(clinicWeekStart(opts.nowMs), -7 * (weeks - 1));
  const freezing = entries.filter((e) => e.kind === "freezing");
  const rows = weeklyDiaryTotals(freezing, { nowMs: opts.nowMs, fromWeekStart, kinds: ["freezing"] });
  return rows.map((row) => {
    const inWeek = freezing.filter((e) => clinicWeekStart(e.occurredAt) === row.weekStart);
    return {
      weekStart: row.weekStart,
      episodes: row.totals.freezing,
      written: inWeek.length > 0,
      patientReported: inWeek.length > 0 && inWeek.every((e) => e.enteredByRole === "patient"),
    };
  });
}

export type FallsSince = {
  falls: number;
  injured: number;
  nearMisses: number;
  /** When the newest fall happened, or null. */
  latestFallAt: string | null;
  /** Falls still waiting for a physiotherapist's confirmation. */
  unconfirmedFalls: number;
};

/** Falls and near-misses on or after `sinceIso` (an instant -- the caller
 *  passes the last review, or "12 months ago" for the STEADI question). */
export function fallsSince(
  entries: readonly Pick<DiaryEntry, "kind" | "details" | "occurredAt" | "enteredByRole" | "confirmedAt">[],
  sinceIso: string
): FallsSince {
  const since = Date.parse(sinceIso);
  const after = entries.filter((e) => {
    const t = Date.parse(e.occurredAt);
    return Number.isFinite(t) && (!Number.isFinite(since) || t >= since);
  });
  const falls = after.filter((e) => e.kind === "fall");
  const latest = falls.map((e) => e.occurredAt).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  return {
    falls: falls.length,
    injured: falls.filter((e) => (e.details as FallDetails).injured === true).length,
    nearMisses: after.filter((e) => e.kind === "near_miss").length,
    latestFallAt: latest,
    unconfirmedFalls: falls.filter((e) => diaryProvenance(e) === "patient_reported").length,
  };
}

/** The entries a physiotherapist has not confirmed yet, oldest first: what
 *  their chart asks them to look at. */
export function entriesAwaitingConfirmation<T extends Pick<DiaryEntry, "enteredByRole" | "confirmedAt" | "occurredAt" | "id">>(
  entries: readonly T[]
): T[] {
  return entries
    .filter((e) => diaryProvenance(e) === "patient_reported")
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || (a.id < b.id ? -1 : 1));
}
