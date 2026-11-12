import { describe, expect, it } from "vitest";
import { shortBrandName } from "./brandName";

describe("the phone header's brand name", () => {
  it("shows the brand word, not the whole line", () => {
    expect(shortBrandName("MoveRestore Physiotherapy")).toBe("MoveRestore");
  });
  it("leaves a single word, and a short first word, alone", () => {
    expect(shortBrandName("MoveRestore")).toBe("MoveRestore");
    expect(shortBrandName("Dr Pooja Physio")).toBe("Dr Pooja Physio");
    expect(shortBrandName("  ")).toBe("");
  });
});
