import { describe, expect, it } from "vitest";
import { cockpitBriefing } from "@/lib/cockpitBriefing";

describe("Before you start (B5)", () => {
  it("names the last note's watch and plan, the precautions and the affected side", () => {
    const b = cockpitBriefing({
      lastNote: { status: "ok", note: { data: { red_flags: "Night pain", next_plan: "Progress to loaded hinge" }, dateLabel: "20 Oct 2026" } },
      intake: { status: "ok", data: { neuro_affected_side: "Left side" } },
      contraFlags: ["high_fall_risk"],
      profileKind: "neuro",
    });
    expect(b.items.map((i) => i.key)).toEqual(["watch", "plan", "precaution_high_fall_risk", "affected_side"]);
    expect(b.items[1].label).toBe("Plan from last session (20 Oct 2026)");
    expect(b.oneLine).toBe("Watch: Night pain · Plan: Progress to loaded hinge · Fall risk · Affected: left side");
    expect(b.startSide).toBe("left");
  });
  it("says couldn't check for a read that failed, never nothing", () => {
    const b = cockpitBriefing({ lastNote: { status: "unreadable" }, intake: { status: "unreadable" }, contraFlags: null, profileKind: null });
    expect(b.items.map((i) => i.tone)).toEqual(["unchecked", "unchecked"]);
    expect(b.oneLine).toMatch(/couldn't check/);
  });
  it("is empty when nothing is on record, and asks ON or OFF on a Parkinson's run", () => {
    expect(cockpitBriefing({ lastNote: { status: "ok", note: null }, intake: { status: "no_profile" }, contraFlags: [], profileKind: "ortho" }).items).toEqual([]);
    const pd = cockpitBriefing({
      lastNote: { status: "ok", note: null },
      intake: { status: "ok", data: { neuro_pd_medication_times: "7 am, 1 pm" } },
      contraFlags: [],
      profileKind: "neuro_parkinsons",
    });
    expect(pd.items[0].text).toMatch(/^Usual medicine times: 7 am, 1 pm\. Ask whether they are ON or OFF/);
  });
});
