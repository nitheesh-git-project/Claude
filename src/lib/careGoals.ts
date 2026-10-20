import {
  deriveMilestone,
  isMilestoneOverdue,
  sortMilestones,
  criterionDirection,
  type DerivedMilestone,
  type MilestoneRecord,
  type MilestoneStatus,
} from "@/lib/milestones";
import { MILESTONE_TEMPLATES, PHASES_BY_PROFILE_KIND } from "@/lib/milestoneTemplates";
import {
  PROFILE_KIND_LABELS,
  isMeasureEnabled,
  isProfileKind,
  outcomeMeasure,
  validateMeasurementValue,
  type MeasurementSide,
  type ProfileKind,
} from "@/lib/outcomeMeasures";
import { toMeasurementReading, type MeasurementPoint } from "@/lib/outcomeSeries";

// The goal and its milestones: row shapes, the validation both save routes
// run, and the shaping the Health Profile draws from.
//
// Pure and dependency-free (the reads are outcomeServer.ts, the writes
// /api/therapist/care-goals/save and /api/therapist/care-milestones/save).
// The database is the last word on two rules -- one active goal per patient
// (a partial unique index) and "reached once" (the care_milestones_guard
// trigger) -- and these validators are the first, so a request the table
// would refuse is a 400 with a sentence rather than a constraint name.

// --- Rows ---------------------------------------------------------------------------

export const CARE_GOAL_SELECT =
  "id, patient_id, profile_kind, goal_text, target_date, status, authored_by, authored_by_role, created_at, updated_at";

export const CARE_MILESTONE_SELECT =
  "id, goal_id, patient_id, title, criterion, phase, linked_measure_key, linked_variant, linked_side, target_value, baseline_value, status, reached_at, reached_measurement_id, target_date, sort_order, template_key, authored_by, created_at, updated_at";

export type CareGoalStatus = "active" | "achieved" | "closed";
export const CARE_GOAL_STATUSES: readonly CareGoalStatus[] = ["active", "achieved", "closed"];

export type CareGoal = {
  id: string;
  patientId: string;
  profileKind: ProfileKind;
  /** In the patient's own words. */
  goalText: string;
  /** A clinic calendar day, YYYY-MM-DD. */
  targetDate: string | null;
  status: CareGoalStatus;
  authoredBy: string;
  authoredByRole: "therapist" | "admin";
  createdAt: string;
  /** The version token a save sends back as `expectedUpdatedAt`. */
  updatedAt: string;
};

export type CareMilestone = MilestoneRecord & {
  id: string;
  goalId: string;
  patientId: string;
  title: string;
  /** The measurable bar, in words the patient reads. */
  criterion: string;
  phase: string | null;
  reachedMeasurementId: string | null;
  templateKey: string | null;
  authoredBy: string;
  createdAt: string;
  /** The version token a save sends back as `expectedUpdatedAt`. */
  updatedAt: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function parseCareGoalRow(row: unknown): CareGoal | null {
  if (!isObject(row) || typeof row.id !== "string" || typeof row.patient_id !== "string") return null;
  if (!isProfileKind(row.profile_kind)) return null;
  const status = (CARE_GOAL_STATUSES as readonly unknown[]).includes(row.status) ? (row.status as CareGoalStatus) : null;
  if (!status || typeof row.goal_text !== "string") return null;
  return {
    id: row.id,
    patientId: row.patient_id,
    profileKind: row.profile_kind,
    goalText: row.goal_text,
    targetDate: str(row.target_date),
    status,
    authoredBy: str(row.authored_by) ?? "",
    authoredByRole: row.authored_by_role === "admin" ? "admin" : "therapist",
    createdAt: str(row.created_at) ?? "",
    updatedAt: str(row.updated_at) ?? "",
  };
}

export function parseCareMilestoneRow(row: unknown): CareMilestone | null {
  if (!isObject(row) || typeof row.id !== "string" || typeof row.goal_id !== "string" || typeof row.patient_id !== "string") {
    return null;
  }
  const status: MilestoneStatus | null =
    row.status === "planned" || row.status === "working" || row.status === "reached" ? row.status : null;
  if (!status || typeof row.title !== "string" || typeof row.criterion !== "string") return null;
  const side = row.linked_side === "left" || row.linked_side === "right" ? row.linked_side : null;
  return {
    id: row.id,
    goalId: row.goal_id,
    patientId: row.patient_id,
    title: row.title,
    criterion: row.criterion,
    phase: str(row.phase),
    status,
    reachedAt: str(row.reached_at),
    reachedMeasurementId: str(row.reached_measurement_id),
    targetDate: str(row.target_date),
    sortOrder: num(row.sort_order) ?? 0,
    linkedMeasureKey: str(row.linked_measure_key),
    linkedVariant: str(row.linked_variant),
    linkedSide: side,
    targetValue: num(row.target_value),
    baselineValue: num(row.baseline_value),
    templateKey: str(row.template_key),
    authoredBy: str(row.authored_by) ?? "",
    createdAt: str(row.created_at) ?? "",
    updatedAt: str(row.updated_at) ?? "",
  };
}

// --- Shared field rules ------------------------------------------------------------------

export const GOAL_TEXT_MAX = 300;
export const MILESTONE_TITLE_MAX = 120;
export const MILESTONE_CRITERION_MAX = 200;
export const MILESTONE_SORT_ORDER_MAX = 1000;
/** The admin's reason for reopening a milestone marked reached by mistake
 *  (care_milestone_events.reason has the same CHECK). */
export const REOPEN_REASON_MIN = 10;
export const REOPEN_REASON_MAX = 500;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function readRequiredText(raw: unknown, label: string, max: number): Result<string> {
  if (typeof raw !== "string") return { ok: false, error: `${label} must be text.` };
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, error: `${label} cannot be blank.` };
  if (text.length > max) return { ok: false, error: `${label} must be ${max} characters or fewer.` };
  return { ok: true, value: text };
}

/** A calendar day as YYYY-MM-DD that exists (no 31 February), or null. */
export function readCalendarDate(raw: unknown, label: string): Result<string | null> {
  if (raw === null || raw === undefined || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false, error: `${label} must be a date (YYYY-MM-DD).` };
  const [y, m, d] = raw.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d || y < 2000 || y > 2100) {
    return { ok: false, error: `${label} is not a real date.` };
  }
  return { ok: true, value: raw };
}

function unknownKeys(raw: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(raw).filter((k) => !allowed.includes(k));
}

// --- The goal --------------------------------------------------------------------------

export type GoalFields = { goalText: string; targetDate: string | null; status: CareGoalStatus };

/** The `goal` of /api/therapist/care-goals/save: every key optional on an
 *  edit; `goalText` required on a create. */
export type GoalInput = Partial<GoalFields>;

const GOAL_KEYS = ["goalText", "targetDate", "status"] as const;

/**
 * A goal as the save route receives it, merged onto the stored goal for an
 * edit (a key left out keeps its value). A new goal is always `active`: it
 * goes to the top of the profile, and "one at a time" is the table's rule.
 */
export function validateGoalFields(raw: unknown, existing: CareGoal | null): Result<GoalFields> {
  if (!isObject(raw)) return { ok: false, error: "Nothing to save." };
  const extra = unknownKeys(raw, GOAL_KEYS);
  if (extra.length) return { ok: false, error: `Unknown field: ${extra.join(", ")}.` };

  let goalText = existing?.goalText ?? null;
  if (raw.goalText !== undefined || !existing) {
    const text = readRequiredText(raw.goalText, "The goal", GOAL_TEXT_MAX);
    if (!text.ok) return text;
    goalText = text.value;
  }

  let targetDate = existing?.targetDate ?? null;
  if (raw.targetDate !== undefined) {
    const date = readCalendarDate(raw.targetDate, "The target date");
    if (!date.ok) return date;
    targetDate = date.value;
  }

  let status: CareGoalStatus = existing?.status ?? "active";
  if (raw.status !== undefined) {
    if (!(CARE_GOAL_STATUSES as readonly unknown[]).includes(raw.status)) {
      return { ok: false, error: "A goal is active, achieved or closed." };
    }
    status = raw.status as CareGoalStatus;
  }
  if (!existing && status !== "active") return { ok: false, error: "A new goal starts active." };

  return { ok: true, value: { goalText: goalText!, targetDate, status } };
}

// --- A milestone -----------------------------------------------------------------------

export type MilestoneFields = {
  title: string;
  criterion: string;
  phase: string | null;
  linkedMeasureKey: string | null;
  linkedVariant: string | null;
  linkedSide: MeasurementSide | null;
  targetValue: number | null;
  baselineValue: number | null;
  targetDate: string | null;
  sortOrder: number;
  templateKey: string | null;
  /** Planned or working. "Reached" is a separate action with its proof. */
  status: "planned" | "working";
};

const MILESTONE_KEYS = [
  "title",
  "criterion",
  "phase",
  "linkedMeasureKey",
  "linkedVariant",
  "linkedSide",
  "targetValue",
  "baselineValue",
  "targetDate",
  "sortOrder",
  "templateKey",
  "status",
] as const;

function present(raw: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(raw, key);
}

/**
 * A milestone's plan as the save route receives it, merged onto the stored
 * milestone for an edit (a key left out keeps its value; null clears an
 * optional one). Checked against the registry for this patient's profile
 * kind: the linked measure is one used on it and switched on, a sided
 * measure names its side and a measure with variants its variant, a
 * target and a baseline are values the measure can hold, and a target has
 * a direction to be met in (a stage or an age reached does not; a joint
 * range needs its baseline to know which way). The phase is one of the
 * kind's own four and a template key one of the kind's own templates.
 */
export function validateMilestoneFields(
  raw: unknown,
  ctx: { profileKind: ProfileKind; existing: CareMilestone | null; enabledLicensed?: ReadonlySet<string> }
): Result<MilestoneFields> {
  if (!isObject(raw)) return { ok: false, error: "Nothing to save." };
  const extra = unknownKeys(raw, MILESTONE_KEYS);
  if (extra.length) return { ok: false, error: `Unknown field: ${extra.join(", ")}.` };
  const ex = ctx.existing;
  const kindLabel = PROFILE_KIND_LABELS[ctx.profileKind].label;

  const textField = (key: "title" | "criterion", label: string, max: number): Result<string> => {
    if (!present(raw, key) && ex) return { ok: true, value: ex[key] };
    return readRequiredText(raw[key], label, max);
  };
  const title = textField("title", "The milestone", MILESTONE_TITLE_MAX);
  if (!title.ok) return title;
  const criterion = textField("criterion", "What counts as reaching it", MILESTONE_CRITERION_MAX);
  if (!criterion.ok) return criterion;

  let phase = ex?.phase ?? null;
  if (present(raw, "phase")) {
    if (raw.phase === null || raw.phase === "") phase = null;
    else if (typeof raw.phase === "string" && PHASES_BY_PROFILE_KIND[ctx.profileKind].includes(raw.phase)) phase = raw.phase;
    else return { ok: false, error: `That is not one of the ${kindLabel} phases.` };
  }

  // The measure link moves as one: changing the measure resets a variant,
  // side, target and baseline that belonged to the old one unless they are
  // sent again.
  const measureChanged = present(raw, "linkedMeasureKey") && (raw.linkedMeasureKey ?? null) !== (ex?.linkedMeasureKey ?? null);
  const carried = <K extends "linkedVariant" | "linkedSide" | "targetValue" | "baselineValue">(key: K) =>
    present(raw, key) ? raw[key] : measureChanged ? null : (ex?.[key] ?? null);

  const linkedMeasureKey = present(raw, "linkedMeasureKey") ? raw.linkedMeasureKey ?? null : ex?.linkedMeasureKey ?? null;
  if (linkedMeasureKey !== null && typeof linkedMeasureKey !== "string") {
    return { ok: false, error: "The linked measure must be a measure key." };
  }
  const rawVariant = carried("linkedVariant");
  const rawSide = carried("linkedSide");
  const rawTarget = carried("targetValue");
  const rawBaseline = carried("baselineValue");

  let linkedVariant: string | null = null;
  let linkedSide: MeasurementSide | null = null;
  let targetValue: number | null = null;
  let baselineValue: number | null = null;

  if (linkedMeasureKey === null) {
    if (rawVariant !== null || rawSide !== null || rawTarget !== null || rawBaseline !== null) {
      return { ok: false, error: "A variant, side, target or baseline needs a linked measure." };
    }
  } else {
    const m = outcomeMeasure(linkedMeasureKey);
    if (!m) return { ok: false, error: "Unknown measure." };
    if (!m.profileKinds.includes(ctx.profileKind)) {
      return { ok: false, error: `${m.label} is not used on a ${kindLabel} profile.` };
    }
    if (!isMeasureEnabled(m.key, ctx.enabledLicensed)) {
      return { ok: false, error: `${m.label} is switched off until the clinic confirms its licence.` };
    }
    if (m.variants) {
      if (typeof rawVariant !== "string" || !m.variants.some((v) => v.key === rawVariant)) {
        return { ok: false, error: `${m.label}: say which one the milestone is measured on.` };
      }
      linkedVariant = rawVariant;
    } else if (rawVariant !== null) {
      return { ok: false, error: `${m.label} has no variants.` };
    }
    if (m.sided) {
      if (rawSide !== "left" && rawSide !== "right") return { ok: false, error: `${m.label}: say which side.` };
      linkedSide = rawSide;
    } else if (rawSide !== null) {
      return { ok: false, error: `${m.label} is not recorded per side.` };
    }
    if (rawTarget !== null) {
      const t = validateMeasurementValue(m.key, rawTarget);
      if (!t.ok) return { ok: false, error: `Target: ${t.error}` };
      targetValue = t.value;
    }
    if (rawBaseline !== null) {
      const b = validateMeasurementValue(m.key, rawBaseline);
      if (!b.ok) return { ok: false, error: `Starting point: ${b.error}` };
      baselineValue = b.value;
    }
    if (targetValue !== null && criterionDirection(m.key, targetValue, baselineValue) === null) {
      return {
        ok: false,
        error:
          m.better === "toward_normal"
            ? `${m.label}: give the starting point too, so the milestone knows which way the target lies.`
            : `${m.label} has no direction to meet a target in; describe the milestone in words instead.`,
      };
    }
  }

  let targetDate = ex?.targetDate ?? null;
  if (present(raw, "targetDate")) {
    const d = readCalendarDate(raw.targetDate, "The target date");
    if (!d.ok) return d;
    targetDate = d.value;
  }

  let sortOrder = ex?.sortOrder ?? 0;
  if (present(raw, "sortOrder")) {
    const s = raw.sortOrder;
    if (typeof s !== "number" || !Number.isInteger(s) || s < 0 || s > MILESTONE_SORT_ORDER_MAX) {
      return { ok: false, error: `The order must be a whole number from 0 to ${MILESTONE_SORT_ORDER_MAX}.` };
    }
    sortOrder = s;
  }

  let templateKey = ex?.templateKey ?? null;
  if (present(raw, "templateKey")) {
    if (raw.templateKey === null) templateKey = null;
    else {
      const t = MILESTONE_TEMPLATES.find((x) => x.key === raw.templateKey);
      if (!t || t.profileKind !== ctx.profileKind) return { ok: false, error: `That is not a ${kindLabel} starter milestone.` };
      templateKey = t.key;
    }
  }

  let status: "planned" | "working" = ex && ex.status !== "reached" ? ex.status : "planned";
  if (present(raw, "status")) {
    if (raw.status === "reached") {
      return { ok: false, error: "Mark a milestone reached with its own action, so the proof travels with it." };
    }
    if (raw.status !== "planned" && raw.status !== "working") return { ok: false, error: "A milestone is planned or being worked on." };
    status = raw.status;
  }

  return {
    ok: true,
    value: {
      title: title.value,
      criterion: criterion.value,
      phase,
      linkedMeasureKey,
      linkedVariant,
      linkedSide,
      targetValue,
      baselineValue,
      targetDate,
      sortOrder,
      templateKey,
      status,
    },
  };
}

/** The `milestone` of /api/therapist/care-milestones/save: every key
 *  optional on an update (null clears an optional one); `title` and
 *  `criterion` required on a create. `status` is planned or working only. */
export type MilestoneInput = Partial<MilestoneFields>;

/** The columns a MilestoneFields writes. */
export function milestoneFieldsToRow(fields: MilestoneFields): Record<string, unknown> {
  return {
    title: fields.title,
    criterion: fields.criterion,
    phase: fields.phase,
    linked_measure_key: fields.linkedMeasureKey,
    linked_variant: fields.linkedVariant,
    linked_side: fields.linkedSide,
    target_value: fields.targetValue,
    baseline_value: fields.baselineValue,
    target_date: fields.targetDate,
    sort_order: fields.sortOrder,
    template_key: fields.templateKey,
    status: fields.status,
  };
}

/**
 * Whether a stored measurement proves a milestone: exactly the linked
 * measure, variant and side, and a value that meets the target in the
 * milestone's direction. The route's check before it writes reached_at --
 * the same maths deriveMilestone() uses to offer the button. A milestone
 * with no measurable target is reached on the physiotherapist's judgement
 * and takes no proof.
 */
export function measurementProvesMilestone(
  milestone: Pick<MilestoneRecord, "linkedMeasureKey" | "linkedVariant" | "linkedSide" | "targetValue" | "baselineValue">,
  measurement: Pick<MeasurementPoint, "measureKey" | "variant" | "side" | "value">
): { ok: true } | { ok: false; error: string } {
  if (!milestone.linkedMeasureKey || milestone.targetValue === null) {
    return { ok: false, error: "This milestone has no measurable target to prove." };
  }
  if (
    measurement.measureKey !== milestone.linkedMeasureKey ||
    (measurement.variant ?? null) !== (milestone.linkedVariant ?? null) ||
    (measurement.side ?? null) !== (milestone.linkedSide ?? null)
  ) {
    return { ok: false, error: "That measurement is not of the measure this milestone is linked to." };
  }
  const direction = criterionDirection(milestone.linkedMeasureKey, milestone.targetValue, milestone.baselineValue);
  if (!direction) return { ok: false, error: "This milestone's target has no direction to meet." };
  const met = direction === "higher" ? measurement.value >= milestone.targetValue : measurement.value <= milestone.targetValue;
  if (!met) return { ok: false, error: "That measurement does not meet the milestone's target." };
  return { ok: true };
}

// --- What the profile draws ----------------------------------------------------------------

export type MilestoneView = {
  milestone: CareMilestone;
  derived: DerivedMilestone;
  overdue: boolean;
};

/**
 * The milestone list as the profile reads it: each milestone with what the
 * readings say of it (deriveMilestone -- progress, "criterion met", the
 * proving reading the Mark-reached button links), whether it is overdue on
 * the clinic's calendar, in the mockups' order (sortMilestones). `nowMs` is
 * required, never a Date.now() default, so the debug clock reaches it.
 */
export function shapeMilestones(
  milestones: readonly CareMilestone[],
  points: readonly MeasurementPoint[],
  nowMs: number
): MilestoneView[] {
  const readings = points.map(toMeasurementReading);
  return sortMilestones(milestones).map((milestone) => ({
    milestone,
    derived: deriveMilestone(milestone, readings),
    overdue: isMilestoneOverdue(milestone, nowMs),
  }));
}
