import { describe, expect, it } from "vitest";
import type { LiveDisplayView } from "@/lib/assessmentRun";
import {
  COMPANION_POLL_MS,
  ENDED_SCREEN_MAX_AGE_MS,
  LIVE_SCREEN_MAX_AGE_MS,
  PICTURE_DESCRIPTIONS,
  clockIsRunning,
  clockShown,
  companionMoment,
  formatClockSeconds,
  liveAnnouncement,
  serverOffsetMs,
  WAITING_TEXT,
} from "@/lib/companionScreen";
import { PATIENT_PICTURES, containsClinicWord } from "@/lib/sessionProtocols";

const NOW = Date.parse("2026-10-26T12:00:00.000Z");

function view(over: Partial<LiveDisplayView> = {}): LiveDisplayView {
  return {
    runId: "r",
    stepId: "chair_stand",
    phase: "go",
    clock: null,
    text: { progress: "Step 6 of 8", title: "30-second chair stand", line: "Stand up and sit down.", picture: "chair_stand" },
    ended: false,
    updatedAt: new Date(NOW - 5_000).toISOString(),
    ...over,
  };
}

describe("companionMoment", () => {
  it("waits when there is no row", () => {
    expect(companionMoment(null, NOW)).toEqual({ kind: "waiting" });
  });
  it("is live for a recent row", () => {
    expect(companionMoment(view(), NOW).kind).toBe("live");
  });
  it("shows All done for a short while after the end, then waits", () => {
    const ended = view({ ended: true, updatedAt: new Date(NOW - 60_000).toISOString() });
    expect(companionMoment(ended, NOW).kind).toBe("ended");
    expect(companionMoment({ ...ended, updatedAt: new Date(NOW - ENDED_SCREEN_MAX_AGE_MS - 1).toISOString() }, NOW).kind).toBe("waiting");
  });
  it("does not hold a forgotten run on screen forever", () => {
    expect(companionMoment(view({ updatedAt: new Date(NOW - LIVE_SCREEN_MAX_AGE_MS - 1).toISOString() }), NOW).kind).toBe("waiting");
  });
  it("treats an unreadable time as waiting", () => {
    expect(companionMoment(view({ updatedAt: "nonsense" }), NOW).kind).toBe("waiting");
  });
});

describe("the clock", () => {
  it("corrects for a device clock that is wrong", () => {
    // The device thinks it is 40 s earlier than the server.
    const offset = serverOffsetMs(new Date(NOW).toISOString(), NOW - 40_000);
    expect(offset).toBe(40_000);
    const v = view({ clock: { mode: "countdown", seconds: 30, startedAt: new Date(NOW - 10_000).toISOString() } });
    // Device now = NOW - 40 s; server now = NOW; 10 s elapsed -> 20 left.
    expect(clockShown(v, NOW - 40_000, offset)?.seconds).toBe(20);
  });
  it("counts down, never below zero, and says Finished", () => {
    const v = view({ clock: { mode: "countdown", seconds: 30, startedAt: new Date(NOW - 45_000).toISOString() } });
    const shown = clockShown(v, NOW, 0);
    expect(shown).toMatchObject({ seconds: 0, text: "0", label: "Finished", tone: "finished" });
    expect(clockIsRunning(v, NOW, 0)).toBe(false);
  });
  it("labels the 3-2-1 and counts up", () => {
    const ready = view({
      phase: "ready",
      clock: { mode: "countdown", seconds: 3, startedAt: new Date(NOW - 1_000).toISOString() },
      text: { ...view().text, clockLabel: "Starting in" },
    });
    expect(clockShown(ready, NOW, 0)).toMatchObject({ seconds: 2, label: "Starting in", tone: "ready" });
    const up = view({ clock: { mode: "count_up", startedAt: new Date(NOW - 65_000).toISOString() }, text: { ...view().text, clockLabel: "Time" } });
    expect(clockShown(up, NOW, 0)).toMatchObject({ seconds: 65, text: "1:05", label: "Time" });
    expect(clockIsRunning(up, NOW, 0)).toBe(true);
  });
  it("has no clock when the step has none", () => {
    expect(clockShown(view(), NOW, 0)).toBeNull();
  });
  it("ignores an unreadable server time", () => {
    expect(serverOffsetMs("nope", NOW)).toBe(0);
  });
  it("prints the plainest number", () => {
    expect(formatClockSeconds(9)).toBe("9");
    expect(formatClockSeconds(60)).toBe("1:00");
    expect(formatClockSeconds(360)).toBe("6:00");
    expect(formatClockSeconds(3723)).toBe("1:02:03");
    expect(formatClockSeconds(-4)).toBe("0");
  });
});

describe("the rest", () => {
  it("describes every picture the server can name", () => {
    for (const p of PATIENT_PICTURES) expect(PICTURE_DESCRIPTIONS[p]).toBeTruthy();
  });
  it("announces the step to a screen reader", () => {
    expect(liveAnnouncement({ kind: "live", view: view() })).toBe("Step 6 of 8. 30-second chair stand. Stand up and sit down.");
    expect(liveAnnouncement({ kind: "waiting" })).toContain("Waiting");
  });
  it("keeps clinic words off the waiting screen and the picture descriptions", () => {
    for (const text of [...Object.values(WAITING_TEXT), ...Object.values(PICTURE_DESCRIPTIONS)]) {
      expect(containsClinicWord(text)).toBeNull();
    }
  });
  it("polls every three seconds", () => {
    expect(COMPANION_POLL_MS).toBe(3000);
  });
});
