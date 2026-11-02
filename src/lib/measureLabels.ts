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
  barthel: { patient: "Independence", clinician: "Barthel Index" },
  berg_balance: { patient: "Balance", clinician: "Berg Balance Scale" },
  ten_metre_walk: { patient: "Walking speed", clinician: "10-metre walk" },
  tug: { patient: "Up-and-go", clinician: "Timed Up and Go" },
  fac: { patient: "Help needed to walk", clinician: "Walking category (FAC)" },
  fugl_meyer_ue: { patient: "Arm and hand movement", clinician: "Fugl-Meyer (arm)" },
  five_sit_to_stand: { patient: "Five stands from a chair", clinician: "Five times sit-to-stand" },
  mini_bestest: { patient: "Balance (harder test)", clinician: "Mini-BESTest" },
  freezing_episodes: { patient: "Feet getting stuck, per week", clinician: "Freezing per week" },
  pd_symptom_rating: { patient: "Symptom profile", clinician: "Symptom rating (clinic's own)" },
  hoehn_yahr: { patient: "Stage", clinician: "Hoehn and Yahr stage" },
  peds_milestones_achieved: { patient: "Milestones reached", clinician: "Milestones achieved" },
  peds_independent_steps: { patient: "Steps on their own", clinician: "Independent steps" },
  peds_standing_seconds: { patient: "Standing on their own", clinician: "Independent standing" },
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

/** The patient's words for a joint movement: what they do, not the
 *  clinician's plane of motion ("Lifting your arm forward", not "Shoulder
 *  flexion"). A movement not listed keeps the registry's label. */
const PATIENT_JOINT: Record<string, string> = {
  shoulder_flexion: "Lifting your arm forward",
  shoulder_abduction: "Lifting your arm out to the side",
  shoulder_external_rotation: "Turning your arm outwards",
  shoulder_internal_rotation: "Turning your arm inwards",
  elbow_flexion: "Bending your elbow",
  wrist_flexion: "Bending your wrist down",
  wrist_extension: "Bending your wrist back",
  hip_flexion: "Bringing your knee up",
  hip_abduction: "Moving your leg out to the side",
  hip_internal_rotation: "Turning your leg inwards",
  hip_external_rotation: "Turning your leg outwards",
  knee_flexion: "Bending your knee",
  knee_extension: "Straightening your knee",
  ankle_dorsiflexion: "Pulling your foot up",
  ankle_plantarflexion: "Pointing your foot down",
  neck_rotation: "Turning your head",
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
    const name = voice === "patient" ? (PATIENT_JOINT[joint.movement] ?? joint.label) : joint.label;
    return `${name}${mode}${tail(line)}`;
  }
  const strength = line.measureKey === "strength_symmetry" ? (line.variant ? SHORT_STRENGTH[line.variant] : "Strength") : null;
  if (strength) return `${strength}${tail(line)}`;
  const short = SHORT_MEASURE[line.measureKey]?.[voice];
  if (short && !line.variant) return `${short}${tail(line)}`;
  // Anything else keeps its full name: no guess is better than a wrong short one.
  const base = voice === "clinician" ? line.label : line.plainName;
  return `${line.variantLabel ? `${base} - ${line.variantLabel}` : base}${tail(line)}`;
}
