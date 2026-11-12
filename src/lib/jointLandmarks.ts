import { JOINT_MOVEMENTS } from "@/lib/outcomeMeasures";

// How to measure each joint movement with a goniometer: the handbook's
// "Other joints: landmarks and usual ranges" table, plus its two knee walk-
// throughs. Shown as help inside the Record a test dialog, so a
// physiotherapist who has not measured this movement lately can check where
// the centre and the two arms go. Dependency-free; the usual degrees are
// JOINT_MOVEMENTS' own (outcomeMeasures.ts) and are not repeated here.
//
// The joint-range measure stores its movement and mode in one `variant`
// string ("knee_flexion_active"); `splitJointVariant` and `joinJointVariant`
// are the only places that format is read or written for the screen.

export type JointMode = "active" | "passive";

export const JOINT_MODES: readonly { key: JointMode; label: string; help: string }[] = [
  { key: "active", label: "Active", help: "The patient moves the joint themselves." },
  { key: "passive", label: "Passive", help: "The physiotherapist moves it to the firm end of range." },
];

export type JointLandmark = {
  /** The patient's position. */
  position: string;
  /** Where the middle of the goniometer goes. */
  centre: string;
  /** The arm that stays still. */
  fixedArm: string;
  /** The arm that follows the moving part. */
  movingArm: string;
  /** Anything else the handbook says for this movement. */
  note?: string;
};

/** Keyed by JOINT_MOVEMENTS key. Every movement the registry lists has an entry
 *  (the test walks the two lists). */
export const JOINT_LANDMARKS: Readonly<Record<string, JointLandmark>> = {
  shoulder_flexion: {
    position: "Lying on the back",
    centre: "Side of the shoulder, below the acromion",
    fixedArm: "Along the side of the trunk",
    movingArm: "Along the upper arm to the outer elbow",
  },
  shoulder_abduction: {
    position: "Lying or sitting",
    centre: "Front of the shoulder",
    fixedArm: "Parallel to the breastbone",
    movingArm: "Front of the upper arm",
  },
  shoulder_external_rotation: {
    position: "Lying, arm out to 90 degrees, elbow bent 90 degrees",
    centre: "Point of the elbow",
    fixedArm: "Straight up, perpendicular to the floor",
    movingArm: "Along the forearm to the wrist",
  },
  shoulder_internal_rotation: {
    position: "Lying, arm out to 90 degrees, elbow bent 90 degrees",
    centre: "Point of the elbow",
    fixedArm: "Straight up, perpendicular to the floor",
    movingArm: "Along the forearm to the wrist",
  },
  elbow_flexion: {
    position: "Lying or sitting",
    centre: "Outer elbow",
    fixedArm: "Along the upper arm to the shoulder",
    movingArm: "Along the forearm to the thumb-side wrist",
  },
  wrist_flexion: {
    position: "Forearm resting on a table",
    centre: "Little-finger side of the wrist",
    fixedArm: "Along the forearm bone (ulna)",
    movingArm: "Along the little-finger knuckle bone",
  },
  wrist_extension: {
    position: "Forearm resting on a table",
    centre: "Little-finger side of the wrist",
    fixedArm: "Along the forearm bone (ulna)",
    movingArm: "Along the little-finger knuckle bone",
  },
  hip_flexion: {
    position: "Lying on the back, knee bent",
    centre: "Greater trochanter (the bony point at the top of the outer hip)",
    fixedArm: "Along the side of the pelvis",
    movingArm: "Along the thigh to the outer knee",
  },
  hip_abduction: {
    position: "Lying on the back",
    centre: "Front hip bone (ASIS)",
    fixedArm: "Line between the two front hip bones",
    movingArm: "Down the front of the thigh to the kneecap",
  },
  hip_internal_rotation: {
    position: "Sitting, knee bent 90 degrees",
    centre: "Front of the kneecap",
    fixedArm: "Straight down, perpendicular to the floor",
    movingArm: "Along the shin",
  },
  hip_external_rotation: {
    position: "Sitting, knee bent 90 degrees",
    centre: "Front of the kneecap",
    fixedArm: "Straight down, perpendicular to the floor",
    movingArm: "Along the shin",
  },
  knee_flexion: {
    position: "Lying on the back",
    centre: "Outer knob of the thigh bone at the knee (lateral femoral epicondyle)",
    fixedArm: "Along the outer thigh towards the bony point at the top of the hip (greater trochanter)",
    movingArm: "Along the outer lower leg towards the outer ankle bone (lateral malleolus)",
    note: "Active: the patient slides the heel towards the buttock as far as they can. Passive: you move it to the firm end of range. Keep to the same one each time. Read the angle without moving the arms.",
  },
  knee_extension: {
    position: "Lying on the back, a rolled towel under the heel so the knee can drop",
    centre: "Outer knob of the thigh bone at the knee (lateral femoral epicondyle)",
    fixedArm: "Along the outer thigh towards the bony point at the top of the hip (greater trochanter)",
    movingArm: "Along the outer lower leg towards the outer ankle bone (lateral malleolus)",
    note: "A straight knee reads 0. A knee that stops short of straight is a minus number (-8 is 8 short); one that goes past straight is plus. Measure passive first, then ask the patient to tighten the thigh and lift the leg. If active is less straight than passive, the difference is the extension lag - a strength problem, not a stiffness problem. Record both.",
  },
  ankle_dorsiflexion: {
    position: "Sitting, knee bent 90 degrees",
    centre: "Outer ankle bone",
    fixedArm: "Along the outer lower leg",
    movingArm: "Parallel to the little-toe foot bone",
  },
  ankle_plantarflexion: {
    position: "Sitting, knee bent 90 degrees",
    centre: "Outer ankle bone",
    fixedArm: "Along the outer lower leg",
    movingArm: "Parallel to the little-toe foot bone",
  },
  neck_rotation: {
    position: "Sitting",
    centre: "No single fixed axis",
    fixedArm: "Not used",
    movingArm: "Not used",
    note: "Use an inclinometer or a neck range-of-motion device rather than a goniometer; the neck has no single fixed axis.",
  },
};

/** The standing rule under every landmark card. */
export const JOINT_READING_RULE =
  "Take the reading twice; if the two differ by more than 5 degrees, take a third and keep the middle one. From the same tester a change under about 5 degrees can be measurement error; between testers allow about 10. The patient's other side is the best normal.";

/** "knee_flexion_active" -> { movement: "knee_flexion", mode: "active" }; null for anything else. */
export function splitJointVariant(variant: string | null | undefined): { movement: string; mode: JointMode } | null {
  if (!variant) return null;
  for (const m of JOINT_MOVEMENTS) {
    if (variant === `${m.key}_active`) return { movement: m.key, mode: "active" };
    if (variant === `${m.key}_passive`) return { movement: m.key, mode: "passive" };
  }
  return null;
}

/** The inverse; "" until both halves are chosen or for a movement the registry does not hold. */
export function joinJointVariant(movement: string, mode: JointMode | ""): string {
  if (!mode || !JOINT_MOVEMENTS.some((m) => m.key === movement)) return "";
  return `${movement}_${mode}`;
}

/** The how-to-measure card for a movement, or null. */
export function landmarksFor(movement: string): JointLandmark | null {
  return JOINT_LANDMARKS[movement] ?? null;
}

/** The movement's plain label, or null. */
export function movementLabel(movement: string): string | null {
  return JOINT_MOVEMENTS.find((m) => m.key === movement)?.label ?? null;
}
