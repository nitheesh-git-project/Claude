import { describe, expect, it } from "vitest";
import {
  BALANCE_HOLD_MS,
  SIX_MINUTE_WALK_MS,
  SIX_MINUTE_WALK_PHRASES,
  SIX_MINUTE_WALK_SAFETY_CHECKS,
  abortCountdown,
  adjustCount,
  balanceHeldMs,
  balanceResult,
  clockDisagreement,
  countdownRemainingMs,
  createBalance,
  createCountdown,
  currentBalanceStage,
  endBalanceStage,
  formatCountdown,
  formatStopwatch,
  IDLE_STOPWATCH,
  msToNextPhrase,
  msToSeconds,
  needsThirdReading,
  phraseAt,
  preTestConcerns,
  safetyChecklistComplete,
  secondsToSpeeds,
  settleBalance,
  settleCountdown,
  sixMinuteWalkDistance,
  sixMinuteWalkPrediction,
  startBalanceStage,
  startCountdown,
  startStopwatch,
  stopStopwatch,
  stopwatchElapsedMs,
  summariseTrials,
  unticked,
  vitalsProblems,
} from "@/lib/testTimers";

describe("stopwatch", () => {
  it("measures from the start timestamp, whatever happened to the ticks in between", () => {
    const running = startStopwatch(IDLE_STOPWATCH, 1_000);
    // A background tab that rendered nothing for 40 seconds is still right.
    expect(stopwatchElapsedMs(running, 41_000)).toBe(40_000);
    const stopped = stopStopwatch(running, 8_400);
    expect(stopped.status).toBe("stopped");
    expect(stopwatchElapsedMs(stopped, 99_999)).toBe(7_400);
  });
  it("never reads negative if the clock goes back", () => {
    const running = startStopwatch(IDLE_STOPWATCH, 5_000);
    expect(stopwatchElapsedMs(running, 4_000)).toBe(0);
    expect(stopwatchElapsedMs(stopStopwatch(running, 4_000), 0)).toBe(0);
  });
  it("ignores a second start and a stop when idle", () => {
    const running = startStopwatch(IDLE_STOPWATCH, 1_000);
    expect(startStopwatch(running, 9_000)).toBe(running);
    expect(stopStopwatch(IDLE_STOPWATCH, 9_000)).toBe(IDLE_STOPWATCH);
  });
});

describe("countdown", () => {
  it("counts down from a timestamp and finishes exactly once", () => {
    let c = startCountdown(createCountdown(30_000), 10_000);
    expect(countdownRemainingMs(c, 10_000)).toBe(30_000);
    expect(countdownRemainingMs(c, 25_000)).toBe(15_000);
    expect(settleCountdown(c, 39_999).status).toBe("running");
    c = settleCountdown(c, 40_000);
    expect(c.status).toBe("finished");
    expect(countdownRemainingMs(c, 999_999)).toBe(0);
    expect(settleCountdown(c, 999_999)).toBe(c);
  });
  it("finishes even if the first tick after the end is minutes late", () => {
    const c = settleCountdown(startCountdown(createCountdown(SIX_MINUTE_WALK_MS), 0), 10 * 60_000);
    expect(c.status).toBe("finished");
  });
  it("can be aborted while running and not started with no duration", () => {
    const running = startCountdown(createCountdown(30_000), 0);
    expect(abortCountdown(running).status).toBe("aborted");
    expect(startCountdown(createCountdown(0), 0).status).toBe("idle");
    expect(abortCountdown(createCountdown(30_000)).status).toBe("idle");
  });
});

describe("clock faces", () => {
  it("formats a stopwatch in tenths", () => {
    expect(formatStopwatch(0)).toBe("0:00.0");
    expect(formatStopwatch(7_450)).toBe("0:07.4");
    expect(formatStopwatch(83_900)).toBe("1:23.9");
    expect(formatStopwatch(-5)).toBe("0:00.0");
  });
  it("rounds a countdown up so it reads 0:00 only at the end", () => {
    expect(formatCountdown(SIX_MINUTE_WALK_MS)).toBe("6:00");
    expect(formatCountdown(359_001)).toBe("6:00");
    expect(formatCountdown(1)).toBe("0:01");
    expect(formatCountdown(0)).toBe("0:00");
  });
  it("converts to seconds at tenth precision", () => {
    expect(msToSeconds(7_449)).toBe(7.4);
    expect(msToSeconds(7_450)).toBe(7.5);
  });
});

describe("clockDisagreement", () => {
  it("accepts two clocks that agree and flags a sleep", () => {
    expect(clockDisagreement(30_000, 30_400)).toBe(false);
    expect(clockDisagreement(30_000, 90_000)).toBe(true);
    expect(clockDisagreement(Number.NaN, 1)).toBe(true);
  });
});

describe("summariseTrials", () => {
  it("returns average, best and median and keeps the one the rule names", () => {
    const s = summariseTrials([10.2, 9.8, 10.6], { keep: "average" }, "lower", 1);
    expect(s).toMatchObject({ count: 3, average: 10.2, best: 9.8, median: 10.2, kept: 10.2 });
    expect(summariseTrials([10.2, 9.8, 10.6], { keep: "best" }, "lower", 1).kept).toBe(9.8);
    expect(summariseTrials([20, 35, 28], { keep: "best" }, "higher", 0).kept).toBe(35);
    expect(summariseTrials([90, 100, 94], { keep: "median" }, "toward_normal", 0).kept).toBe(94);
  });
  it("has no best for a measure with no better direction", () => {
    const s = summariseTrials([1, 2], { keep: "best" }, "hold", 0);
    expect(s.best).toBeNull();
    expect(s.kept).toBeNull();
  });
  it("is empty for no trials and does not mutate its input", () => {
    expect(summariseTrials([], { keep: "average" }, "lower", 1).kept).toBeNull();
    const input = [3, 1, 2];
    summariseTrials(input, { keep: "median" }, "lower", 0);
    expect(input).toEqual([3, 1, 2]);
  });
  it("asks for a third goniometer reading only when two differ by more than 5", () => {
    expect(needsThirdReading([90, 96])).toBe(true);
    expect(needsThirdReading([90, 95])).toBe(false);
    expect(needsThirdReading([90, 96, 93])).toBe(false);
  });
});

describe("secondsToSpeeds", () => {
  it("turns timed trials over a marked distance into m/s", () => {
    const r = secondsToSpeeds([10, 12.5], 10);
    expect(r).toMatchObject({ ok: true, value: [1, 0.8] });
  });
  it("names the trial that cannot be used", () => {
    const r = secondsToSpeeds([10, 0], 10);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Trial 2/);
  });
});

describe("chair stand counter", () => {
  it("stays between 0 and the ceiling", () => {
    expect(adjustCount(0, -1)).toBe(0);
    expect(adjustCount(39, 1)).toBe(40);
    expect(adjustCount(40, 1)).toBe(40);
    expect(adjustCount(5, 1)).toBe(6);
  });
});

describe("balance holds", () => {
  it("moves on only after ten seconds are held, and finishes at four", () => {
    let b = createBalance();
    expect(currentBalanceStage(b)).toBe(0);
    expect(balanceResult(b)).toBeNull();
    for (let stage = 0; stage < 4; stage += 1) {
      const t0 = stage * 20_000;
      b = startBalanceStage(b, t0);
      expect(balanceHeldMs(b, stage, t0 + 4_000)).toBe(4_000);
      b = settleBalance(b, t0 + BALANCE_HOLD_MS);
      expect(b.stages[stage].state).toBe("held");
    }
    expect(balanceResult(b)).toBe(4);
    expect(currentBalanceStage(b)).toBeNull();
  });
  it("ends the test at the first stage not held and scores the stages before it", () => {
    let b = createBalance();
    b = settleBalance(startBalanceStage(b, 0), 10_000);
    b = startBalanceStage(b, 20_000);
    b = endBalanceStage(b, 26_000);
    expect(b.stages[1].state).toBe("not_held");
    expect(b.stages[1].heldMs).toBe(6_000);
    expect(balanceResult(b)).toBe(1);
    // Cannot carry on to stage 3.
    expect(startBalanceStage(b, 40_000)).toBe(b);
  });
  it("counts a hold that ran to ten seconds before the tap as held", () => {
    let b = startBalanceStage(createBalance(), 0);
    b = endBalanceStage(b, 12_000);
    expect(b.stages[0].state).toBe("held");
  });
  it("scores zero when the first stage is not held", () => {
    const b = endBalanceStage(startBalanceStage(createBalance(), 0), 3_000);
    expect(balanceResult(b)).toBe(0);
  });
  it("does not start a stage twice", () => {
    const once = startBalanceStage(createBalance(), 0);
    expect(startBalanceStage(once, 5_000)).toBe(once);
  });
});

describe("six-minute walk phrases", () => {
  it("says the five standard phrases at the five minute marks, word for word", () => {
    expect(SIX_MINUTE_WALK_PHRASES.map((p) => p.phrase)).toEqual([
      "You are doing well. You have 5 minutes to go.",
      "Keep up the good work. You have 4 minutes to go.",
      "You are doing well. You are halfway done.",
      "Keep up the good work. You have only 2 minutes left.",
      "You are doing well. You have only 1 minute to go.",
    ]);
  });
  it("shows nothing before the first minute and the right one after", () => {
    expect(phraseAt(0)).toBeNull();
    expect(phraseAt(59_999)).toBeNull();
    expect(phraseAt(60_000)?.minute).toBe(1);
    expect(phraseAt(185_000)?.phrase).toBe("You are doing well. You are halfway done.");
    expect(phraseAt(SIX_MINUTE_WALK_MS)?.minute).toBe(5);
  });
  it("counts to the next phrase and stops after the last", () => {
    expect(msToNextPhrase(0)).toBe(60_000);
    expect(msToNextPhrase(59_000)).toBe(1_000);
    expect(msToNextPhrase(300_000)).toBeNull();
  });
});

describe("six-minute walk safety and distance", () => {
  it("is complete only when every check is ticked", () => {
    const all = SIX_MINUTE_WALK_SAFETY_CHECKS.map((c) => c.key);
    expect(safetyChecklistComplete([])).toBe(false);
    expect(safetyChecklistComplete(all.slice(1))).toBe(false);
    expect(unticked(all.slice(1)).map((c) => c.key)).toEqual([all[0]]);
    expect(safetyChecklistComplete(new Set(all))).toBe(true);
  });
  it("adds laps and the last part lap", () => {
    expect(sixMinuteWalkDistance({ laps: 12, partLapMetres: 25 })).toMatchObject({ ok: true, value: 745 });
    expect(sixMinuteWalkDistance({ laps: 0, partLapMetres: 0 })).toMatchObject({ ok: true, value: 0 });
    expect(sixMinuteWalkDistance({ laps: 5, partLapMetres: 10, lapMetres: 50 })).toMatchObject({ ok: true, value: 260 });
  });
  it("refuses a part lap that is a whole lap, a fractional lap count and nonsense", () => {
    expect(sixMinuteWalkDistance({ laps: 3, partLapMetres: 60 }).ok).toBe(false);
    expect(sixMinuteWalkDistance({ laps: 3.5, partLapMetres: 0 }).ok).toBe(false);
    expect(sixMinuteWalkDistance({ laps: -1, partLapMetres: 0 }).ok).toBe(false);
    expect(sixMinuteWalkDistance({ laps: 3, partLapMetres: -4 }).ok).toBe(false);
    expect(sixMinuteWalkDistance({ laps: 3, partLapMetres: 0, lapMetres: 0 }).ok).toBe(false);
  });
});

describe("vitals", () => {
  it("accepts possible readings and every field is optional", () => {
    expect(vitalsProblems({})).toEqual([]);
    expect(vitalsProblems({ heartRate: 72, systolic: 128, diastolic: 80, spo2: 96, breathlessness: 2, legTiredness: 0 })).toEqual([]);
  });
  it("names each impossible reading", () => {
    expect(vitalsProblems({ heartRate: 400 })).toHaveLength(1);
    expect(vitalsProblems({ spo2: 101 })).toHaveLength(1);
    expect(vitalsProblems({ breathlessness: 11 })).toHaveLength(1);
    expect(vitalsProblems({ systolic: 80, diastolic: 90 })).toHaveLength(1);
    expect(vitalsProblems({ heartRate: 72.5 })).toHaveLength(1);
  });
  it("warns, without locking, when the resting readings bar the walk", () => {
    expect(preTestConcerns({ heartRate: 121 })).toHaveLength(1);
    expect(preTestConcerns({ systolic: 181, diastolic: 90 })).toHaveLength(1);
    expect(preTestConcerns({ systolic: 150, diastolic: 101 })).toHaveLength(1);
    expect(preTestConcerns({ heartRate: 120, systolic: 180, diastolic: 100 })).toEqual([]);
  });
});

describe("sixMinuteWalkPrediction", () => {
  const patient = { sex: "male" as const, ageYears: 60, heightCm: 170, weightKg: 70 };
  it("names the equation and gives the percentage", () => {
    const r = sixMinuteWalkPrediction({ walkedMetres: 400, patient });
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.equation).toMatch(/Enright/);
      expect(r.percent).toBe(Math.round((400 / r.predicted) * 100));
    }
  });
  it("says the equation is not chosen instead of using another population's", () => {
    const r = sixMinuteWalkPrediction({ walkedMetres: 400, patient, equationKey: "indian_adult_tbd" });
    expect(r.status).toBe("equation_not_chosen");
  });
  it("lists the missing details and does not guess", () => {
    const r = sixMinuteWalkPrediction({ walkedMetres: 400, patient: { sex: null, ageYears: 60 } });
    expect(r).toEqual({ status: "needs_details", missing: ["sex", "height", "weight"] });
    expect(sixMinuteWalkPrediction({ walkedMetres: 400, patient: null }).status).toBe("needs_details");
  });
  it("gives a prediction with no percentage before there is a distance", () => {
    const r = sixMinuteWalkPrediction({ walkedMetres: null, patient });
    expect(r.status === "ok" && r.percent).toBeNull();
  });
  it("is unusable for details outside the equation's range", () => {
    expect(sixMinuteWalkPrediction({ walkedMetres: 400, patient: { ...patient, ageYears: 10 } }).status).toBe("unusable");
  });
});
