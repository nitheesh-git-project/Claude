import { describe, expect, it } from "vitest";
import { painMapSideDirection } from "./painMap";

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
