// Where every programme is, for the admin's Programmes section.
//
// A programme used to live in two places that never met: the
// recommendation on Sessions -> Recommendations until the patient paid, and
// the purchase on Catalog -> Purchases after -- with a different code on
// each side (none, then SP0001 or HS0001), so the owner could not follow
// one programme from "the therapist suggested six sessions" to "four are
// done". This module puts the two halves back together as one row with one
// stage, and is the only place the stage is decided, so the pipeline count,
// the status pill and the filter cannot disagree.
//
// The pipeline is the order a programme moves in:
//   waiting approval -> with patient -> paid, nothing booked -> in progress
//   -> completed
// and the ways it can stop: declined by the patient, not approved by the
// clinic, withdrawn, lapsed (the offer ran out unanswered), expired (bought
// and not used in time), refunded.
//
// Dependency-free so it is tested without rendering.

import { istDateKey } from "./formatSlotRange";
import { programmeQueryMatches } from "./programmeId";
import type { CarePlanState } from "./carePlans";

export const PIPELINE_STAGES = [
  "waiting_approval",
  "with_patient",
  "paid_unbooked",
  "in_progress",
  "completed",
] as const;

export const CLOSED_STAGES = [
  "declined",
  "not_approved",
  "withdrawn",
  "lapsed",
  "expired",
  "refunded",
] as const;

export type ProgrammeStage = (typeof PIPELINE_STAGES)[number] | (typeof CLOSED_STAGES)[number];

export const ALL_STAGES: readonly ProgrammeStage[] = [...PIPELINE_STAGES, ...CLOSED_STAGES];

export const STAGE_LABEL: Record<ProgrammeStage, string> = {
  waiting_approval: "Waiting approval",
  with_patient: "With patient",
  paid_unbooked: "Paid - nothing booked",
  in_progress: "In progress",
  completed: "Completed",
  declined: "Declined",
  not_approved: "Not approved",
  withdrawn: "Withdrawn",
  lapsed: "Lapsed",
  expired: "Expired",
  refunded: "Refunded",
};

/** One line saying what the stage means and whose move it is. */
export const STAGE_HINT: Record<ProgrammeStage, string> = {
  waiting_approval: "A therapist recommended it. The patient can't see it until you approve.",
  with_patient: "Approved and on the patient's dashboard, waiting for them to accept and pay.",
  paid_unbooked: "Paid for, and not one session booked yet. Ring the patient.",
  in_progress: "Sessions are booked or done, and some are still to come.",
  completed: "Every session bought has been done.",
  declined: "The patient said no.",
  not_approved: "The clinic turned the recommendation down.",
  withdrawn: "Taken back, or replaced by a newer recommendation.",
  lapsed: "The offer ran out before the patient answered.",
  expired: "Bought, but not used before its expiry date.",
  refunded: "The money for the unused sessions went back.",
};

/** Pill colours, shared by the pipeline, the list and the drawer. */
export const STAGE_TONE: Record<ProgrammeStage, string> = {
  waiting_approval: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  with_patient: "bg-amber-50 text-amber-800 ring-amber-200",
  paid_unbooked: "bg-rose-50 text-rose-700 ring-rose-200",
  in_progress: "bg-sky-50 text-sky-700 ring-sky-200",
  completed: "bg-teal-50 text-teal-700 ring-teal-200",
  declined: "bg-slate-100 text-slate-700 ring-slate-200",
  not_approved: "bg-slate-100 text-slate-700 ring-slate-200",
  withdrawn: "bg-slate-100 text-slate-700 ring-slate-200",
  lapsed: "bg-slate-100 text-slate-700 ring-slate-200",
  expired: "bg-orange-50 text-orange-800 ring-orange-200",
  refunded: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function isProgrammeStage(value: unknown): value is ProgrammeStage {
  return typeof value === "string" && (ALL_STAGES as readonly string[]).includes(value);
}

export type StageInput = {
  /** The recommendation's state, when the programme came from one. */
  planState: CarePlanState | null;
  /** The purchase the patient owns, when there is one they paid for or
   *  agreed to pay at the door. An abandoned checkout is not one. */
  purchase: {
    status: string;
    /** Sessions completed. */
    done: number;
    /** Sessions booked and still to come (not cancelled, not completed). */
    booked: number;
    total: number;
  } | null;
};

/** The one stage a programme is in. */
export function programmeStage({ planState, purchase }: StageInput): ProgrammeStage {
  if (purchase) {
    if (purchase.status === "refunded" || purchase.status === "cancelled") return "refunded";
    if (purchase.status === "expired") return "expired";
    if (purchase.status === "completed" || (purchase.total > 0 && purchase.done >= purchase.total)) {
      return "completed";
    }
    if (purchase.done + purchase.booked === 0) return "paid_unbooked";
    return "in_progress";
  }
  switch (planState) {
    case "pending_review":
      return "waiting_approval";
    case "awaiting_patient":
      return "with_patient";
    case "rejected":
      return "not_approved";
    case "declined":
      return "declined";
    case "lapsed":
      return "lapsed";
    case "withdrawn":
    case "superseded":
      return "withdrawn";
    // Accepted with no purchase in view: the purchase read failed or is
    // still landing. Paid is what accepted means.
    case "accepted":
      return "paid_unbooked";
    default:
      return "withdrawn";
  }
}

// ---- Rows ----------------------------------------------------------------

export type ProgrammeMode = "online" | "home_visit";

export type ProgrammeSession = {
  id: string;
  sessionCode: string | null;
  status: string;
  slotTime: string | null;
  therapistName: string | null;
  createdAt: string | null;
  completedAt: string | null;
};

export type ProgrammeEventKind =
  | "written"
  | "rewritten"
  | "approved"
  | "rejected"
  | "sent"
  | "accepted"
  | "declined"
  | "withdrawn"
  | "lapsed"
  | "paid"
  | "booked"
  | "completed_session"
  | "expired"
  | "refunded";

export type ProgrammeEvent = {
  at: string;
  kind: ProgrammeEventKind;
  label: string;
  detail?: string | null;
};

export type ProgrammeMoney = {
  listPricePaise: number | null;
  discountPaise: number;
  promoCode: string | null;
  paidPaise: number | null;
  /** Home visits: travel per visit, charged on top. */
  travelFeePaise: number;
  refundPaise: number | null;
};

export type ProgrammeRow = {
  /** "plan:<id>" or "purchase:<id>" -- stable across refreshes. */
  key: string;
  /** PED_PKG001, or null on a database without the new IDs yet. */
  code: string | null;
  /** PED_PKG001-2/6. */
  display: string;
  /** SP0001 / HS0001 and any ID a rewrite replaced. */
  otherCodes: string[];
  carePlanId: string | null;
  purchaseId: string | null;
  purchaseKind: "package" | "home_visit" | null;
  mode: ProgrammeMode;
  conditionId: string | null;
  conditionTitle: string;
  patientId: string;
  patientName: string;
  /** The programme's therapist: who it is locked to, else who wrote it. */
  therapistId: string | null;
  therapistName: string | null;
  /** Who wrote the recommendation, when it came from one. */
  authorName: string | null;
  stage: ProgrammeStage;
  done: number;
  booked: number;
  total: number;
  createdAt: string;
  paidAt: string | null;
  /** The purchase's expiry, or an unbought offer's. */
  expiresAt: string | null;
  nextSession: { slotTime: string; sessionCode: string | null } | null;
  sessions: ProgrammeSession[];
  timeline: ProgrammeEvent[];
  /** Null for a desk that cannot open Money -- never sent to it. */
  money: ProgrammeMoney | null;
  /** How the patient pays a home-visit programme. */
  paymentMode: "prepaid" | "cash_on_visit" | null;
  rationale: string | null;
  declineReason: string | null;
  /** The clinic's reason, when it turned the recommendation down. */
  reviewReason: string | null;
};

export function countStages(rows: readonly { stage: ProgrammeStage }[]): Record<ProgrammeStage, number> {
  const out = Object.fromEntries(ALL_STAGES.map((s) => [s, 0])) as Record<ProgrammeStage, number>;
  for (const r of rows) out[r.stage] += 1;
  return out;
}

// ---- Filters -------------------------------------------------------------

export type ProgrammeFilters = {
  q: string;
  /** A stage, "open" (every pipeline stage), or "" for everything. */
  stage: ProgrammeStage | "open" | "";
  condition: string;
  therapist: string;
  mode: ProgrammeMode | "";
  /** Clinic-zone YYYY-MM-DD, on when the programme started. */
  from: string;
  to: string;
  /** Hours, as digits: only programmes paid at least this long ago with
   *  nothing booked. Set by the Today and Money counts that link here, so
   *  the list holds exactly the rows the count counted. */
  late: string;
};

export const EMPTY_PROGRAMME_FILTERS: ProgrammeFilters = {
  q: "",
  stage: "",
  condition: "",
  therapist: "",
  mode: "",
  from: "",
  to: "",
  late: "",
};

/** The URL keys. Prefixed so they cannot collide with another screen's. */
export const PROGRAMME_FILTER_PARAMS: Record<keyof ProgrammeFilters, string> = {
  q: "pg_q",
  stage: "pg_stage",
  condition: "pg_cond",
  therapist: "pg_ther",
  mode: "pg_mode",
  from: "pg_from",
  to: "pg_to",
  late: "pg_late",
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Filters from a query string. Anything unreadable is simply not applied. */
export function parseProgrammeFilters(params: { get(key: string): string | null }): ProgrammeFilters {
  const read = (k: keyof ProgrammeFilters) => (params.get(PROGRAMME_FILTER_PARAMS[k]) ?? "").trim();
  const stage = read("stage");
  const mode = read("mode");
  const from = read("from");
  const to = read("to");
  const late = read("late");
  return {
    q: read("q").slice(0, 80),
    stage: stage === "open" || isProgrammeStage(stage) ? stage : "",
    condition: read("condition"),
    therapist: read("therapist"),
    mode: mode === "online" || mode === "home_visit" ? mode : "",
    from: DATE_KEY.test(from) ? from : "",
    to: DATE_KEY.test(to) ? to : "",
    late: /^\d{1,4}$/.test(late) ? late : "",
  };
}

/** Writes the filters into `params`, removing the ones that are off. */
export function writeProgrammeFilters(params: URLSearchParams, filters: ProgrammeFilters): URLSearchParams {
  for (const k of Object.keys(PROGRAMME_FILTER_PARAMS) as (keyof ProgrammeFilters)[]) {
    const v = filters[k];
    if (v) params.set(PROGRAMME_FILTER_PARAMS[k], v);
    else params.delete(PROGRAMME_FILTER_PARAMS[k]);
  }
  return params;
}

export function hasProgrammeFilters(filters: ProgrammeFilters): boolean {
  return Object.values(filters).some(Boolean);
}

/**
 * A one-shot `?view=` preset (adminScreenHref). `stage:<stage>`,
 * `code:<programme id>` and `patient:<id>` -- the Today pulse, the money
 * alerts and the session drawer link with these. Unknown presets clear the
 * filters and show everything, rather than nothing.
 */
export function filtersFromView(view: string | null): ProgrammeFilters | null {
  if (!view) return null;
  const [kind, ...rest] = view.split(":");
  const value = rest.join(":").trim();
  if (kind === "stage" && (value === "open" || isProgrammeStage(value))) {
    return { ...EMPTY_PROGRAMME_FILTERS, stage: value };
  }
  if ((kind === "code" || kind === "patient") && value) {
    return { ...EMPTY_PROGRAMME_FILTERS, q: value };
  }
  // "Paid with nothing booked for N hours": what the Today queue row and the
  // Money alert count, each with its own threshold.
  if (kind === "late" && /^\d{1,4}$/.test(value)) {
    return { ...EMPTY_PROGRAMME_FILTERS, stage: "paid_unbooked", late: value };
  }
  if (view === "unscheduled") return { ...EMPTY_PROGRAMME_FILTERS, stage: "paid_unbooked", late: "24" };
  return { ...EMPTY_PROGRAMME_FILTERS };
}

export function programmeMatchesQuery(row: ProgrammeRow, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  if (programmeQueryMatches(q, [row.code, ...row.otherCodes])) return true;
  const lower = q.toLowerCase();
  const sessionCodes = row.sessions.map((s) => s.sessionCode ?? "");
  return [row.patientName, row.therapistName ?? "", row.authorName ?? "", row.conditionTitle, row.patientId, ...sessionCodes]
    .some((t) => t && t.toLowerCase().includes(lower));
}

/** Every filter but the stage, so the pipeline counts what the other
 *  filters leave and a tap on a stage never lands on an empty list. */
export function filterProgrammesExceptStage(
  rows: readonly ProgrammeRow[],
  f: ProgrammeFilters,
  nowMs: number = Date.now()
): ProgrammeRow[] {
  const lateMs = f.late ? Number(f.late) * 3_600_000 : 0;
  return rows.filter((r) => {
    if (lateMs > 0) {
      if (r.stage !== "paid_unbooked") return false;
      const since = new Date(r.paidAt ?? r.createdAt).getTime();
      if (!Number.isFinite(since) || nowMs - since < lateMs) return false;
    }
    if (f.condition && r.conditionId !== f.condition) return false;
    if (f.therapist && r.therapistId !== f.therapist) return false;
    if (f.mode && r.mode !== f.mode) return false;
    if (f.from || f.to) {
      const key = r.createdAt ? istDateKey(r.createdAt) : "";
      if (!key) return false;
      if (f.from && key < f.from) return false;
      if (f.to && key > f.to) return false;
    }
    return programmeMatchesQuery(r, f.q);
  });
}

export function filterProgrammes(
  rows: readonly ProgrammeRow[],
  f: ProgrammeFilters,
  nowMs: number = Date.now()
): ProgrammeRow[] {
  const rest = filterProgrammesExceptStage(rows, f, nowMs);
  if (!f.stage) return rest;
  if (f.stage === "open") return rest.filter((r) => (PIPELINE_STAGES as readonly string[]).includes(r.stage));
  return rest.filter((r) => r.stage === f.stage);
}

// ---- Timeline ------------------------------------------------------------

export type TimelineInput = {
  versions: { authoredAt: string; versionNo: number; byClinic: boolean; authorName: string | null }[];
  reviews: { at: string; decision: "approved" | "rejected" | "edited_and_approved"; reviewerName: string | null; reason: string | null }[];
  /** When the patient could first see it: an approval, or the submission
   *  itself when the clinic does not review. */
  sentAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  withdrawnAt: string | null;
  lapsedAt: string | null;
  paidAt: string | null;
  /** Shown only to a desk that can open Money. */
  paidLabel: string | null;
  sessions: ProgrammeSession[];
  expiredAt: string | null;
  refundedAt: string | null;
  refundLabel: string | null;
};

function valid(at: string | null | undefined): at is string {
  return !!at && !Number.isNaN(new Date(at).getTime());
}

/** Everything that happened to one programme, oldest first. */
export function buildProgrammeTimeline(input: TimelineInput): ProgrammeEvent[] {
  const out: ProgrammeEvent[] = [];
  const push = (at: string | null | undefined, kind: ProgrammeEventKind, label: string, detail?: string | null) => {
    if (valid(at)) out.push({ at, kind, label, detail: detail ?? null });
  };
  for (const v of input.versions) {
    if (v.versionNo <= 1) {
      push(v.authoredAt, "written", `Recommended${v.authorName ? ` by ${v.authorName}` : ""}`);
    } else {
      push(v.authoredAt, "rewritten", v.byClinic ? "Changed by the clinic" : "Revised by the therapist", `Version ${v.versionNo}`);
    }
  }
  for (const r of input.reviews) {
    const who = r.reviewerName ? ` by ${r.reviewerName}` : "";
    if (r.decision === "rejected") push(r.at, "rejected", `Not approved${who}`, r.reason);
    else push(r.at, "approved", r.decision === "edited_and_approved" ? `Changed and approved${who}` : `Approved${who}`, r.reason);
  }
  push(input.sentAt, "sent", "Sent to the patient");
  push(input.acceptedAt, "accepted", "Accepted by the patient");
  push(input.declinedAt, "declined", "Declined by the patient", input.declineReason);
  push(input.withdrawnAt, "withdrawn", "Withdrawn");
  push(input.lapsedAt, "lapsed", "Lapsed - the patient did not answer in time");
  push(input.paidAt, "paid", "Paid", input.paidLabel);
  for (const s of input.sessions) {
    const code = s.sessionCode ?? "A session";
    push(s.createdAt, "booked", `${code} booked`, s.therapistName ? `Therapist: ${s.therapistName}` : "Waiting for a therapist");
    if (s.status === "completed") push(s.completedAt ?? s.slotTime, "completed_session", `${code} completed`);
  }
  push(input.expiredAt, "expired", "Expired with sessions unused");
  push(input.refundedAt, "refunded", "Refunded", input.refundLabel);
  return out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}
