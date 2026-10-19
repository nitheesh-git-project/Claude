import { describe, expect, it } from "vitest";
import { PAIN_MAP_REGIONS, painMapPointLabel, painMapSideDirection } from "./painMap";

describe("painMapSideDirection", () => {
  it("puts the patient's left on the reader's right on the front figure", () => {
    expect(painMapSideDirection("front", "left")).toBe(1);
    expect(painMapSideDirection("front", "right")).toBe(-1);
  });

  it("puts the patient's left on the reader's left on the back figure", () => {
    expect(painMapSideDirection("back", "left")).toBe(-1);
    expect(painMapSideDirection("back", "right")).toBe(1);
  });

  it("keeps a midline region on the centreline in both views", () => {
    expect(painMapSideDirection("front", "na")).toBe(0);
    expect(painMapSideDirection("back", "na")).toBe(0);
  });

  it("mirrors each side between the two views", () => {
    for (const side of ["left", "right"] as const) {
      expect(painMapSideDirection("front", side)).toBe(-painMapSideDirection("back", side));
    }
  });
});

describe("painMapPointLabel", () => {
  // Every tap point on the body map is announced by this name; the figure
  // used to give them none, so a screen-reader user could not answer the
  // intake's "where does it hurt?".
  it("names a midline region by itself and a paired one with its side", () => {
    expect(painMapPointLabel("lower_back", "na")).toBe("Lower back");
    expect(painMapPointLabel("knee", "left")).toBe("Knee, left side");
    expect(painMapPointLabel("wrist_hand", "right")).toBe("Wrist / Hand, right side");
  });

  it("adds the exam's score on the one scale the screens use", () => {
    expect(painMapPointLabel("knee", "left", { percent: 60 })).toBe("Knee, left side: pain 6/10");
    expect(painMapPointLabel("neck", "na", { percent: 35 })).toBe("Neck: pain 3.5/10");
  });

  it("gives all 17 regions, on every side they have, a distinct name", () => {
    const names = PAIN_MAP_REGIONS.flatMap((r) =>
      r.paired
        ? [painMapPointLabel(r.key, "left"), painMapPointLabel(r.key, "right")]
        : [painMapPointLabel(r.key, "na")]
    );
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).not.toMatch(/_/);
  });
});
