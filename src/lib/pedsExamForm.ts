// The paediatric examination dialog's form, as plain data: the state the
// controls edit, the raw findings it posts, and the words for every way the
// server can refuse. Kept out of the component so the dialog's rules are
// tested without rendering -- and so the controls and the validator cannot
// drift: the form only ever builds what `validatePedsFindings` accepts, and
// the dialog renders its choices from the same tables (PEDS_MILESTONES,
// PEDS_MILESTONE_STATUSES, PEDS_OBSERVATION_SOURCES, GMFCS_LEVELS).

import {
  PEDS_MILESTONE_KEYS,
  type ParsedPedsAssessment,
  type PedsMilestoneKey,
  type PedsMilestoneStatus,
  type PedsObservationSource,
} from "@/lib/pedsExam";

export type MilestoneFormState = {
  /** "" is not assessed. */
  status: PedsMilestoneStatus | "";
  source: PedsObservationSource | "";
  /** `YYYY-MM-DD` or "". */
  date: string;
  approximate: boolean;
};

export type PedsFormState = {
  milestones: Record<PedsMilestoneKey, MilestoneFormState>;
  /** "" is not recorded. */
  gmfcs: "" | "1" | "2" | "3" | "4" | "5";
  equipment: string;
  notes: string;
};

export const EMPTY_MILESTONE: MilestoneFormState = {
  status: "",
  source: "",
  date: "",
  approximate: false,
};

export function emptyPedsForm(): PedsFormState {
  const milestones = {} as Record<PedsMilestoneKey, MilestoneFormState>;
  for (const k of PEDS_MILESTONE_KEYS) milestones[k] = { ...EMPTY_MILESTONE };
  return { milestones, gmfcs: "", equipment: "", notes: "" };
}

/** What a status change leaves behind: not yet has no source or date, and a
 *  rough date only means something for a parent's report that has a date. */
export function tidyMilestone(m: MilestoneFormState): MilestoneFormState {
  if (m.status === "") return { ...EMPTY_MILESTONE };
  if (m.status === "not_yet")
    return { status: "not_yet", source: "", date: "", approximate: false };
  const approximate = m.approximate && m.source === "reported" && m.date !== "";
  return { ...m, approximate };
}

export function setMilestone(
  form: PedsFormState,
  key: PedsMilestoneKey,
  change: Partial<MilestoneFormState>,
): PedsFormState {
  return {
    ...form,
    milestones: {
      ...form.milestones,
      [key]: tidyMilestone({ ...form.milestones[key], ...change }),
    },
  };
}

/** Anything typed or chosen at all: what "Close without saving?" guards. */
export function isPedsFormDirty(form: PedsFormState): boolean {
  return (
    PEDS_MILESTONE_KEYS.some((k) => form.milestones[k].status !== "") ||
    form.gmfcs !== "" ||
    form.equipment.trim() !== "" ||
    form.notes.trim() !== ""
  );
}

export function assessedCount(form: PedsFormState): number {
  return PEDS_MILESTONE_KEYS.filter((k) => form.milestones[k].status !== "")
    .length;
}

/** The raw findings to hand `validatePedsFindings` and then the route. A
 *  milestone left on "not assessed" is simply absent. */
export function pedsFormToRaw(form: PedsFormState): Record<string, unknown> {
  const milestones: Record<string, unknown> = {};
  for (const k of PEDS_MILESTONE_KEYS) {
    const m = tidyMilestone(form.milestones[k]);
    if (m.status === "") continue;
    const finding: Record<string, unknown> = { status: m.status };
    if (m.status !== "not_yet") {
      if (m.source) finding.source = m.source;
      if (m.date) finding.firstSeenOn = m.date;
      if (m.approximate) finding.approximate = true;
    }
    milestones[k] = finding;
  }
  const raw: Record<string, unknown> = { milestones };
  if (form.gmfcs) raw.gmfcsLevel = Number(form.gmfcs);
  if (form.equipment.trim()) raw.equipment = form.equipment;
  if (form.notes.trim()) raw.notes = form.notes;
  return raw;
}

/** "Last time" for one milestone, in the clinician's words, or null. */
export function lastTimeLine(
  previous: ParsedPedsAssessment | null,
  key: PedsMilestoneKey,
): string | null {
  const f = previous?.findings.milestones[key];
  if (!f) return null;
  const status =
    f.status === "not_yet"
      ? "Not yet"
      : f.status === "emerging"
        ? "Emerging"
        : "Achieved";
  const who =
    f.status === "not_yet" || !f.source
      ? ""
      : f.source === "seen"
        ? ", seen"
        : ", parent reports";
  return `${status}${who}`;
}

// --- Refusals -------------------------------------------------------------------

/**
 * One sentence for whatever the submit route answered. The routes' own
 * sentences are kept when they carry the reason (a validation 400, a 403
 * saying the account is not active, a 409 saying no session has started);
 * the codes and statuses below get the clinician's wording where the route's
 * would be a bare word or nothing, and anything unrecognised gets a generic
 * line rather than a status number.
 */
export function pedsExamErrorMessage(
  status: number,
  body: { error?: unknown; code?: unknown } | null | undefined,
): string {
  const error =
    typeof body?.error === "string" && body.error.trim()
      ? body.error.trim()
      : "";
  const code = typeof body?.code === "string" ? body.code : "";
  if (code === "not_paediatric") {
    return "This patient is not recorded as a paediatric patient, so this examination cannot be saved. Check the condition type on their record.";
  }
  if (status === 401)
    return "Your session has ended. Sign in again, then record the examination.";
  if (status === 403)
    return error && error !== "Forbidden"
      ? error
      : "You can only record an examination for a patient you are assigned to.";
  if (status === 409)
    return (
      error ||
      "An examination can be recorded once a session with this patient has started."
    );
  if (status === 429)
    return "That is too many saves in a short time. Wait a minute, then try again.";
  if (status === 503)
    return (
      error ||
      "We couldn't reach the record just now, so nothing was saved. Please try again."
    );
  if (status === 400 && error) return error;
  if (error) return error;
  return "Could not save this examination. Please try again.";
}
