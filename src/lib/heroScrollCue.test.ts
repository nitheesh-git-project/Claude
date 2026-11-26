import { describe, it, expect } from "vitest";
import { heroCueAtTop, HERO_CUE_HIDE_AFTER_PX } from "./heroScrollCue";

describe("hero scroll cue", () => {
  it("steps aside on a slight scroll, not after 120 px", () => {
    expect(heroCueAtTop(0)).toBe(true);
    expect(heroCueAtTop(HERO_CUE_HIDE_AFTER_PX - 1)).toBe(true);
    expect(heroCueAtTop(HERO_CUE_HIDE_AFTER_PX)).toBe(false);
    expect(HERO_CUE_HIDE_AFTER_PX).toBeLessThanOrEqual(10);
  });
});
