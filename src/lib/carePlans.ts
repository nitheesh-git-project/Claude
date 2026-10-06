// Care plans: what a therapist recommends after seeing a patient, and what
// the patient is then offered.
//
// Dependency-free, per the business-math rule in AGENTS.md, so the
// authoring route, the therapist's dialog, the patient's screen and the
// Health Profile history all read one definition.
//
// The rule that shapes the whole feature: a therapist picks a condition and
// a number of sessions, never a price. The price is that condition's own
// per-session price times the count -- the online consultation price for
// video sessions, the single home-visit price when the plan needs hands-on
// treatment -- resolved on the server from the catalog. Whether it is video
// or home visits is not a separate choice either: "needs hands-on
// treatment" decides it (`offerKindFor`).

export const CARE_PLAN_STATUSES = [
  "pending_review",
  "active",
  "accepted",
  "declined",
  "withdrawn",
  "rejected",
  "expired",
  "superseded",
] as const;
export type CarePlanStatus = (typeof CARE_PLAN_STATUSES)[number];

export type CarePlanOfferKind = "session_package" | "home_visit_package";

/** What a therapist actually fills in. Everything else is the catalog's. */
export type CarePlanAuthorInput = {
  offerKind: CarePlanOfferKind;
  categoryId: string;
  sessionCount: number;
  handsOnRequired: boolean;
  frequencyPerWeek: number | null;
  clinicalRationale: string;
  instructions: string;
};

export const MAX_RATIONALE_LENGTH = 800;
export const MIN_COURSE_SESSIONS = 1;
export const MAX_COURSE_SESSIONS = 30;

/** Hands-on treatment is delivered at home; everything else by video. One
 *  switch, so a plan can never say "hands-on" and sell video sessions. */
export function offerKindFor(handsOnRequired: boolean): CarePlanOfferKind {
  return handsOnRequired ? "home_visit_package" : "session_package";
}

/**
 * What one session of a condition costs, by delivery mode -- the unit a
 * recommendation is priced in. Resolved server-side (carePlanServer.ts) from
 * the condition's own price (video) or the single home-visit price (hands-on).
 */
export type CourseRate = {
  kind: CarePlanOfferKind;
  categoryId: string;
  categoryTitle: string;
  imageUrl: string | null;
  perSessionPaise: number;
  sessionDurationMinutes: number | null;
  validityDays: number | null;
  travelFeeIncluded: boolean;
};

/**
 * One thing a clinician may recommend: a condition, delivered by video or
 * (when it needs hands-on treatment) at home, at that condition's
 * per-session price. The picker asks for a condition and a number; the
 * price is this rate times the number (`buildCourseSnapshot`).
 */
export type RecommendableRate = CourseRate & {
  id: string;
  /** Which of the three condition types the condition belongs to, for
   *  grouping the picker. Null where an admin has not tagged it. */
  specialty: "ortho" | "neuro" | "pediatrics" | null;
};

export function validateSessionCount(count: unknown): string | null {
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < MIN_COURSE_SESSIONS ||
    count > MAX_COURSE_SESSIONS
  ) {
    return `Choose between ${MIN_COURSE_SESSIONS} and ${MAX_COURSE_SESSIONS} sessions.`;
  }
  return null;
}

/** The total a patient is asked to pay for `count` sessions, before any
 *  home-visit travel. Integer paise. */
export function coursePricePaise(perSessionPaise: number, count: number): number {
  return Math.max(0, Math.round(perSessionPaise)) * count;
}

/** The snapshot a per-session recommendation is frozen with. */
export function buildCourseSnapshot(rate: CourseRate, count: number): CarePlanOfferSnapshot {
  return {
    title: rate.categoryTitle,
    sessionCount: count,
    pricePaise: coursePricePaise(rate.perSessionPaise, count),
    comparePaise: null,
    validityDays: rate.validityDays,
    sessionDurationMinutes: rate.sessionDurationMinutes,
    minGapHours: null,
    maxPerWeek: null,
    therapistLocked: true,
    terms: null,
    travelFeeIncluded: rate.kind === "home_visit_package" && rate.travelFeeIncluded,
    course: true,
    perSessionPaise: rate.perSessionPaise,
    categoryId: rate.categoryId,
    imageUrl: rate.imageUrl,
  };
}
export const MAX_INSTRUCTIONS_LENGTH = 800;

/**
 * A version's own reading of a package, frozen at authoring time.
 *
 * Copied rather than joined so the patient is shown the plan they were
 * actually offered, even if an admin re-prices the package before they
 * answer. Checkout re-reads the live row and refuses on a mismatch rather
 * than quietly charging a different amount -- the snapshot is for display
 * and for the record, never for the charge.
 */
export type CarePlanOfferSnapshot = {
  title: string;
  sessionCount: number;
  pricePaise: number;
  comparePaise: number | null;
  validityDays: number | null;
  sessionDurationMinutes: number | null;
  minGapHours: number | null;
  maxPerWeek: number | null;
  therapistLocked: boolean;
  terms: string | null;
  /** Home-visit packages only: whether travel is already in the price.
   *  Absent on snapshots written before travel was charged on a
   *  recommendation, and parsed as false there -- the safe direction, since
   *  it means travel is shown as a separate line rather than silently
   *  assumed to be covered. */
  travelFeeIncluded: boolean;
  /** Per-session recommendations (count x the condition's per-session
   *  price). False on versions written against an admin programme, which
   *  keep that older checkout path. */
  course: boolean;
  perSessionPaise: number | null;
  /** The condition, and its photograph for the patient's card. */
  categoryId: string | null;
  imageUrl: string | null;
};

/** Builds the snapshot from a catalog row of either kind. */
export function buildOfferSnapshot(
  kind: CarePlanOfferKind,
  row: Record<string, unknown>
): CarePlanOfferSnapshot {
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const isHomeVisit = kind === "home_visit_package";
  return {
    title: typeof row.title === "string" ? row.title : "Programme",
    sessionCount: num(isHomeVisit ? row.visit_count : row.session_count) ?? 0,
    pricePaise: num(row.price_paise) ?? 0,
    comparePaise: num(row.compare_at_paise),
    validityDays: num(row.validity_days),
    sessionDurationMinutes: num(
      isHomeVisit ? row.visit_duration_minutes : row.session_duration_minutes
    ),
    minGapHours: num(row.min_gap_hours),
    maxPerWeek: num(isHomeVisit ? row.max_visits_per_week : row.max_sessions_per_week),
    therapistLocked: row.therapist_locked !== false,
    // Home-visit packages only. A session package's `terms` column is gone
    // -- it was fine print for a public programme card this app no longer
    // renders, and it reached no screen through this snapshot either. The
    // field stays on the type because versions already written carry it.
    terms: typeof row.terms === "string" ? row.terms : null,
    travelFeeIncluded: isHomeVisit && row.travel_fee_included === true,
    course: false,
    perSessionPaise: null,
    categoryId: typeof row.category_id === "string" ? row.category_id : null,
    imageUrl: typeof row.image_url === "string" ? row.image_url : null,
  };
}

export function parseOfferSnapshot(value: unknown): CarePlanOfferSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (typeof r.title !== "string") return null;
  return {
    title: r.title,
    sessionCount: Number(r.sessionCount ?? 0),
    pricePaise: Number(r.pricePaise ?? 0),
    comparePaise: r.comparePaise === null || r.comparePaise === undefined ? null : Number(r.comparePaise),
    validityDays: r.validityDays === null || r.validityDays === undefined ? null : Number(r.validityDays),
    sessionDurationMinutes:
      r.sessionDurationMinutes === null || r.sessionDurationMinutes === undefined
        ? null
        : Number(r.sessionDurationMinutes),
    minGapHours: r.minGapHours === null || r.minGapHours === undefined ? null : Number(r.minGapHours),
    maxPerWeek: r.maxPerWeek === null || r.maxPerWeek === undefined ? null : Number(r.maxPerWeek),
    therapistLocked: r.therapistLocked !== false,
    terms: typeof r.terms === "string" ? r.terms : null,
    travelFeeIncluded: r.travelFeeIncluded === true,
    course: r.course === true,
    perSessionPaise:
      typeof r.perSessionPaise === "number" && Number.isFinite(r.perSessionPaise)
        ? r.perSessionPaise
        : null,
    categoryId: typeof r.categoryId === "string" ? r.categoryId : null,
    imageUrl: typeof r.imageUrl === "string" ? r.imageUrl : null,
  };
}

/**
 * Validates the therapist's own fields.
 *
 * `frequencyPerWeek` is capped by the package's own `maxPerWeek` where it
 * has one -- a clinician recommending four sessions a week on a programme
 * whose rules allow two would be writing a plan the booking code refuses,
 * and finding that out at checkout is the patient's problem rather than
 * the author's.
 */
export function validateCarePlanInput(
  input: CarePlanAuthorInput,
  snapshot: CarePlanOfferSnapshot,
  { maxFrequencyPerWeek }: { maxFrequencyPerWeek: number }
): { ok: true } | { ok: false; error: string } {
  const countError = validateSessionCount(input.sessionCount);
  if (countError) return { ok: false, error: countError };
  if (input.frequencyPerWeek !== null) {
    if (
      !Number.isInteger(input.frequencyPerWeek) ||
      input.frequencyPerWeek < 1 ||
      input.frequencyPerWeek > 7
    ) {
      return { ok: false, error: "Frequency must be between 1 and 7 sessions a week." };
    }
    const cap = Math.min(
      maxFrequencyPerWeek,
      snapshot.maxPerWeek ?? maxFrequencyPerWeek
    );
    if (input.frequencyPerWeek > cap) {
      return {
        ok: false,
        error: `This programme allows at most ${cap} session${cap === 1 ? "" : "s"} a week.`,
      };
    }
  }
  if (input.clinicalRationale.length > MAX_RATIONALE_LENGTH) {
    return { ok: false, error: `Your reasoning must be ${MAX_RATIONALE_LENGTH} characters or fewer.` };
  }
  if (input.instructions.length > MAX_INSTRUCTIONS_LENGTH) {
    return { ok: false, error: `Instructions must be ${MAX_INSTRUCTIONS_LENGTH} characters or fewer.` };
  }
  return { ok: true };
}

/**
 * What the reader should be shown, which is not always what `status` says.
 *
 * A plan is never *expired* in the database -- nothing writes a status when
 * time passes, because this deployment has no scheduled worker and a state
 * only a sweep can reach is wrong between sweeps. Same rule
 * `suggestionState` already follows for proposed times.
 */
export type CarePlanState =
  | "pending_review"
  | "awaiting_patient"
  | "lapsed"
  | "accepted"
  | "declined"
  | "withdrawn"
  | "rejected"
  | "superseded";

export function carePlanState(
  plan: { status: CarePlanStatus },
  version: { expires_at: string | null } | null,
  nowMs: number
): CarePlanState {
  // Checked before everything else, and never allowed to fall through to
  // the default. A recommendation waiting on the clinic must not read as
  // one waiting on the patient: `isCarePlanPurchasable` is what the
  // checkout route asks, and the honest answer for an unreviewed plan is
  // no.
  if (plan.status === "pending_review") return "pending_review";
  if (plan.status === "rejected") return "rejected";
  if (plan.status === "accepted") return "accepted";
  if (plan.status === "declined") return "declined";
  if (plan.status === "withdrawn") return "withdrawn";
  if (plan.status === "superseded" || plan.status === "expired") return "superseded";
  if (version?.expires_at) {
    const ms = new Date(version.expires_at).getTime();
    if (!Number.isNaN(ms) && ms <= nowMs) return "lapsed";
  }
  return "awaiting_patient";
}

export const CARE_PLAN_STATE_LABELS: Record<CarePlanState, string> = {
  pending_review: "Waiting for the clinic to approve",
  rejected: "Not approved by the clinic",
  awaiting_patient: "Waiting for your answer",
  lapsed: "This recommendation has expired",
  accepted: "Purchased",
  declined: "Declined",
  withdrawn: "Withdrawn by your therapist",
  superseded: "Replaced by a newer recommendation",
};

export function isCarePlanPurchasable(state: CarePlanState): boolean {
  return state === "awaiting_patient";
}

/**
 * What changed between two versions, for the history band.
 *
 * Reads back as a sentence a clinician wrote rather than a diff, because
 * the question a reader has is "what did they change their mind about?".
 */
export function describeVersionChange(
  previous: {
    offer_snapshot: unknown;
    hands_on_required: boolean;
    frequency_per_week: number | null;
  },
  next: {
    offer_snapshot: unknown;
    hands_on_required: boolean;
    frequency_per_week: number | null;
  }
): string[] {
  const before = parseOfferSnapshot(previous.offer_snapshot);
  const after = parseOfferSnapshot(next.offer_snapshot);
  const changes: string[] = [];

  if (before && after && before.title !== after.title) {
    changes.push(`Programme changed from ${before.title} to ${after.title}`);
  }
  if (before && after && before.sessionCount !== after.sessionCount) {
    changes.push(`Sessions changed from ${before.sessionCount} to ${after.sessionCount}`);
  }
  if (previous.hands_on_required !== next.hands_on_required) {
    changes.push(
      next.hands_on_required
        ? "Now needs hands-on treatment"
        : "No longer needs hands-on treatment"
    );
  }
  if (previous.frequency_per_week !== next.frequency_per_week) {
    changes.push(
      next.frequency_per_week
        ? `Frequency changed to ${next.frequency_per_week} a week`
        : "Frequency left open"
    );
  }
  return changes;
}

/** One line summarising a version, for a list row. */
export function summariseVersion(version: {
  offer_snapshot: unknown;
  frequency_per_week: number | null;
}): string {
  const snapshot = parseOfferSnapshot(version.offer_snapshot);
  if (!snapshot) return "Programme";
  const sessions = `${snapshot.sessionCount} session${snapshot.sessionCount === 1 ? "" : "s"}`;
  const frequency = version.frequency_per_week
    ? `, ${version.frequency_per_week} a week`
    : "";
  return `${snapshot.title} - ${sessions}${frequency}`;
}

/**
 * The programmes worth offering against one session.
 *
 * Both authoring doors load every recommendable package once -- a therapist's
 * dashboard covers all their patients, an admin's screen covers all of them --
 * so neither can narrow at load time, and both narrow here instead. Scanning
 * the whole catalog is how the wrong programme gets picked, and it is a
 * clinician-facing list, so the two doors must not differ.
 *
 * An unattached package is offered against every session rather than none: a
 * package with no category is not a package for no one. A session with no
 * category (recorded before the column existed) gets the lot.
 */
export function narrowToCategory<T extends { categoryId: string | null }>(
  options: T[],
  categoryId: string | null
): T[] {
  if (!categoryId) return options;
  return options.filter((o) => o.categoryId === null || o.categoryId === categoryId);
}


/**
 * How long something has been sitting in a queue, in words.
 *
 * A queue whose rows are dated but not aged makes an admin do arithmetic to
 * find the person who has been waiting longest - and a card that reads
 * "2 September" when the thing arrived nine minutes ago is worse than no
 * date at all, because the reader cannot tell nine minutes from nine hours.
 *
 * Deliberately coarse. The number an admin acts on is "is this hours or
 * days", never "is this 41 or 43 minutes".
 */
export function formatWaitingFor(sinceIso: string | null, nowMs: number): string | null {
  if (!sinceIso) return null;
  const then = new Date(sinceIso).getTime();
  if (Number.isNaN(then)) return null;
  const minutes = Math.floor((nowMs - then) / 60_000);
  if (minutes < 0) return "just now";
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Whether something has been waiting long enough to be worth chasing.
 *
 * Four hours, and a fixed number rather than a setting on purpose: this
 * changes nothing about what the clinic may do, only whether a row is
 * coloured - and a threshold an admin can raise until nothing is ever late
 * is a threshold that has stopped meaning anything.
 */
export const CARE_PLAN_QUEUE_STALE_HOURS = 4;

export function isQueueStale(sinceIso: string | null, nowMs: number): boolean {
  if (!sinceIso) return false;
  const then = new Date(sinceIso).getTime();
  if (Number.isNaN(then)) return false;
  return nowMs - then >= CARE_PLAN_QUEUE_STALE_HOURS * 3_600_000;
}
