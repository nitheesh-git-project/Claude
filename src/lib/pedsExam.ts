// The paediatric examination: what a physiotherapist records about a child's
// movement milestones, which values each finding may take, and everything
// read back out of it -- validation, the tally, the change since the
// previous exam and the lines a PDF prints.
//
// Dependency-free on purpose (the "business maths lives in src/lib" rule):
// both submit routes validate with exactly the tables a dialog renders its
// controls from, so a value the screen cannot offer is a value the server
// refuses, and the tests reason about all of it without a browser.
//
// The paediatric counterpart of the Pain Map (orthopaedic) and of the
// neurological exam (neuroExam.ts), and like the neurological one a NEW
// table -- peds_assessments -- never a `specialty` column on another layer
// (docs/rules/clinical.md). One append-only row per examination, so a
// re-examination is a new row and the profile can say what changed.
//
// What it holds, and what it deliberately does not:
//
//   - The six WHO Motor Development Study milestones (the windows and the
//     "counts as reached when" definitions live ONCE, in outcomeMeasures.ts
//     `WHO_MOTOR_MILESTONES`, and are read from there). Each milestone is
//     `not_yet` / `emerging` / `achieved`, with the date it was first seen
//     and whether the physiotherapist SAW it (in a session, or on a parent's
//     video) or the family REPORTED it -- the handbook's "a parent's report
//     alone is recorded as parent reports".
//   - The GMFCS level (I-V), a classification for a child with cerebral
//     palsy -- context, never a progress score.
//   - An orthoses and equipment note, and the free-text note.
//
//   - NOT the standing time or the independent-steps count. Those are timed
//     tests with three tries and the best kept, and they already have one
//     owner: `outcome_measurements` (peds_standing_seconds,
//     peds_independent_steps in the registry, recorded through Record a test
//     with its three-try timer, linked from the starter milestones). Storing
//     them here as well would draw one line from two tables, which is a
//     "change" that is only a change of table. The validator refuses them by
//     name and says where they go.
//   - The registry's `who_motor_milestone` and `gmfcs` now point HERE
//     (`source: "peds_exam"`), so the measurement route refuses them: each
//     measure has exactly one owner.
//
// Representation rules, the neurological exam's:
//
//   1. **"Not assessed" is the absence of a key, never a value.** A
//      milestone nobody looked at is simply not in `milestones`. "Not yet"
//      is a finding -- the physiotherapist looked and the skill is not
//      there -- and the two are never the same thing.
//   2. **Every value is one of its list's own strings**; the route refuses
//      anything else rather than rounding it into shape.
//   3. **Where a milestone sits against its window is derived, never
//      stored** (pedsMilestoneWindows.ts), from the date first seen and the
//      child's corrected age (pedsAge.ts).
//
// Every threshold this layer leans on -- the WHO windows, corrected age to
// 24 months, the 37-week line, the 18-month walking prompt -- is TO BE
// VERIFIED BY A SENIOR PHYSIOTHERAPIST against its source before a patient
// reads it.

import { WHO_MOTOR_MILESTONES } from "@/lib/outcomeMeasures";
import { formatClinicDate } from "@/lib/formatDateTime";

export const PEDS_EXAM_VERSION = 1;

// --- The lists ----------------------------------------------------------------

export const PEDS_MILESTONE_KEYS = [
  "sitting_without_support",
  "hands_knees_crawling",
  "standing_with_help",
  "walking_with_help",
  "standing_alone",
  "walking_alone",
] as const;
export type PedsMilestoneKey = (typeof PEDS_MILESTONE_KEYS)[number];

// One table of windows for the whole app: if the registry's list and this
// one ever disagree, the module refuses to load rather than chart a
// milestone against a window nobody can find.
{
  const registry = WHO_MOTOR_MILESTONES.map((m) => m.key);
  if (registry.length !== PEDS_MILESTONE_KEYS.length || registry.some((k, i) => k !== PEDS_MILESTONE_KEYS[i])) {
    throw new Error("pedsExam: PEDS_MILESTONE_KEYS must match WHO_MOTOR_MILESTONES in outcomeMeasures.ts, in order");
  }
}

export type PedsMilestone = {
  key: PedsMilestoneKey;
  label: string;
  /** The WHO 1st to 99th percentile window, in months. */
  windowMonths: readonly [number, number];
  /** What counts as reached -- shown on screen beside the control. */
  reachedWhen: string;
};

export const PEDS_MILESTONES: readonly PedsMilestone[] = WHO_MOTOR_MILESTONES.map((m) => ({
  key: m.key as PedsMilestoneKey,
  label: m.label,
  windowMonths: m.windowMonths,
  reachedWhen: m.reachedWhen,
}));

const MILESTONE_BY_KEY = new Map(PEDS_MILESTONES.map((m) => [m.key, m]));

export function pedsMilestone(key: string): PedsMilestone | null {
  return MILESTONE_BY_KEY.get(key as PedsMilestoneKey) ?? null;
}

export type PedsMilestoneStatus = "not_yet" | "emerging" | "achieved";

export const PEDS_MILESTONE_STATUSES: readonly {
  key: PedsMilestoneStatus;
  label: string;
  /** How far along: the ordering behind "better" and "worse". */
  rank: number;
  meaning: string;
}[] = [
  { key: "not_yet", label: "Not yet", rank: 0, meaning: "Looked for, and the skill is not there yet" },
  { key: "emerging", label: "Emerging", rank: 1, meaning: "Starting to come: some of the time, or not yet to the full definition" },
  { key: "achieved", label: "Achieved", rank: 2, meaning: "Meets the definition on screen" },
];

const STATUS_BY_KEY = new Map(PEDS_MILESTONE_STATUSES.map((s) => [s.key, s]));

export function isPedsMilestoneStatus(value: unknown): value is PedsMilestoneStatus {
  return typeof value === "string" && STATUS_BY_KEY.has(value as PedsMilestoneStatus);
}

export type PedsObservationSource = "seen" | "reported";

export const PEDS_OBSERVATION_SOURCES: readonly { key: PedsObservationSource; label: string; patientLabel: string }[] = [
  { key: "seen", label: "Seen by the physiotherapist", patientLabel: "Seen in a session" },
  { key: "reported", label: "Parent reports", patientLabel: "You told us" },
];

const SOURCE_BY_KEY = new Map(PEDS_OBSERVATION_SOURCES.map((s) => [s.key, s]));

export function isPedsObservationSource(value: unknown): value is PedsObservationSource {
  return typeof value === "string" && SOURCE_BY_KEY.has(value as PedsObservationSource);
}

/** GMFCS levels I to V. It classifies usual mobility for a child with
 *  cerebral palsy; it is not a progress score, so a change is "changed",
 *  never "better". Free with attribution (outcomeMeasures.ts). */
export const GMFCS_LEVELS: readonly { value: 1 | 2 | 3 | 4 | 5; label: string; meaning: string }[] = [
  { value: 1, label: "Level I", meaning: "Walks without limitations" },
  { value: 2, label: "Level II", meaning: "Walks with limitations" },
  { value: 3, label: "Level III", meaning: "Walks using a hand-held mobility device" },
  { value: 4, label: "Level IV", meaning: "Self-mobility with limitations; may use powered mobility" },
  { value: 5, label: "Level V", meaning: "Transported in a manual wheelchair" },
];
export type GmfcsLevel = (typeof GMFCS_LEVELS)[number]["value"];

export function gmfcsLabel(level: number | undefined | null): string | null {
  return GMFCS_LEVELS.find((g) => g.value === level)?.label ?? null;
}

export const PEDS_EQUIPMENT_MAX = 500;
export const PEDS_NOTES_MAX = 4000;

/** Fields a client might send for the two timed counts. They belong to
 *  outcome_measurements; the validator names where they go. */
const TIMED_COUNT_FIELDS = new Set([
  "standingSeconds",
  "standingAloneSeconds",
  "independentSteps",
  "independentStepsCount",
  "steps",
]);

// --- The stored shape ---------------------------------------------------------

export type PedsMilestoneFinding = {
  status: PedsMilestoneStatus;
  /** `YYYY-MM-DD`, the day the skill was first seen (or, for a parent's
   *  report, the day they say it started). Required for `achieved`,
   *  optional for `emerging`, never on `not_yet`. */
  firstSeenOn?: string;
  /** Required for `emerging` and `achieved`: who saw it. */
  source?: PedsObservationSource;
  /** True when the date is the family's rough recollection ("around
   *  March"). Only for a parent's report with a date -- a date the
   *  physiotherapist saw is exact -- and absent (never `false`) otherwise,
   *  so an exact date and an old row read the same. */
  approximate?: boolean;
};

export type PedsFindings = {
  milestones: Partial<Record<PedsMilestoneKey, PedsMilestoneFinding>>;
  gmfcsLevel?: GmfcsLevel;
  equipment?: string;
  notes?: string;
};

export function emptyPedsFindings(): PedsFindings {
  return { milestones: {} };
}

// --- Validation ---------------------------------------------------------------

export type PedsValidationContext = {
  /** The clinic's today, `YYYY-MM-DD` (pedsAge.ts `pedsTodayIso`). A date
   *  first seen after it is refused. */
  todayIso: string;
  /** The child's date of birth when on file; a date first seen before it
   *  is refused. Null skips that one check (nothing to compare against). */
  birthDate?: string | null;
};

export type PedsValidationResult = { ok: true; findings: PedsFindings } | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date in `YYYY-MM-DD`, or null. "2026-02-30" is not one. */
export function parseIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = ISO_DATE.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return value.trim();
}

function readText(raw: unknown, max: number, label: string): { value?: string; error?: string } {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "string") return { error: `${label} must be text.` };
  const text = raw.trim();
  if (text.length > max) return { error: `${label} is too long - keep it under ${max} characters.` };
  return text ? { value: text } : {};
}

/**
 * The one judgement on what a submission may contain, used by both routes.
 * Refuses rather than repairs: an unknown milestone, a status or source the
 * lists do not offer, a date that cannot be true, or a timed count that
 * belongs to Record a test. The single normalisation is dropping what was
 * not assessed (a milestone with no status, an empty note), which is how
 * "not assessed" is stored.
 */
export function validatePedsFindings(raw: unknown, ctx: PedsValidationContext): PedsValidationResult {
  if (!isPlainObject(raw)) return { ok: false, error: "The examination is missing or not readable." };
  const timed = Object.keys(raw).find((k) => TIMED_COUNT_FIELDS.has(k));
  if (timed) {
    return {
      ok: false,
      error:
        "Standing time and independent steps are recorded with Record a test (three tries, the best kept), not in the examination.",
    };
  }
  const extra = Object.keys(raw).filter((k) => !["milestones", "gmfcsLevel", "equipment", "notes"].includes(k));
  if (extra.length > 0) return { ok: false, error: "The examination contains fields this chart does not have." };

  const findings = emptyPedsFindings();
  const today = parseIsoDate(ctx.todayIso);
  const birth = ctx.birthDate ? parseIsoDate(ctx.birthDate) : null;

  const milestones = raw.milestones ?? {};
  if (!isPlainObject(milestones)) return { ok: false, error: "The milestones are not readable." };
  for (const [key, value] of Object.entries(milestones)) {
    const milestone = pedsMilestone(key);
    if (!milestone) return { ok: false, error: "The examination contains a milestone this chart does not have." };
    // Not assessed: nothing sent, or an empty choice.
    if (value === undefined || value === null) continue;
    if (!isPlainObject(value)) return { ok: false, error: `${milestone.label}: the finding is not readable.` };
    if (Object.keys(value).some((k) => !["status", "firstSeenOn", "source", "approximate"].includes(k))) {
      return {
        ok: false,
        error: `${milestone.label}: only a status, the date first seen, whether it is approximate and who saw it can be recorded.`,
      };
    }
    const { status, firstSeenOn, source, approximate } = value;
    const blank = (v: unknown) => v === undefined || v === null || v === "";
    if (blank(status)) {
      if (blank(firstSeenOn) && blank(source)) continue;
      return { ok: false, error: `${milestone.label}: choose Not yet, Emerging or Achieved, or leave it not assessed.` };
    }
    if (!isPedsMilestoneStatus(status)) {
      return { ok: false, error: `${milestone.label}: "${String(status)}" is not one of the statuses this chart offers.` };
    }
    const out: PedsMilestoneFinding = { status };

    if (!blank(source)) {
      if (!isPedsObservationSource(source)) {
        return { ok: false, error: `${milestone.label}: say whether you saw it or the family reported it.` };
      }
      out.source = source;
    } else if (status !== "not_yet") {
      return { ok: false, error: `${milestone.label}: say whether you saw it or the family reported it.` };
    }

    if (!blank(firstSeenOn)) {
      if (status === "not_yet") {
        return { ok: false, error: `${milestone.label}: a skill not there yet has no date first seen.` };
      }
      const date = parseIsoDate(firstSeenOn);
      if (!date) return { ok: false, error: `${milestone.label}: the date first seen is not a real date.` };
      if (today && date > today) return { ok: false, error: `${milestone.label}: the date first seen is in the future.` };
      if (birth && date < birth) {
        return { ok: false, error: `${milestone.label}: the date first seen is before the child's date of birth.` };
      }
      out.firstSeenOn = date;
    } else if (status === "achieved") {
      return {
        ok: false,
        error: `${milestone.label}: add the date it was first seen (for a parent's report, roughly when it started).`,
      };
    }

    // A rough date: the family's recollection only. A date the
    // physiotherapist saw is exact, and "about" with no date is nothing.
    if (approximate !== undefined && approximate !== null && approximate !== false) {
      if (approximate !== true) {
        return { ok: false, error: `${milestone.label}: whether the date is approximate must be yes or no.` };
      }
      if (out.source !== "reported") {
        return {
          ok: false,
          error: `${milestone.label}: only a date the family reports can be approximate - a date you saw is exact.`,
        };
      }
      if (!out.firstSeenOn) {
        return { ok: false, error: `${milestone.label}: add the rough date, or leave it out - "about" needs a date.` };
      }
      out.approximate = true;
    }
    findings.milestones[milestone.key] = out;
  }

  const gmfcs = raw.gmfcsLevel;
  if (gmfcs !== undefined && gmfcs !== null && gmfcs !== "") {
    if (typeof gmfcs !== "number" || !GMFCS_LEVELS.some((g) => g.value === gmfcs)) {
      return { ok: false, error: "The GMFCS level must be one of Level I to Level V." };
    }
    findings.gmfcsLevel = gmfcs as GmfcsLevel;
  }

  const equipment = readText(raw.equipment, PEDS_EQUIPMENT_MAX, "The orthoses and equipment note");
  if (equipment.error) return { ok: false, error: equipment.error };
  if (equipment.value) findings.equipment = equipment.value;

  const notes = readText(raw.notes, PEDS_NOTES_MAX, "The clinical notes");
  if (notes.error) return { ok: false, error: notes.error };
  if (notes.value) findings.notes = notes.value;

  if (isPedsExamEmpty(findings)) {
    return { ok: false, error: "Record at least one finding before saving the examination." };
  }
  return { ok: true, findings };
}

export function isPedsExamEmpty(f: PedsFindings): boolean {
  return Object.keys(f.milestones).length === 0 && f.gmfcsLevel === undefined && !f.equipment && !f.notes;
}

/** A stored row's findings for display. Stored rows were validated on the
 *  way in, so this only guards against a row from a later schema version or
 *  a hand edit: anything unreadable renders as an empty exam rather than
 *  taking the profile down. The date checks are the write's business, so a
 *  stored row is read against no today and no birth date. */
export function readStoredPedsFindings(raw: unknown): PedsFindings {
  const result = validatePedsFindings(raw, { todayIso: "9999-12-31", birthDate: null });
  return result.ok ? result.findings : emptyPedsFindings();
}

// --- Reading it back ----------------------------------------------------------

export type PedsExamTally = {
  achieved: number;
  emerging: number;
  notYet: number;
  notAssessed: number;
  /** Achieved or emerging on the family's word alone. */
  reportedOnly: number;
};

export function pedsExamTally(f: PedsFindings): PedsExamTally {
  const tally: PedsExamTally = { achieved: 0, emerging: 0, notYet: 0, notAssessed: 0, reportedOnly: 0 };
  for (const m of PEDS_MILESTONES) {
    const finding = f.milestones[m.key];
    if (!finding) {
      tally.notAssessed += 1;
      continue;
    }
    if (finding.status === "achieved") tally.achieved += 1;
    else if (finding.status === "emerging") tally.emerging += 1;
    else tally.notYet += 1;
    if (finding.status !== "not_yet" && finding.source === "reported") tally.reportedOnly += 1;
  }
  return tally;
}

export type PedsChangeDirection = "better" | "worse" | "changed";

export type PedsChange = {
  /** `milestone.<key>`, `milestone.<key>.source`, `gmfcs` or `equipment`. */
  id: string;
  label: string;
  from: string;
  to: string;
  direction: PedsChangeDirection;
};

const statusLabel = (s: PedsMilestoneStatus) => STATUS_BY_KEY.get(s)?.label ?? s;
const sourceLabel = (s: PedsObservationSource | undefined) => (s ? (SOURCE_BY_KEY.get(s)?.label ?? s) : "Not recorded");

/**
 * What moved between two examinations, for every finding recorded in BOTH.
 * A milestone assessed only once is not a change -- "not assessed last
 * time" is not "came on since" -- so a finding new to this exam is left out
 * rather than reported against a blank. A milestone moving along not yet ->
 * emerging -> achieved is "better", back is "worse"; the same status with a
 * parent's report now seen in a session is "changed" (confirmed, not
 * progressed). GMFCS classifies, so a different level is "changed", never
 * better or worse.
 */
export function comparePedsExams(current: PedsFindings, previous: PedsFindings): PedsChange[] {
  const out: PedsChange[] = [];
  for (const m of PEDS_MILESTONES) {
    const now = current.milestones[m.key];
    const before = previous.milestones[m.key];
    if (!now || !before) continue;
    if (now.status !== before.status) {
      const a = STATUS_BY_KEY.get(before.status)?.rank ?? 0;
      const b = STATUS_BY_KEY.get(now.status)?.rank ?? 0;
      out.push({
        id: `milestone.${m.key}`,
        label: m.label,
        from: statusLabel(before.status),
        to: statusLabel(now.status),
        direction: b > a ? "better" : "worse",
      });
      continue;
    }
    if (now.status !== "not_yet" && now.source && before.source && now.source !== before.source) {
      out.push({
        id: `milestone.${m.key}.source`,
        label: `${m.label}: who saw it`,
        from: sourceLabel(before.source),
        to: sourceLabel(now.source),
        direction: "changed",
      });
    }
  }
  if (current.gmfcsLevel !== undefined && previous.gmfcsLevel !== undefined && current.gmfcsLevel !== previous.gmfcsLevel) {
    out.push({
      id: "gmfcs",
      label: "GMFCS level",
      from: gmfcsLabel(previous.gmfcsLevel) ?? String(previous.gmfcsLevel),
      to: gmfcsLabel(current.gmfcsLevel) ?? String(current.gmfcsLevel),
      direction: "changed",
    });
  }
  if (current.equipment && previous.equipment && current.equipment !== previous.equipment) {
    out.push({ id: "equipment", label: "Orthoses and equipment", from: previous.equipment, to: current.equipment, direction: "changed" });
  }
  return out;
}

/**
 * The exam as plain lines for the PDF export -- the module that prints never
 * learns a milestone. `achievedAgeLabel` (from pedsMilestoneWindows.ts) adds
 * the age the skill came at, when the caller can work it out. Milestones not
 * assessed are listed by name: absence on paper reads as "fine".
 */
export function describePedsExamForText(
  findings: PedsFindings,
  opts: { achievedAgeLabel?: (key: PedsMilestoneKey) => string | null } = {}
): string[] {
  const lines: string[] = [];
  const assessed = PEDS_MILESTONES.filter((m) => findings.milestones[m.key]);
  const notAssessed = PEDS_MILESTONES.filter((m) => !findings.milestones[m.key]);
  if (assessed.length > 0) {
    lines.push("Movement milestones (WHO):");
    for (const m of assessed) {
      const f = findings.milestones[m.key]!;
      const parts: string[] = [statusLabel(f.status)];
      if (f.firstSeenOn) parts.push(`first seen ${f.approximate ? "about " : ""}${formatClinicDate(f.firstSeenOn)}`);
      const age = f.status === "achieved" ? (opts.achievedAgeLabel?.(m.key) ?? null) : null;
      if (age) parts.push(`at ${age}`);
      if (f.status !== "not_yet" && f.source) parts.push(f.source === "seen" ? "seen by the physiotherapist" : "parent reports");
      lines.push(`  ${m.label}: ${parts.join(", ")}`);
    }
  }
  if (notAssessed.length > 0) {
    lines.push(`Not assessed: ${notAssessed.map((m) => m.label).join(", ")}`);
  }
  if (findings.gmfcsLevel !== undefined) {
    const level = GMFCS_LEVELS.find((g) => g.value === findings.gmfcsLevel);
    lines.push(`GMFCS: ${level ? `${level.label} (${level.meaning.toLowerCase()})` : findings.gmfcsLevel}`);
  }
  if (findings.equipment) lines.push(`Orthoses and equipment: ${findings.equipment}`);
  if (findings.notes) lines.push(`Notes: ${findings.notes}`);
  return lines;
}

// --- Rows as read from the table ----------------------------------------------

export const PEDS_ASSESSMENT_SELECT = "id, created_at, submitted_by, submitted_by_role, schema_version, findings";

export type PedsAssessmentRow = {
  id: string;
  created_at: string;
  submitted_by?: string | null;
  submitted_by_role: string;
  schema_version: number | null;
  findings: unknown;
};

export type ParsedPedsAssessment = {
  id: string;
  createdAt: string;
  submittedBy: string | null;
  submittedByRole: string;
  findings: PedsFindings;
};

/** Newest first, findings parsed. */
export function parsePedsAssessments(rows: readonly PedsAssessmentRow[]): ParsedPedsAssessment[] {
  return [...rows]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      submittedBy: row.submitted_by ?? null,
      submittedByRole: row.submitted_by_role,
      findings: readStoredPedsFindings(row.findings),
    }));
}
