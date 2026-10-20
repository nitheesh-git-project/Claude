// Short, plain names for the Health Profile's tabs, key-number tiles and
// table rows. The full clinical name ("How far a joint moves - Knee bend
// (active) (right)") stays in the detail text and the accessible label
// (progressView.seriesName); nothing here renames a registry key or a stored
// value, it only decides what a crowded row calls a line.

import { JOINT_MOVEMENTS } from "@/lib/outcomeMeasures";
import type { MeasureSeries } from "@/lib/outcomeSeries";

export type LabelVoice = "patient" | "clinician";

export type LabelLine = Pick<
  MeasureSeries,
  "measureKey" | "variant" | "side" | "medicationState" | "label" | "plainName" | "variantLabel"
>;

/** Short names by measure, per voice, for a measure with no variants. */
const SHORT_MEASURE: Record<string, { patient: string; clinician: string }> = {
  pain_nprs: { patient: "Pain score", clinician: "Pain score" },
  lefs: { patient: "Everyday tasks (legs)", clinician: "LEFS" },
};

/** Short names for the strength-compared-with-the-other-side variants. */
const SHORT_STRENGTH: Record<string, string> = {
  quadriceps: "Thigh strength",
  hamstrings: "Back-of-thigh strength",
  hip_abductors: "Hip strength",
  calf: "Calf strength",
  shoulder_external_rotators: "Shoulder strength",
  grip: "Grip strength",
};

const MODE_WORDS = {
  patient: { active: "on your own", passive: "moved by physio" },
  clinician: { active: "active", passive: "passive" },
} as const;

type JointMode = "active" | "passive";

function jointParts(line: Pick<LabelLine, "measureKey" | "variant">): { movement: string; label: string; mode: JointMode } | null {
  if (line.measureKey !== "joint_range" || !line.variant) return null;
  const match = /^(.+)_(active|passive)$/.exec(line.variant);
  if (!match) return null;
  const movement = JOINT_MOVEMENTS.find((m) => m.key === match[1]);
  return movement ? { movement: movement.key, label: movement.label, mode: match[2] as JointMode } : null;
}

function tail(line: Pick<LabelLine, "side" | "medicationState">): string {
  const parts: string[] = [];
  if (line.side) parts.push(line.side === "left" ? "left" : "right");
  if (line.medicationState) parts.push(line.medicationState === "on" ? "ON" : "OFF");
  return parts.length ? ` (${parts.join(", ")})` : "";
}

/**
 * The short label of one line. `all` is every line on the record: a joint
 * movement recorded both on the patient's own and moved by the physio, on
 * the same side, keeps its mode in the label so the two stay apart; recorded
 * one way only, the mode is left to the detail text.
 *
 *   "Knee bend (right)"
 *   "Knee straightening - on your own (right)" / "- moved by physio (right)"
 *   clinician: "Knee straightening, active (right)" / "..., passive (right)"
 *   "Thigh strength (right)", "Everyday tasks (legs)", "Pain score"
 */
export function shortSeriesLabel(line: LabelLine, voice: LabelVoice, all: readonly LabelLine[] = []): string {
  const joint = jointParts(line);
  if (joint) {
    const other: JointMode = joint.mode === "active" ? "passive" : "active";
    const bothModes = all.some(
      (o) => o !== line && (o.side ?? null) === (line.side ?? null) && o.variant === `${joint.movement}_${other}` && jointParts(o) !== null
    );
    const mode = bothModes ? (voice === "patient" ? ` - ${MODE_WORDS.patient[joint.mode]}` : `, ${MODE_WORDS.clinician[joint.mode]}`) : "";
    return `${joint.label}${mode}${tail(line)}`;
  }
  const strength = line.measureKey === "strength_symmetry" ? (line.variant ? SHORT_STRENGTH[line.variant] : "Strength") : null;
  if (strength) return `${strength}${tail(line)}`;
  const short = SHORT_MEASURE[line.measureKey]?.[voice];
  if (short && !line.variant) return `${short}${tail(line)}`;
  // Anything else keeps its full name: no guess is better than a wrong short one.
  const base = voice === "clinician" ? line.label : line.plainName;
  return `${line.variantLabel ? `${base} - ${line.variantLabel}` : base}${tail(line)}`;
}
