import { describe, expect, it } from "vitest";
import { clockEventFor, displayForTimerEvent } from "@/lib/timerClock";
import { SESSION_PROTOCOLS } from "@/lib/sessionProtocols";

const steps = SESSION_PROTOCOLS.flatMap((p) => p.steps);
const byTool = (tool: string) => steps.filter((s) => s.tool === tool);

describe("displayForTimerEvent", () => {
  it("starts the patient's clock for every timed step, whatever the timer", () => {
    for (const tool of ["timed_trials", "counter_30s", "counter_60s", "balance_holds"]) {
      const list = byTool(tool).filter((s) => s.clock);
      expect(list.length, tool).toBeGreaterThan(0);
      for (const s of list) expect(displayForTimerEvent(s, "start")).toMatchObject({ phase: "go", startClock: true });
    }
  });

  it("counts up for trials and down for fixed-length holds and counts (the step decides)", () => {
    const trial = byTool("timed_trials").find((s) => s.clock)!;
    const hold = byTool("balance_holds")[0];
    expect(trial.clock).toEqual({ kind: "count_up" });
    expect(hold.clock).toEqual({ kind: "countdown", seconds: 10 });
    expect(byTool("counter_60s")[0].clock).toEqual({ kind: "countdown", seconds: 60 });
  });

  it("finish is Done and abort is Rest, and neither starts a clock", () => {
    for (const s of steps.filter((x) => x.clock)) {
      expect(displayForTimerEvent(s, "finish")).toMatchObject({ phase: "done", startClock: false });
      expect(displayForTimerEvent(s, "abort")).toMatchObject({ phase: "rest", startClock: false });
    }
  });

  it("a step without a clock gets a plain Go", () => {
    const s = steps.find((x) => !x.clock)!;
    expect(displayForTimerEvent(s, "start")).toMatchObject({ phase: "go", startClock: false });
  });
});

describe("clockEventFor", () => {
  it("start on the rising edge, finish on the falling one, nothing otherwise", () => {
    expect(clockEventFor(false, true, false)).toBe("start");
    expect(clockEventFor(true, false, false)).toBe("finish");
    expect(clockEventFor(true, true, false)).toBeNull();
    expect(clockEventFor(false, false, false)).toBeNull();
  });
  it("an announced abort swallows the stop that follows", () => {
    expect(clockEventFor(true, false, true)).toBeNull();
    expect(clockEventFor(false, true, true)).toBe("start");
  });
});
