import { describe, expect, it } from "vitest";
import { buildExerciseDisplay, type LiveDisplayView } from "@/lib/assessmentRun";
import { exerciseByKey } from "@/lib/exerciseLibrary";
import { protocolsForProfileKind, teachExercisesStep } from "@/lib/sessionProtocols";
import {
  COMPANION_POLL_MS,
  ENDED_SCREEN_MAX_AGE_MS,
  LIVE_SCREEN_MAX_AGE_MS,
  PICTURE_DESCRIPTIONS,
  asLiveDisplayView,
  asLiveExerciseDemo,
  clockIsRunning,
  clockShown,
  companionMoment,
  formatClockSeconds,
  liveAnnouncement,
  serverOffsetMs,
  UNREADABLE_TEXT,
  WAITING_TEXT,
  showsUnreadable,
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

describe("an unreadable screen", () => {
  it("says it could not load, rather than that the physiotherapist will start soon", () => {
    const waiting = companionMoment(null, NOW);
    expect(showsUnreadable(waiting, true)).toBe(true);
    expect(showsUnreadable(waiting, false)).toBe(false);
    expect(showsUnreadable(companionMoment(view({ ended: true }), NOW), true)).toBe(true);
    expect(liveAnnouncement(waiting, true)).toBe("We couldn't load your screen. Trying again…");
    expect(liveAnnouncement(waiting)).toBe("Waiting for your physiotherapist.");
    expect(UNREADABLE_TEXT.title).not.toMatch(/soon/i);
  });
  it("never takes a live check off the screen for a failed read", () => {
    const live = companionMoment(view(), NOW);
    expect(showsUnreadable(live, true)).toBe(false);
    expect(liveAnnouncement(live, true)).toBe(liveAnnouncement(live));
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
    for (const text of [...Object.values(WAITING_TEXT), ...Object.values(UNREADABLE_TEXT), ...Object.values(PICTURE_DESCRIPTIONS)]) {
      expect(containsClinicWord(text)).toBeNull();
    }
  });
  it("polls every three seconds", () => {
    expect(COMPANION_POLL_MS).toBe(3000);
  });
});

describe("asLiveDisplayView", () => {
  it("accepts exactly the view the route sends", () => {
    const v = view({ clock: { mode: "countdown", seconds: 30, startedAt: new Date(NOW).toISOString() } });
    expect(asLiveDisplayView(JSON.parse(JSON.stringify(v)))).toEqual(v);
    expect(asLiveDisplayView(JSON.parse(JSON.stringify(view())))).toEqual(view());
  });
  it("refuses anything else rather than draw it", () => {
    expect(asLiveDisplayView(null)).toBeNull();
    expect(asLiveDisplayView({})).toBeNull();
    expect(asLiveDisplayView({ ...view(), phase: "dancing" })).toBeNull();
    expect(asLiveDisplayView({ ...view(), text: { ...view().text, picture: "swimming" } })).toBeNull();
    expect(asLiveDisplayView({ ...view(), text: { ...view().text, clockLabel: "Your score" } })).toBeNull();
    expect(asLiveDisplayView({ ...view(), clock: { mode: "countdown", seconds: 0, startedAt: "x" } })).toBeNull();
  });
  it("drops keys it does not know, so a result cannot ride along", () => {
    const sneaky = { ...view(), score: 11, text: { ...view().text, note: "LEFS 40" } };
    const out = asLiveDisplayView(sneaky) as unknown as Record<string, unknown>;
    expect(out.score).toBeUndefined();
    expect((out.text as Record<string, unknown>).note).toBeUndefined();
  });
});

describe("the exercise demo on the companion screen", () => {
  const protocol = protocolsForProfileKind("ortho")[0];
  const step = teachExercisesStep(protocol)!;
  const exercise = exerciseByKey("heel_slide")!;
  const built = (phase: "demo" | "go" | "done") => {
    const b = buildExerciseDisplay({ protocol, step, exercise, phase, index: 1, total: 4 });
    if (!b.ok) throw new Error("not built");
    return b.write;
  };
  const asView = (phase: "demo" | "go" | "done"): LiveDisplayView => ({
    runId: "r",
    stepId: step.id,
    phase,
    clock: null,
    text: built(phase).display,
    ended: false,
    updatedAt: new Date(NOW).toISOString(),
  });

  it("passes the exercise through for every phase, unchanged", () => {
    for (const phase of ["demo", "go", "done"] as const) {
      const v = asView(phase);
      expect(v.text.exercise).toBeDefined();
      const out = asLiveDisplayView(JSON.parse(JSON.stringify(v)));
      expect(out).toEqual(v);
      expect(out!.text.exercise!.counter).toBe("Exercise 2 of 4");
      expect(out!.text.exercise!.steps).toEqual([...exercise.steps]);
    }
  });

  it("says Your turn on the go phase and has no clock", () => {
    const v = asView("go");
    expect(v.text.line).toBe("Your turn. Show us how you do it.");
    expect(v.clock).toBeNull();
    expect(v.text.clockLabel).toBeUndefined();
  });

  it("keeps the patient-safe text patient-safe", () => {
    const v = asView("demo");
    for (const t of [v.text.title, v.text.line, v.text.sub ?? "", ...v.text.exercise!.steps]) expect(containsClinicWord(t)).toBeNull();
  });

  it("refuses a view whose exercise it cannot vouch for", () => {
    const good = JSON.parse(JSON.stringify(asView("demo")));
    const withExercise = (over: Record<string, unknown>) => ({ ...good, text: { ...good.text, exercise: { ...good.text.exercise, ...over } } });
    expect(asLiveDisplayView(withExercise({ picture: "swimming" }))).toBeNull();
    expect(asLiveDisplayView(withExercise({ counter: "Exercise 5 of 4" }))).toBeNull();
    expect(asLiveDisplayView(withExercise({ counter: "Score 40" }))).toBeNull();
    expect(asLiveDisplayView(withExercise({ steps: [] }))).toBeNull();
    expect(asLiveDisplayView(withExercise({ steps: ["1", "2", "3", "4", "5", "6"] }))).toBeNull();
    expect(asLiveDisplayView(withExercise({ steps: [42] }))).toBeNull();
    expect(asLiveDisplayView(withExercise({ note: "LEFS 40" }))).toBeNull();
    expect(asLiveDisplayView({ ...good, text: { ...good.text, exercise: "x" } })).toBeNull();
  });

  it("announces the counter, the name and, while it is shown, the steps", () => {
    const demo = liveAnnouncement({ kind: "live", view: asView("demo") });
    expect(demo).toContain("Exercise 2 of 4. Heel slide. Watch how it is done.");
    expect(demo).toContain("1. ");
    expect(liveAnnouncement({ kind: "live", view: asView("go") })).not.toContain("1. ");
  });

  it("reads a view with no exercise exactly as before", () => {
    expect(asLiveDisplayView(JSON.parse(JSON.stringify(view())))!.text.exercise).toBeUndefined();
    expect(asLiveExerciseDemo(undefined)).toBeNull();
  });
});
