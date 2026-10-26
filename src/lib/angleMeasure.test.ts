import { describe, expect, it } from "vitest";
import { JOINT_MOVEMENTS } from "@/lib/outcomeMeasures";
import { JOINT_LANDMARKS } from "@/lib/jointLandmarks";
import {
  ACCURACY_EXPLAINER,
  ANGLE_MOVEMENTS,
  angleFromDirection,
  angleMovementFor,
  canMeasureFromImage,
  interiorAngle,
  measureAngle,
  mirrorPoint,
  rotatePointClockwise,
  roundDegrees,
  tiltFromLevel,
  tiltFromUpright,
  uprightFromReference,
  type Pt,
} from "@/lib/angleMeasure";

const IMG = { width: 1000, height: 800 };
const at = (deg: number, len: number, from: Pt): Pt => ({ x: from.x + len * Math.cos((deg * Math.PI) / 180), y: from.y + len * Math.sin((deg * Math.PI) / 180) });

/** hip, knee, ankle for a leg whose shin is turned `flex` degrees off the line of the thigh. */
function leg(flex: number): Pt[] {
  const hip = { x: 300, y: 300 };
  const knee = at(0, 300, hip);
  const ankle = at(flex, 300, knee);
  return [hip, knee, ankle];
}

function value(movement: string, points: (Pt | null)[], extra: object = {}) {
  const r = measureAngle({ movement, points, image: IMG, ...extra });
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  return r;
}

describe("interiorAngle and friends", () => {
  it("measures the angle at the vertex", () => {
    expect(interiorAngle({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90, 6);
    expect(interiorAngle({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(180, 6);
    expect(interiorAngle({ x: 2, y: 2 }, { x: 0, y: 0 }, { x: 5, y: 5 })).toBeCloseTo(0, 3);
  });
  it("is null when a ray has no length", () => {
    expect(interiorAngle({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });
  it("does not change when the picture is turned", () => {
    const [a, b, c] = leg(40);
    const size = IMG;
    const turned = [a, b, c].map((p) => rotatePointClockwise(p, size));
    expect(interiorAngle(turned[0], turned[1], turned[2])).toBeCloseTo(interiorAngle(a, b, c)!, 6);
    const flipped = [a, b, c].map((p) => mirrorPoint(p, size));
    expect(interiorAngle(flipped[0], flipped[1], flipped[2])).toBeCloseTo(interiorAngle(a, b, c)!, 6);
  });
  it("turns a corner clockwise and flips left to right", () => {
    expect(rotatePointClockwise({ x: 0, y: 0 }, { width: 10, height: 4 })).toEqual({ x: 4, y: 0 });
    expect(rotatePointClockwise({ x: 10, y: 4 }, { width: 10, height: 4 })).toEqual({ x: 0, y: 10 });
    expect(mirrorPoint({ x: 3, y: 2 }, { width: 10, height: 4 })).toEqual({ x: 7, y: 2 });
  });
  it("rounds to a whole degree and never prints minus zero", () => {
    expect(roundDegrees(-0.4)).toBe(0);
    expect(Object.is(roundDegrees(-0.4), 0)).toBe(true);
    expect(roundDegrees(89.5)).toBe(90);
    expect(roundDegrees(-8.4)).toBe(-8);
  });
  it("measures an angle from an upright direction", () => {
    expect(angleFromDirection({ x: 0, y: 0 }, { x: 0, y: -5 }, { x: 0, y: -1 })).toBeCloseTo(0, 6);
    expect(angleFromDirection({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: -1 })).toBeCloseTo(90, 6);
    expect(angleFromDirection({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: -1 })).toBeNull();
  });
});

describe("tilt and the reference line", () => {
  it("reads a level line as 0 whichever way it is drawn", () => {
    expect(tiltFromLevel({ x: 0, y: 5 }, { x: 10, y: 5 })).toBe(0);
    expect(tiltFromLevel({ x: 10, y: 5 }, { x: 0, y: 5 })).toBe(0);
  });
  it("reads the slope of a tilted line", () => {
    expect(tiltFromLevel({ x: 0, y: 0 }, { x: 10, y: 10 })).toBeCloseTo(45, 6);
    expect(tiltFromLevel({ x: 0, y: 0 }, { x: 10, y: -10 })).toBeCloseTo(-45, 6);
    expect(tiltFromLevel({ x: 10, y: 10 }, { x: 0, y: 0 })).toBeCloseTo(45, 6);
  });
  it("reads an upright line as 0 from upright", () => {
    expect(tiltFromUpright({ x: 5, y: 0 }, { x: 5, y: 50 })).toBe(0);
    expect(Math.abs(tiltFromUpright({ x: 0, y: 0 }, { x: 5, y: 100 })!)).toBeCloseTo(2.862, 2);
  });
  it("gives null for a line of no length", () => {
    expect(tiltFromLevel({ x: 1, y: 1 }, { x: 1, y: 1 })).toBeNull();
    expect(uprightFromReference({ x: 1, y: 1 }, { x: 1, y: 1 }, "level", "up")).toBeNull();
  });
  it("turns a level line into the upright, pointing the way asked", () => {
    const up = uprightFromReference({ x: 0, y: 0 }, { x: 10, y: 0 }, "level", "up")!;
    expect(up.x).toBeCloseTo(0, 6);
    expect(up.y).toBeCloseTo(-1, 6);
    const down = uprightFromReference({ x: 0, y: 0 }, { x: 10, y: 0 }, "level", "down")!;
    expect(down.y).toBeCloseTo(1, 6);
    const same = uprightFromReference({ x: 0, y: 10 }, { x: 0, y: 0 }, "upright", "up")!;
    expect(same.y).toBeCloseTo(-1, 6);
    const flipped = uprightFromReference({ x: 0, y: 10 }, { x: 0, y: 0 }, "upright", "down")!;
    expect(flipped.y).toBeCloseTo(1, 6);
  });
});

describe("knee conventions", () => {
  it("reads a straight knee as 0 for flexion and for extension", () => {
    expect(value("knee_flexion", leg(0)).value).toBe(0);
    expect(value("knee_extension", leg(0)).value).toBe(0);
  });
  it("reads a bent knee as flexion degrees: 180 minus the angle at the knee", () => {
    const r = value("knee_flexion", leg(90));
    expect(r.value).toBe(90);
    expect(r.drawn).toBe(90);
    expect(value("knee_flexion", leg(120)).value).toBe(120);
    expect(value("knee_flexion", leg(35)).value).toBe(35);
  });
  it("reads a knee that stops short of straight as minus in extension", () => {
    expect(value("knee_extension", leg(8)).value).toBe(-8);
    expect(value("knee_extension", leg(15)).value).toBe(-15);
  });
  it("reads past straight as plus in extension and minus in flexion when told it is the other way", () => {
    expect(value("knee_extension", leg(6), { opposite: true }).value).toBe(6);
    expect(value("knee_flexion", leg(6), { opposite: true }).value).toBe(-6);
  });
  it("is the same whichever way the knee points in the picture", () => {
    const [h, k, a] = leg(70);
    const mirrored = [h, k, a].map((p) => mirrorPoint(p, IMG));
    const turned = [h, k, a].map((p) => rotatePointClockwise(p, IMG));
    expect(value("knee_flexion", mirrored).value).toBe(70);
    expect(value("knee_flexion", turned).value).toBe(70);
  });
  it("rounds to a whole degree", () => {
    expect(value("knee_flexion", leg(40.4)).value).toBe(40);
    expect(value("knee_flexion", leg(40.6)).value).toBe(41);
  });
});

describe("other conventions", () => {
  it("reads the elbow like the knee", () => {
    const shoulder = { x: 200, y: 300 };
    const elbow = at(0, 250, shoulder);
    const wrist = at(110, 230, elbow);
    expect(value("elbow_flexion", [shoulder, elbow, wrist]).value).toBe(110);
  });
  it("reads shoulder flexion as the angle from the trunk: 0 by the side, 90 forward, 180 overhead", () => {
    const hip = { x: 400, y: 600 };
    const shoulder = { x: 400, y: 300 };
    expect(value("shoulder_flexion", [hip, shoulder, { x: 400, y: 500 }]).value).toBe(0);
    expect(value("shoulder_flexion", [hip, shoulder, { x: 650, y: 300 }]).value).toBe(90);
    expect(value("shoulder_flexion", [hip, shoulder, { x: 400, y: 80 }]).value).toBe(180);
    expect(value("shoulder_flexion", [hip, shoulder, { x: 650, y: 300 }], { opposite: true }).value).toBe(-90);
  });
  it("reads shoulder abduction of 90 with the arm straight out from the trunk", () => {
    expect(value("shoulder_abduction", [{ x: 400, y: 700 }, { x: 400, y: 300 }, { x: 650, y: 300 }]).value).toBe(90);
  });
  it("reads the ankle from a right angle: toes towards the shin close the angle and read as dorsiflexion", () => {
    const knee = { x: 400, y: 100 };
    const ankle = { x: 400, y: 500 };
    const neutral = { x: 650, y: 500 };
    expect(value("ankle_dorsiflexion", [knee, ankle, neutral]).value).toBe(0);
    const toward = { x: ankle.x + 250 * Math.cos((20 * Math.PI) / 180), y: ankle.y - 250 * Math.sin((20 * Math.PI) / 180) };
    expect(interiorAngle(knee, ankle, toward)).toBeCloseTo(70, 5);
    expect(value("ankle_dorsiflexion", [knee, ankle, toward]).value).toBe(20);
    expect(value("ankle_plantarflexion", [knee, ankle, toward]).value).toBe(-20);
  });
  it("reads plantarflexion as positive when the foot points away", () => {
    const knee = { x: 400, y: 100 };
    const ankle = { x: 400, y: 500 };
    const pointed = { x: ankle.x + 250 * Math.cos((40 * Math.PI) / 180), y: ankle.y + 250 * Math.sin((40 * Math.PI) / 180) };
    expect(interiorAngle(knee, ankle, pointed)).toBeCloseTo(130, 5);
    expect(value("ankle_plantarflexion", [knee, ankle, pointed]).value).toBe(40);
    expect(value("ankle_dorsiflexion", [knee, ankle, pointed]).value).toBe(-40);
  });
  it("reads hip abduction from the line between the hip bones: 0 with the thigh square to it", () => {
    const other = { x: 200, y: 400 };
    const asis = { x: 450, y: 400 };
    expect(value("hip_abduction", [other, asis, { x: 450, y: 800 }]).value).toBe(0);
    const thirty = { x: asis.x + 400 * Math.sin((30 * Math.PI) / 180), y: asis.y + 400 * Math.cos((30 * Math.PI) / 180) };
    expect(value("hip_abduction", [other, asis, thirty]).value).toBe(30);
  });
  it("reads a rotation as the angle of the forearm from upright, and from down for the shin", () => {
    const elbow = { x: 500, y: 500 };
    const wrist = at(-90 + 40, 250, elbow);
    expect(value("shoulder_external_rotation", [elbow, wrist]).value).toBe(40);
    const knee = { x: 500, y: 200 };
    const ankle = at(90 - 25, 300, knee);
    expect(value("hip_internal_rotation", [knee, ankle]).value).toBe(25);
    expect(value("shoulder_internal_rotation", [elbow, { x: 500, y: 250 }]).value).toBe(0);
  });
  it("uses a drawn upright when one is given", () => {
    const elbow = { x: 500, y: 500 };
    const wrist = { x: 700, y: 500 };
    const lean = { x: 1, y: 0 };
    expect(value("shoulder_external_rotation", [elbow, wrist], { upright: lean }).value).toBe(0);
    expect(value("shoulder_external_rotation", [elbow, wrist]).value).toBe(90);
  });
});

describe("refusals", () => {
  it("refuses an unknown movement and neck rotation", () => {
    expect(measureAngle({ movement: "neck_rotation", points: [], image: IMG })).toMatchObject({ ok: false, code: "unknown_movement" });
    expect(measureAngle({ movement: "nope", points: [], image: IMG })).toMatchObject({ ok: false, code: "unknown_movement" });
  });
  it("refuses until every point is placed", () => {
    const [h, k] = leg(30);
    expect(measureAngle({ movement: "knee_flexion", points: [h, k, null], image: IMG })).toMatchObject({ ok: false, code: "missing_points" });
    expect(measureAngle({ movement: "knee_flexion", points: [h], image: IMG })).toMatchObject({ ok: false, code: "missing_points" });
  });
  it("refuses points that are too close or on top of each other", () => {
    const [h, k] = leg(30);
    expect(measureAngle({ movement: "knee_flexion", points: [h, k, { x: k.x + 3, y: k.y + 3 }], image: IMG })).toMatchObject({ ok: false, code: "too_close" });
    expect(measureAngle({ movement: "knee_flexion", points: [h, h, k], image: IMG })).toMatchObject({ ok: false, code: "too_close" });
    expect(measureAngle({ movement: "knee_flexion", points: [h, k, h], image: IMG })).toMatchObject({ ok: false, code: "too_close" });
    expect(measureAngle({ movement: "hip_internal_rotation", points: [h, { x: h.x + 1, y: h.y }], image: IMG })).toMatchObject({ ok: false, code: "too_close" });
  });
  it("refuses a limb folded back along itself where straight is 0", () => {
    const hip = { x: 300, y: 300 };
    const knee = { x: 600, y: 300 };
    expect(measureAngle({ movement: "knee_flexion", points: [hip, knee, { x: 450, y: 300 }], image: IMG })).toMatchObject({ ok: false, code: "folded" });
  });
  it("refuses a picture with no size and a point that is not a number", () => {
    expect(measureAngle({ movement: "knee_flexion", points: leg(30), image: { width: 0, height: 100 } })).toMatchObject({ ok: false, code: "bad_image" });
    const [h, k] = leg(30);
    expect(measureAngle({ movement: "knee_flexion", points: [h, k, { x: NaN, y: 1 }], image: IMG })).toMatchObject({ ok: false, code: "missing_points" });
  });
});

describe("warnings", () => {
  const codes = (r: ReturnType<typeof value>) => r.warnings.map((w) => w.code);
  it("is quiet for a clear, large, side-on picture", () => {
    expect(value("knee_flexion", leg(60)).warnings).toEqual([]);
  });
  it("warns when the limb fills a small part of the picture", () => {
    const hip = { x: 500, y: 400 };
    const knee = { x: 540, y: 400 };
    const ankle = at(60, 40, knee);
    expect(codes(value("knee_flexion", [hip, knee, ankle]))).toContain("small_frame");
  });
  it("warns about foreshortening when one segment is under 15% of the other", () => {
    const hip = { x: 100, y: 400 };
    const knee = { x: 700, y: 400 };
    const near = at(60, 80, knee); // 80 / 600 = 13%
    expect(codes(value("knee_flexion", [hip, knee, near]))).toContain("foreshortened");
    const ok = at(60, 100, knee); // 100 / 600 = 17%
    expect(codes(value("knee_flexion", [hip, knee, ok]))).not.toContain("foreshortened");
  });
  it("warns about a point outside the picture", () => {
    const [h, k] = leg(30);
    expect(codes(value("knee_flexion", [h, k, { x: 1200, y: 500 }]))).toContain("outside_image");
  });
  it("warns about a tilted reference line only past the tolerance", () => {
    expect(codes(value("knee_flexion", leg(60), { referenceTiltDegrees: 1.5 }))).not.toContain("tilted_reference");
    expect(codes(value("knee_flexion", leg(60), { referenceTiltDegrees: -4 }))).toContain("tilted_reference");
  });
  it("warns about a reading far outside what a joint reaches", () => {
    expect(codes(value("knee_flexion", leg(165)))).toContain("out_of_range");
    expect(codes(value("knee_flexion", leg(100)))).not.toContain("out_of_range");
  });
  it("says a change inside the photo's error is not evidence of change", () => {
    expect(codes(value("knee_flexion", leg(60), { previous: 55 }))).toContain("within_error");
    expect(codes(value("knee_flexion", leg(60), { previous: 40 }))).not.toContain("within_error");
    expect(codes(value("knee_flexion", leg(60), { previous: null }))).not.toContain("within_error");
  });
  it("names the number as an estimate in its sentence", () => {
    const r = value("knee_flexion", leg(90));
    expect(r.text).toContain("estimated from a photo");
    expect(r.text).toContain("90");
  });
});

describe("the table", () => {
  it("covers every movement in the registry that has landmarks, and only those", () => {
    for (const m of JOINT_MOVEMENTS) {
      const hasLandmarks = JOINT_LANDMARKS[m.key]?.fixedArm !== "Not used";
      expect(canMeasureFromImage(m.key), m.key).toBe(hasLandmarks);
    }
    for (const key of Object.keys(ANGLE_MOVEMENTS)) {
      expect(JOINT_MOVEMENTS.some((m) => m.key === key), key).toBe(true);
      expect(ANGLE_MOVEMENTS[key].movement).toBe(key);
    }
  });
  it("has three landmarks (two for a rotation), each named and described", () => {
    for (const def of Object.values(ANGLE_MOVEMENTS)) {
      expect(def.landmarks.length).toBe(def.rule === "from_vertical" ? 2 : 3);
      for (const l of def.landmarks) {
        expect(l.label.length).toBeGreaterThan(0);
        expect(l.where.length).toBeGreaterThan(0);
      }
      expect(new Set(def.landmarks.map((l) => l.key)).size).toBe(def.landmarks.length);
    }
  });
  it("gives a plain accuracy explanation that never claims equality with a goniometer", () => {
    const text = ACCURACY_EXPLAINER.join(" ");
    expect(text).toMatch(/estimate/i);
    expect(text).toMatch(/not equal to a goniometer/i);
    expect(text).toMatch(/5 degrees/);
    expect(text).toMatch(/10/);
    expect(text).toMatch(/side-on/);
  });
  it("finds a movement's geometry", () => {
    expect(angleMovementFor("knee_extension")?.usualSign).toBe(-1);
    expect(angleMovementFor("neck_rotation")).toBeNull();
  });
});
