import { describe, expect, it } from "vitest";
import { ANGLE_MOVEMENTS } from "@/lib/angleMeasure";
import { framingGuideFor } from "@/lib/angleFraming";
import { landmarksFor } from "@/lib/jointLandmarks";

describe("framingGuideFor", () => {
  it("has a guide for every movement the image tool offers, and none for the neck", () => {
    for (const key of Object.keys(ANGLE_MOVEMENTS)) expect(framingGuideFor(key), key).not.toBeNull();
    expect(framingGuideFor("neck_rotation")).toBeNull();
    expect(framingGuideFor("nope")).toBeNull();
  });
  it("uses the handbook's position and covers the points a clinician has to get right", () => {
    for (const key of Object.keys(ANGLE_MOVEMENTS)) {
      const g = framingGuideFor(key)!;
      expect(g.position).toBe(landmarksFor(key)!.position);
      const text = g.steps.join(" ").toLowerCase();
      for (const word of ["height of the joint", "whole limb", "plain", "contrast", "level", "same distance", "hold still for 2 seconds", "cannot move"]) {
        expect(text, `${key}: ${word}`).toContain(word);
      }
      expect(g.steps.length).toBeGreaterThanOrEqual(8);
    }
  });
  it("puts the knee side-on and the hip abduction front-on", () => {
    expect(framingGuideFor("knee_flexion")!.view).toBe("side");
    expect(framingGuideFor("hip_abduction")!.view).toBe("front");
    expect(framingGuideFor("shoulder_external_rotation")!.view).toBe("along_arm");
  });
});
