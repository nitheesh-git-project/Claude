// What patients, therapists, hospitals and the system did, as the Logs
// section reads it.
//
// The admin log (adminActivityLog.ts) records admins. This is the other half
// of "All Logs": the actions everybody else takes, kept in
// `user_activity_log`. Nothing here touches a database or a browser, so the
// sentence-building and the filtering can be tested without either.
//
// Three jobs live here:
//   1. the vocabulary -- every action a non-admin can leave in the log, with
//      the label the table shows and the group the Type filter uses;
//   2. the sentence stored with each entry, built once at write time so the
//      entry still reads after somebody is renamed or removed;
//   3. the filters the feed adds (Actor role + person, Programme ID, Patient,
//      Therapist, Condition), their URL keys, and the merge of the two logs
//      into one newest-first feed.

// --------------------------------------------------------------------------
// Who
// --------------------------------------------------------------------------

/** Everyone who can appear as the actor of a log entry. */
export const LOG_ACTOR_ROLES = ["admin", "patient", "therapist", "hospital", "system"] as const;
export type LogActorRole = (typeof LOG_ACTOR_ROLES)[number];

/** The roles `user_activity_log.actor_role` accepts (admins have their own table). */
export type UserActorRole = Exclude<LogActorRole, "admin">;

export const LOG_ROLE_LABEL: Record<LogActorRole, string> = {
  admin: "Admin",
  patient: "Patient",
  therapist: "Therapist",
  hospital: "Hospital",
  system: "System",
};

/** Chip colours. Every role has its own so a row's author reads at a glance. */
export const LOG_ROLE_TONE: Record<LogActorRole, string> = {
  admin: "bg-slate-800 text-white",
  patient: "bg-sky-100 text-sky-800",
  therapist: "bg-emerald-100 text-emerald-800",
  hospital: "bg-violet-100 text-violet-800",
  system: "bg-amber-100 text-amber-800",
};

export function isLogActorRole(value: unknown): value is LogActorRole {
  return typeof value === "string" && (LOG_ACTOR_ROLES as readonly string[]).includes(value);
}

// --------------------------------------------------------------------------
// What
// --------------------------------------------------------------------------

export type UserActivityGroup =
  | "booking"
  | "payment"
  | "programme"
  | "clinical"
  | "feedback"
  | "referral"
  | "account";

export const USER_GROUP_LABEL: Record<UserActivityGroup, string> = {
  booking: "Booking",
  payment: "Payment",
  programme: "Programme",
  clinical: "Clinical",
  feedback: "Feedback",
  referral: "Referral",
  account: "Account",
};

export const USER_GROUPS = Object.keys(USER_GROUP_LABEL) as UserActivityGroup[];

type ActionMeta = {
  /** The row's action column in the table. */
  label: string;
  group: UserActivityGroup;
  /** Continues "<who> ..." in the stored sentence. */
  verb: string;
};

export const USER_ACTIVITY_META = {
  // booking
  "appointment.requested": { label: "Started a booking", group: "booking", verb: "started booking a session" },
  "appointment.booked_free": { label: "Confirmed a free session", group: "booking", verb: "confirmed a free session" },
  "appointment.booked_pay_later": {
    label: "Booked a session to pay later",
    group: "booking",
    verb: "booked a session to pay after treatment",
  },
  "appointment.booked_from_programme": {
    label: "Booked a session from a programme",
    group: "booking",
    verb: "booked a session from a programme",
  },
  "appointment.cancelled": { label: "Cancelled a session", group: "booking", verb: "cancelled a session" },
  "home_visit.booked": { label: "Booked a home visit", group: "booking", verb: "booked a home visit" },
  "session.completed": { label: "Completed a session", group: "booking", verb: "completed a session" },
  "suggestion.sent": { label: "Suggested a session", group: "booking", verb: "suggested a session" },
  "suggestion.withdrawn": { label: "Withdrew a suggested session", group: "booking", verb: "withdrew a suggested session" },
  "suggestion.accepted": { label: "Accepted a suggested session", group: "booking", verb: "accepted a suggested session" },
  "suggestion.declined": { label: "Declined a suggested session", group: "booking", verb: "declined a suggested session" },
  // payment
  "payment.captured": { label: "Payment received", group: "payment", verb: "paid for a session" },
  "payment.declared": { label: "Declared a payment", group: "payment", verb: "said they had paid what they owed" },
  "cash.collected": { label: "Recorded cash collected", group: "payment", verb: "recorded cash collected at the door" },
  "payout.requested": { label: "Asked for a payout", group: "payment", verb: "asked for a payout" },
  // programme
  "programme.purchased": { label: "Bought a programme", group: "programme", verb: "bought a programme" },
  "care_plan.recommended": { label: "Recommended a programme", group: "programme", verb: "recommended a programme" },
  "care_plan.withdrawn": { label: "Withdrew a recommendation", group: "programme", verb: "withdrew a recommendation" },
  "care_plan.declined": { label: "Turned down a recommendation", group: "programme", verb: "turned down a recommendation" },
  // clinical
  "health_profile.submitted": { label: "Submitted a health profile", group: "clinical", verb: "submitted a health profile" },
  "session_note.written": { label: "Wrote a session note", group: "clinical", verb: "wrote a session note" },
  "pain_assessment.recorded": { label: "Recorded a Pain Map exam", group: "clinical", verb: "recorded a Pain Map exam" },
  // feedback
  "feedback.submitted": { label: "Left session feedback", group: "feedback", verb: "left feedback on a session" },
  // referral
  "referral.submitted": { label: "Sent a referral", group: "referral", verb: "sent a referral" },
  "referral.withdrawn": { label: "Withdrew a referral", group: "referral", verb: "withdrew a referral" },
  // account
  "account.created": { label: "Account created", group: "account", verb: "created an account" },
} as const satisfies Record<string, ActionMeta>;

export type UserActivityAction = keyof typeof USER_ACTIVITY_META;

export function isUserActivityAction(action: string): action is UserActivityAction {
  return Object.prototype.hasOwnProperty.call(USER_ACTIVITY_META, action);
}

export function userActivityLabel(action: string): string | null {
  return isUserActivityAction(action) ? USER_ACTIVITY_META[action].label : null;
}

export function userActivityGroup(action: string): UserActivityGroup | null {
  return isUserActivityAction(action) ? USER_ACTIVITY_META[action].group : null;
}

// --------------------------------------------------------------------------
// The stored sentence
// --------------------------------------------------------------------------

export type SummaryContext = {
  actorRole: UserActorRole;
  actorName?: string | null;
  patientName?: string | null;
  therapistName?: string | null;
  sessionCode?: string | null;
  programmeCode?: string | null;
  conditionName?: string | null;
  amountPaise?: number | null;
  /** A short clause for what the action changed ("refund of ₹500 issued"). */
  note?: string | null;
};

const ROLE_FALLBACK_NAME: Record<UserActorRole, string> = {
  patient: "A patient",
  therapist: "A therapist",
  hospital: "A hospital",
  system: "The system",
};

function rupees(paise: number): string {
  const value = paise / 100;
  return `₹${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

/**
 * The sentence stored with an entry.
 *
 * Built once, at write time, from the names as they were then. Reads like
 * "Asha Rao cancelled a session (session MR-0042, programme PED_PKG001,
 * with Dr Mehta, condition Knee pain)". Whoever the action is *about* is
 * named when the actor is not that person, because "Dr Mehta wrote a
 * session note" says nothing a dispute can use without the patient.
 */
export function buildUserActivitySummary(action: string, ctx: SummaryContext): string {
  const who = clean(ctx.actorName) ?? ROLE_FALLBACK_NAME[ctx.actorRole];
  const verb = isUserActivityAction(action) ? USER_ACTIVITY_META[action].verb : action;
  const parts: string[] = [];
  const session = clean(ctx.sessionCode);
  const programme = clean(ctx.programmeCode);
  const patient = clean(ctx.patientName);
  const therapist = clean(ctx.therapistName);
  const condition = clean(ctx.conditionName);
  const note = clean(ctx.note);
  if (session) parts.push(`session ${session}`);
  if (programme) parts.push(`programme ${programme}`);
  if (ctx.actorRole === "patient") {
    if (therapist) parts.push(`with ${therapist}`);
  } else {
    if (patient) parts.push(`for ${patient}`);
    if (ctx.actorRole !== "therapist" && therapist) parts.push(`with ${therapist}`);
  }
  if (condition) parts.push(`condition ${condition}`);
  if (typeof ctx.amountPaise === "number" && ctx.amountPaise > 0) parts.push(rupees(ctx.amountPaise));
  if (note) parts.push(note);
  const sentence = parts.length > 0 ? `${who} ${verb} (${parts.join(", ")})` : `${who} ${verb}`;
  return sentence.slice(0, 400);
}

function clean(value: string | null | undefined): string | null {
  const v = typeof value === "string" ? value.trim() : "";
  return v ? v : null;
}

// --------------------------------------------------------------------------
// The feed's rows and filters
// --------------------------------------------------------------------------

/**
 * The columns the feed adds to a log row. Optional on purpose: an admin row
 * from before this existed carries none of them until the server resolves
 * its `target_id`, and a row that could not be resolved simply has no
 * subject to filter on.
 */
export type ActivitySubjectFields = {
  /** Absent means an admin, which is what every row before this was. */
  actorRole?: LogActorRole;
  actorId?: string | null;
  /** The stored sentence. Absent on an admin row. */
  summary?: string | null;
  patientId?: string | null;
  patientName?: string | null;
  therapistId?: string | null;
  therapistName?: string | null;
  appointmentId?: string | null;
  sessionCode?: string | null;
  programmeCode?: string | null;
  conditionName?: string | null;
};

export function rowRole(row: { actorRole?: LogActorRole }): LogActorRole {
  return row.actorRole ?? "admin";
}

export type SubjectFilters = {
  role: LogActorRole | "";
  /** Part of the actor's name. */
  person: string;
  /** Part of a programme ID, e.g. PED_PKG001 or just PED. */
  programme: string;
  /** Part of the patient's name. */
  patient: string;
  /** Part of the therapist's name. */
  therapist: string;
  /** A condition's name. */
  condition: string;
};

export const EMPTY_SUBJECT_FILTERS: SubjectFilters = {
  role: "",
  person: "",
  programme: "",
  patient: "",
  therapist: "",
  condition: "",
};

/** The URL keys. Prefixed so they cannot collide with another screen's. */
export const SUBJECT_FILTER_PARAMS: Record<keyof SubjectFilters, string> = {
  role: "al_role",
  person: "al_who",
  programme: "al_prog",
  patient: "al_pat",
  therapist: "al_ther",
  condition: "al_cond",
};

export function parseSubjectFilters(params: { get(key: string): string | null }): SubjectFilters {
  const read = (k: keyof SubjectFilters) => (params.get(SUBJECT_FILTER_PARAMS[k]) ?? "").trim().slice(0, 80);
  const role = read("role");
  return {
    role: isLogActorRole(role) ? role : "",
    person: read("person"),
    programme: read("programme"),
    patient: read("patient"),
    therapist: read("therapist"),
    condition: read("condition"),
  };
}

/** Writes the filters into `params`, removing the ones that are off. */
export function writeSubjectFilters(params: URLSearchParams, filters: SubjectFilters): URLSearchParams {
  for (const k of Object.keys(SUBJECT_FILTER_PARAMS) as (keyof SubjectFilters)[]) {
    const v = filters[k];
    if (v) params.set(SUBJECT_FILTER_PARAMS[k], v);
    else params.delete(SUBJECT_FILTER_PARAMS[k]);
  }
  return params;
}

export function hasSubjectFilters(filters: SubjectFilters): boolean {
  return (Object.keys(SUBJECT_FILTER_PARAMS) as (keyof SubjectFilters)[]).some((k) => Boolean(filters[k]));
}

function containsAllTerms(haystack: string | null | undefined, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const h = (haystack ?? "").toLowerCase();
  return terms.every((t) => h.includes(t));
}

/** Programme IDs are compared without case, spaces or underscores:
 *  PED_PKG001 = ped pkg001 = pedpkg001. */
function normaliseProgramme(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/[\s_]+/g, "");
}

/**
 * Whether one row passes the feed's own filters. A row without the thing
 * being filtered on never matches a non-empty filter -- "Programme PED" must
 * not list entries that have no programme.
 */
export function matchesSubjectFilters(
  row: ActivitySubjectFields & { actorName: string },
  filters: SubjectFilters
): boolean {
  if (filters.role && rowRole(row) !== filters.role) return false;
  if (!containsAllTerms(row.actorName, filters.person)) return false;
  if (filters.programme && !normaliseProgramme(row.programmeCode).includes(normaliseProgramme(filters.programme))) {
    return false;
  }
  if (filters.patient && !containsAllTerms(row.patientName, filters.patient)) return false;
  if (filters.therapist && !containsAllTerms(row.therapistName, filters.therapist)) return false;
  if (filters.condition && (row.conditionName ?? "").toLowerCase() !== filters.condition.toLowerCase()) {
    return false;
  }
  return true;
}

/** The distinct, sorted values present in the loaded rows, for a dropdown. */
export function distinctValues(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.map((v) => (v ?? "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

/**
 * Two logs, one newest-first feed.
 *
 * Deduplicated by id, then cut to `limit`. The cut is safe for the cursor
 * the older pages use (the oldest `createdAt` shown): anything dropped here
 * is older than everything kept, so the next page fetches it again.
 */
export function mergeActivityRows<T extends { id: string; createdAt: string }>(
  lists: T[][],
  limit: number
): T[] {
  const seen = new Set<string>();
  const all: T[] = [];
  for (const list of lists) {
    for (const row of list) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      all.push(row);
    }
  }
  all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return all.slice(0, limit);
}

/** A uuid, checked before one is ever put into a PostgREST `or()` string. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
