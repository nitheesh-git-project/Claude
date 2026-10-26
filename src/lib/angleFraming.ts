// The framing guide shown BEFORE a picture is loaded into the image-angle
// tool: where the camera goes for each movement, so the picture is one an
// angle can honestly be taken from. Dependency-free. The patient's position
// is the handbook's own (jointLandmarks.ts), not repeated here.

import { landmarksFor } from "@/lib/jointLandmarks";
import { angleMovementFor } from "@/lib/angleMeasure";

export type FramingView = "side" | "front" | "along_arm";
export type DiagramKind = "leg_side" | "arm_side" | "front_body" | "along_arm";

const VIEW: Readonly<Record<string, { view: FramingView; diagram: DiagramKind }>> = {
  shoulder_flexion: { view: "side", diagram: "arm_side" },
  shoulder_abduction: { view: "front", diagram: "front_body" },
  shoulder_external_rotation: { view: "along_arm", diagram: "along_arm" },
  shoulder_internal_rotation: { view: "along_arm", diagram: "along_arm" },
  elbow_flexion: { view: "side", diagram: "arm_side" },
  wrist_flexion: { view: "side", diagram: "arm_side" },
  wrist_extension: { view: "side", diagram: "arm_side" },
  hip_flexion: { view: "side", diagram: "leg_side" },
  hip_abduction: { view: "front", diagram: "front_body" },
  hip_internal_rotation: { view: "front", diagram: "front_body" },
  hip_external_rotation: { view: "front", diagram: "front_body" },
  knee_flexion: { view: "side", diagram: "leg_side" },
  knee_extension: { view: "side", diagram: "leg_side" },
  ankle_dorsiflexion: { view: "side", diagram: "leg_side" },
  ankle_plantarflexion: { view: "side", diagram: "leg_side" },
};

const VIEW_STEP: Readonly<Record<FramingView, string>> = {
  side: "Camera side-on to the joint, at the height of the joint, so you look straight across it.",
  front: "Camera square on to the patient's front, at the height of the joint, so you look straight at it.",
  along_arm: "Camera in line with the upper arm, at the height of the joint, looking along it, so the forearm swings across the picture.",
};

export type FramingGuide = {
  movement: string;
  view: FramingView;
  diagram: DiagramKind;
  /** The patient's position, from the handbook. */
  position: string;
  /** Short plain steps, in the order to do them. */
  steps: string[];
};

/** The guide for a movement, or null where the image tool does not offer it. */
export function framingGuideFor(movement: string): FramingGuide | null {
  const geo = angleMovementFor(movement);
  const landmark = landmarksFor(movement);
  const v = VIEW[movement];
  if (!geo || !landmark || !v) return null;
  return {
    movement,
    view: v.view,
    diagram: v.diagram,
    position: landmark.position,
    steps: [
      VIEW_STEP[v.view],
      "Whole limb in view, with some space around it. Do not cut off the hand or the foot.",
      `Patient in the position: ${landmark.position.charAt(0).toLowerCase()}${landmark.position.slice(1)}.`,
      "Plain, close-fitting clothing, or bare skin at the joint, so the joint can be seen.",
      "A plain background that contrasts with the clothing.",
      "Phone or laptop propped up so it cannot move. Do not hold it.",
      "Camera level, not tipped. The level line below can check it from a table edge or a door frame.",
      "Same distance and height each time, so one photo can be compared with the next.",
      "Ask the patient to hold still for 2 seconds, then take the screenshot or the photo.",
    ],
  };
}
