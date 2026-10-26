// Joint angle from a photograph: the maths behind the "Measure from an image"
// tool (src/components/profile/progress/angle/). Dependency-free, so the
// conventions can be tested without a canvas.
//
// The physiotherapist taps landmarks on a screenshot of the video call; this
// module turns three points (or two, against the upright) into the number the
// Record a test dialog wants, in the SAME convention as a goniometer reading:
//   - flexion movements read 0 for a straight limb and rise as it bends
//     (reading = 180 - the angle drawn at the joint);
//   - a knee that stops short of straight reads negative (-8 is 8 short),
//     one that goes past straight reads positive (outcomeMeasures.ts);
//   - shoulder flexion and abduction read 0 with the arm by the side;
//   - the ankle reads 0 with the foot at a right angle to the shin;
//   - rotations read 0 with the forearm (or shin) upright.
//
// It is an ESTIMATE. A photograph flattens a three-dimensional limb, so the
// number is only as good as how side-on the camera was (ACCURACY_EXPLAINER).
// Nothing here stores or logs a point, and the result carries a value and
// warnings only.

import { JOINT_MOVEMENTS } from "@/lib/outcomeMeasures";

export type Pt = { x: number; y: number };
export type ImageSize = { width: number; height: number };

/** How a drawn angle becomes a goniometer-style reading. */
export type AngleRule =
  /** 0 for a straight limb: reading = 180 - the angle at the joint. */
  | "from_straight"
  /** 0 with the two lines together: reading = the angle at the joint. */
  | "direct"
  /** 0 at a right angle: reading = sense * (90 - the angle at the joint). */
  | "from_right_angle"
  /** Two points, measured from the picture's upright (or a reference line). */
  | "from_vertical";

export type AngleLandmark = { key: string; label: string; where: string };

export type AngleMovement = {
  movement: string;
  rule: AngleRule;
  /** Three points (fixed end, centre, moving end), or two for from_vertical. */
  landmarks: readonly AngleLandmark[];
  /** from_right_angle: +1 when a smaller drawn angle is a larger reading. */
  sense?: 1 | -1;
  /** from_vertical: the fixed arm points up or down in the picture. */
  upright?: "up" | "down";
  /** Sign of the reading when the joint moves the usual way. */
  usualSign: 1 | -1;
  /** The tick-box words for the other direction, or null when there is none. */
  oppositeLabel: string | null;
};

const LM = (key: string, label: string, where: string): AngleLandmark => ({ key, label, where });

const KNEE_POINTS = [
  LM("hip", "Hip", "The bony point at the top of the outer hip (greater trochanter)"),
  LM("knee", "Knee", "The outer knob of the thigh bone at the knee"),
  LM("ankle", "Ankle", "The outer ankle bone"),
];

/** Every movement the image tool can measure: the handbook's joints, less the
 *  neck, which has no single fixed axis to draw. Keyed like JOINT_MOVEMENTS. */
export const ANGLE_MOVEMENTS: Readonly<Record<string, AngleMovement>> = {
  shoulder_flexion: {
    movement: "shoulder_flexion",
    rule: "direct",
    landmarks: [LM("hip", "Hip", "Side of the hip, on the line of the trunk"), LM("shoulder", "Shoulder", "Side of the shoulder, below the acromion"), LM("elbow", "Elbow", "Outer elbow")],
    usualSign: 1,
    oppositeLabel: "The arm is behind the body",
  },
  shoulder_abduction: {
    movement: "shoulder_abduction",
    rule: "direct",
    landmarks: [LM("hip", "Hip", "Mid-line low on the trunk, in line with the breastbone"), LM("shoulder", "Shoulder", "Front of the shoulder"), LM("elbow", "Elbow", "Middle of the front of the elbow")],
    usualSign: 1,
    oppositeLabel: null,
  },
  shoulder_external_rotation: {
    movement: "shoulder_external_rotation",
    rule: "from_vertical",
    upright: "up",
    landmarks: [LM("elbow", "Elbow", "Point of the elbow"), LM("wrist", "Wrist", "Wrist, along the forearm")],
    usualSign: 1,
    oppositeLabel: null,
  },
  shoulder_internal_rotation: {
    movement: "shoulder_internal_rotation",
    rule: "from_vertical",
    upright: "up",
    landmarks: [LM("elbow", "Elbow", "Point of the elbow"), LM("wrist", "Wrist", "Wrist, along the forearm")],
    usualSign: 1,
    oppositeLabel: null,
  },
  elbow_flexion: {
    movement: "elbow_flexion",
    rule: "from_straight",
    landmarks: [LM("shoulder", "Shoulder", "Side of the shoulder"), LM("elbow", "Elbow", "Outer elbow"), LM("wrist", "Wrist", "Thumb-side wrist")],
    usualSign: 1,
    oppositeLabel: "The elbow goes past straight",
  },
  wrist_flexion: {
    movement: "wrist_flexion",
    rule: "from_straight",
    landmarks: [LM("elbow", "Elbow", "Outer elbow"), LM("wrist", "Wrist", "Little-finger side of the wrist"), LM("knuckle", "Knuckle", "Little-finger knuckle")],
    usualSign: 1,
    oppositeLabel: null,
  },
  wrist_extension: {
    movement: "wrist_extension",
    rule: "from_straight",
    landmarks: [LM("elbow", "Elbow", "Outer elbow"), LM("wrist", "Wrist", "Little-finger side of the wrist"), LM("knuckle", "Knuckle", "Little-finger knuckle")],
    usualSign: 1,
    oppositeLabel: null,
  },
  hip_flexion: {
    movement: "hip_flexion",
    rule: "from_straight",
    landmarks: [LM("shoulder", "Trunk", "Side of the shoulder, on the line of the trunk"), LM("hip", "Hip", "The bony point at the top of the outer hip"), LM("knee", "Knee", "Outer knee")],
    usualSign: 1,
    oppositeLabel: null,
  },
  hip_abduction: {
    movement: "hip_abduction",
    rule: "from_right_angle",
    sense: -1,
    landmarks: [LM("other_asis", "Other hip bone", "Front hip bone on the other side"), LM("asis", "Hip bone", "Front hip bone on the side measured"), LM("knee", "Knee", "Middle of the kneecap")],
    usualSign: 1,
    oppositeLabel: null,
  },
  hip_internal_rotation: {
    movement: "hip_internal_rotation",
    rule: "from_vertical",
    upright: "down",
    landmarks: [LM("knee", "Knee", "Front of the kneecap"), LM("ankle", "Ankle", "Middle of the ankle, along the shin")],
    usualSign: 1,
    oppositeLabel: null,
  },
  hip_external_rotation: {
    movement: "hip_external_rotation",
    rule: "from_vertical",
    upright: "down",
    landmarks: [LM("knee", "Knee", "Front of the kneecap"), LM("ankle", "Ankle", "Middle of the ankle, along the shin")],
    usualSign: 1,
    oppositeLabel: null,
  },
  knee_flexion: {
    movement: "knee_flexion",
    rule: "from_straight",
    landmarks: KNEE_POINTS,
    usualSign: 1,
    oppositeLabel: "The knee goes past straight",
  },
  knee_extension: {
    movement: "knee_extension",
    rule: "from_straight",
    landmarks: KNEE_POINTS,
    // Short of straight is the minus number; past straight is plus.
    usualSign: -1,
    oppositeLabel: "The knee goes past straight",
  },
  ankle_dorsiflexion: {
    movement: "ankle_dorsiflexion",
    rule: "from_right_angle",
    sense: 1,
    landmarks: [LM("knee", "Knee", "Outer knee"), LM("ankle", "Ankle", "Outer ankle bone"), LM("toe", "Foot", "Head of the little-toe foot bone")],
    usualSign: 1,
    oppositeLabel: null,
  },
  ankle_plantarflexion: {
    movement: "ankle_plantarflexion",
    rule: "from_right_angle",
    sense: -1,
    landmarks: [LM("knee", "Knee", "Outer knee"), LM("ankle", "Ankle", "Outer ankle bone"), LM("toe", "Foot", "Head of the little-toe foot bone")],
    usualSign: 1,
    oppositeLabel: null,
  },
};

/** The image tool's geometry for a movement, or null (neck rotation, or a key
 *  the registry does not hold). */
export function angleMovementFor(movement: string): AngleMovement | null {
  return ANGLE_MOVEMENTS[movement] ?? null;
}

/** Whether "Measure from an image" is offered for this movement. */
export function canMeasureFromImage(movement: string): boolean {
  return angleMovementFor(movement) !== null;
}

// --- Tolerances ---------------------------------------------------------------------------------

/** A segment shorter than this share of the image's shorter side is refused: too close to tell a direction. */
export const MIN_SEGMENT_SHARE = 0.02;
/** Below this share a limb is drawn small enough that a pixel is a degree or two. */
export const SMALL_FRAME_SHARE = 0.25;
/** One segment under this share of the other is badly foreshortened (the camera is not side-on). */
export const FORESHORTEN_RATIO = 0.15;
/** A reference line off level or upright by more than this many degrees is flagged. */
export const LEVEL_TOLERANCE_DEGREES = 2;
/** Drawn angles below this (a limb folded back on itself, where straight is 0) are refused. */
export const MIN_DRAWN_DEGREES = 5;
/** Typical error of a photo angle, in degrees: up to about this, never to be read as exact. */
export const TYPICAL_ERROR_DEGREES = { low: 5, high: 10 } as const;

/** Plain-English accuracy statement, shown on the tool and in the framing guide. */
export const ACCURACY_EXPLAINER: readonly string[] = [
  "An angle taken from a photograph is an estimate. It is not equal to a goniometer reading and is never recorded as one.",
  "A photograph flattens the limb. The error grows the further the camera is from side-on to the joint, and when the limb points towards or away from the camera.",
  "Expect it to be out by about 5 degrees on a good picture and up to 10 on a poor one. A change smaller than that between two photos may be noise.",
  "Use it to follow one patient over time, with the same camera position each time, and measure in person when the exact number matters.",
];

export const PHOTO_PRIVACY_LINE = "The photo stays on this device and is not saved.";

// --- Geometry -----------------------------------------------------------------------------------

const RAD = Math.PI / 180;

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Round to a whole degree, never "-0". */
export function roundDegrees(value: number): number {
  const r = Math.round(value);
  return r === 0 ? 0 : r;
}

/** The angle at `vertex` between the rays to `a` and `c`, in degrees (0 to 180); null when either ray has no length. */
export function interiorAngle(a: Pt, vertex: Pt, c: Pt): number | null {
  const ux = a.x - vertex.x;
  const uy = a.y - vertex.y;
  const vx = c.x - vertex.x;
  const vy = c.y - vertex.y;
  const lu = Math.hypot(ux, uy);
  const lv = Math.hypot(vx, vy);
  if (lu === 0 || lv === 0) return null;
  const cos = Math.min(1, Math.max(-1, (ux * vx + uy * vy) / (lu * lv)));
  return Math.acos(cos) / RAD;
}

/** The angle between the ray vertex->point and an upright direction vector, in degrees (0 to 180). */
export function angleFromDirection(vertex: Pt, point: Pt, direction: Pt): number | null {
  const origin: Pt = { x: 0, y: 0 };
  const d = { x: point.x - vertex.x, y: point.y - vertex.y };
  if (Math.hypot(d.x, d.y) === 0 || Math.hypot(direction.x, direction.y) === 0) return null;
  return interiorAngle(d, origin, direction);
}

/** How far a line is from level, in degrees: -90 to 90, 0 for a horizontal line. Screen coordinates (y down). */
export function tiltFromLevel(a: Pt, b: Pt): number | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return null;
  let deg = Math.atan2(dy, dx) / RAD; // -180..180
  if (deg > 90) deg -= 180;
  if (deg <= -90) deg += 180;
  return deg === 0 ? 0 : deg;
}

/** How far a line is from upright, in degrees: -90 to 90, 0 for a vertical line. */
export function tiltFromUpright(a: Pt, b: Pt): number | null {
  const t = tiltFromLevel(a, b);
  if (t === null) return null;
  const u = t > 0 ? t - 90 : t + 90;
  return u === 0 ? 0 : u;
}

/** The unit vector a reference line stands for as "upright": the line itself when it is near upright, else turned a quarter. */
export function uprightFromReference(a: Pt, b: Pt, kind: "level" | "upright", towards: "up" | "down"): Pt | null {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  dx /= len;
  dy /= len;
  if (kind === "level") {
    // Turn a quarter so the line becomes the upright; screen "up" is negative y.
    const t = dx;
    dx = dy;
    dy = -t;
  }
  const wantsUp = towards === "up";
  const pointsUp = dy < 0;
  if (wantsUp !== pointsUp) {
    dx = -dx;
    dy = -dy;
  }
  return { x: dx, y: dy };
}

// --- The 90-degree turn and the mirror ---------------------------------------------------------------

/** A point after the picture is turned a quarter clockwise (a w x h picture becomes h x w). */
export function rotatePointClockwise(p: Pt, size: ImageSize): Pt {
  return { x: size.height - p.y, y: p.x };
}

/** A point after the picture is flipped left to right. */
export function mirrorPoint(p: Pt, size: ImageSize): Pt {
  return { x: size.width - p.x, y: p.y };
}

// --- The result ---------------------------------------------------------------------------------

export type AngleWarningCode =
  | "small_frame"
  | "foreshortened"
  | "outside_image"
  | "out_of_range"
  | "tilted_reference"
  | "within_error";

export type AngleWarning = { code: AngleWarningCode; message: string };

export type AngleRefusalCode = "unknown_movement" | "missing_points" | "bad_image" | "too_close" | "folded";

export type AngleResult =
  | {
      ok: true;
      /** The goniometer-style reading, whole degrees. */
      value: number;
      /** The angle drawn at the joint, one decimal (for the picture, not the record). */
      drawn: number;
      warnings: AngleWarning[];
      /** The sentence read out beside the number. */
      text: string;
    }
  | { ok: false; code: AngleRefusalCode; message: string };

export type AngleInput = {
  movement: string;
  /** Landmarks in picture pixels, in the order of ANGLE_MOVEMENTS; null for one not placed yet. */
  points: readonly (Pt | null)[];
  image: ImageSize;
  /** The joint went the other way (see AngleMovement.oppositeLabel). */
  opposite?: boolean;
  /** For from_vertical: the unit vector standing for upright. Absent means the picture's own upright. */
  upright?: Pt | null;
  /** The last reading on this line, to say when a change is inside the photo's own error. */
  previous?: number | null;
  /** True when a level line was drawn and is off by more than the tolerance. */
  referenceTiltDegrees?: number | null;
};

function describe(value: number, movement: string): string {
  const label = JOINT_MOVEMENTS.find((m) => m.key === movement)?.label ?? movement;
  return `${label}: about ${value} degrees, estimated from a photo.`;
}

/**
 * The reading for a set of landmarks, or the reason there is none. Refuses
 * (rather than guessing) when a point is missing, two points sit on top of
 * each other, or the two lines lie along one another; otherwise returns the
 * number with a warning for every doubt about the picture.
 */
export function measureAngle(input: AngleInput): AngleResult {
  const def = angleMovementFor(input.movement);
  if (!def) return { ok: false, code: "unknown_movement", message: "This movement cannot be measured from an image." };
  const { width, height } = input.image;
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return { ok: false, code: "bad_image", message: "The picture has no size." };
  }
  const need = def.landmarks.length;
  const pts = input.points.slice(0, need);
  if (pts.length < need || pts.some((p) => p === null || !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    return { ok: false, code: "missing_points", message: `Place all ${need} points.` };
  }
  const p = pts as Pt[];
  const shortSide = Math.min(width, height);
  const minSegment = MIN_SEGMENT_SHARE * shortSide;
  for (let i = 0; i < p.length - 1; i++) {
    if (distance(p[i], p[i + 1]) < minSegment) {
      return { ok: false, code: "too_close", message: "Two points are too close together to give a direction. Move them further apart along the limb." };
    }
  }
  if (need === 3 && distance(p[0], p[2]) < minSegment) {
    return { ok: false, code: "too_close", message: "The first and last points are on top of each other. Check where each one goes." };
  }

  let drawn: number | null;
  let upright: Pt | null = null;
  if (def.rule === "from_vertical") {
    upright = input.upright ?? { x: 0, y: def.upright === "down" ? 1 : -1 };
    drawn = angleFromDirection(p[0], p[1], upright);
  } else {
    drawn = interiorAngle(p[0], p[1], p[2]);
  }
  if (drawn === null) return { ok: false, code: "too_close", message: "Two points are too close together to give a direction." };
  // Only where straight is 0: a drawn angle near 0 would be 175+ degrees of bend. For
  // shoulder flexion and abduction, the arm lying along the trunk is a real 0.
  if (def.rule === "from_straight" && drawn < MIN_DRAWN_DEGREES) {
    return { ok: false, code: "folded", message: "The two lines lie along each other. Check that the points follow the two segments of the limb, not one." };
  }

  let value: number;
  const sign = (def.usualSign * (input.opposite ? -1 : 1)) as 1 | -1;
  switch (def.rule) {
    case "from_straight":
      value = sign * (180 - drawn);
      break;
    case "direct":
    case "from_vertical":
      value = sign * drawn;
      break;
    case "from_right_angle":
      value = (def.sense ?? 1) * (90 - drawn);
      break;
  }
  const reading = roundDegrees(value);

  const warnings: AngleWarning[] = [];
  const segLengths = need === 3 ? [distance(p[0], p[1]), distance(p[1], p[2])] : [distance(p[0], p[1])];
  const total = segLengths.reduce((a, b) => a + b, 0);
  const diagonal = Math.hypot(width, height);
  if (total < SMALL_FRAME_SHARE * diagonal) {
    warnings.push({
      code: "small_frame",
      message: "The leg looks small in the photo. Move the camera closer and take it again.",
    });
  }
  if (need === 3) {
    const [s1, s2] = segLengths;
    if (Math.min(s1, s2) < FORESHORTEN_RATIO * Math.max(s1, s2)) {
      warnings.push({
        code: "foreshortened",
        message: "The camera is not at the side. Move the camera to the side of the joint and take it again.",
      });
    }
  }
  if (p.some((pt) => pt.x < 0 || pt.y < 0 || pt.x > width || pt.y > height)) {
    warnings.push({ code: "outside_image", message: "A point is off the photo. Take it again with the whole limb in view." });
  }
  if (input.referenceTiltDegrees != null && Math.abs(input.referenceTiltDegrees) > LEVEL_TOLERANCE_DEGREES) {
    warnings.push({
      code: "tilted_reference",
      message: `The photo is tilted by about ${Math.abs(Math.round(input.referenceTiltDegrees))} degrees. Hold the camera level and take it again.`,
    });
  }
  const measure = JOINT_MOVEMENTS.find((m) => m.key === input.movement);
  if (measure && (reading > measure.usualDegrees + 25 || reading < -45)) {
    warnings.push({
      code: "out_of_range",
      message: "This number looks too big or too small. Check each point sits on its landmark.",
    });
  }
  if (input.previous != null && Number.isFinite(input.previous) && Math.abs(reading - input.previous) <= TYPICAL_ERROR_DEGREES.high) {
    warnings.push({
      code: "within_error",
      message: `This is within ${TYPICAL_ERROR_DEGREES.high} degrees of the last reading. A photo cannot show a change that small.`,
    });
  }

  return { ok: true, value: reading, drawn: Math.round(drawn * 10) / 10, warnings, text: describe(reading, input.movement) };
}

/** One plain line saying what the number means, with the technical word in brackets. */
export function meaningLine(movement: string, value: number): string | null {
  const def = angleMovementFor(movement);
  if (!def) return null;
  const n = Math.abs(value);
  const deg = `${n} degree${n === 1 ? "" : "s"}`;
  switch (def.rule) {
    case "from_straight":
      if (def.usualSign === -1) {
        if (value === 0) return "Fully straight. That is 0.";
        return value < 0 ? `Short of straight by ${deg}.` : `Straight, and ${deg} past it.`;
      }
      if (value === 0) return "Straight. That is 0.";
      return value > 0 ? `Bent ${deg} from straight (this is the flexion angle).` : `${deg} past straight.`;
    case "direct":
      return value === 0 ? "Arm is by the side. That is 0." : `${deg} away from the side of the body (flexion or abduction angle).`;
    case "from_right_angle":
      return value === 0 ? "A right angle. That is 0." : `${deg} ${value > 0 ? "on from" : "short of"} a right angle.`;
    case "from_vertical":
      return value === 0 ? "Pointing straight up. That is 0." : `Turned ${deg} from upright (rotation angle).`;
  }
}

/** Warnings in the order that matters most; the screen shows only the first. */
const WARNING_ORDER: readonly AngleWarningCode[] = ["outside_image", "foreshortened", "tilted_reference", "small_frame", "out_of_range", "within_error"];

/** The one warning worth showing now, or null. */
export function mostImportantWarning(warnings: readonly AngleWarning[]): AngleWarning | null {
  for (const code of WARNING_ORDER) {
    const w = warnings.find((x) => x.code === code);
    if (w) return w;
  }
  return null;
}

// --- The conditions note -----------------------------------------------------------------------------

/** What the record says beside an estimate. */
export const IMAGE_ESTIMATE_LABEL = "Estimated from a photo";
