import { patientControls, type PatientControl } from "@/lib/cockpit";
import type { ProtocolStep } from "@/lib/sessionProtocols";

/**
 * What an embedded timer tells the session cockpit, so the patient's clock is
 * never a second thing for the physiotherapist to start: a trial, hold,
 * count or walk began ("start"), ran its course or was stopped ("finish"), or
 * was thrown away ("abort").
 */
export type TimerClockEvent = "start" | "finish" | "abort";

/**
 * The patient-screen control a timer event stands for: "start" is Go (the
 * clock starts when the step has one: a count-up for a trial, a countdown for
 * a fixed-length hold, count or walk, as the protocol's step says), "finish"
 * is Done and "abort" is Rest, which clears the clock. The server still picks
 * the words and the clock's kind; this only names the phase.
 */
export function displayForTimerEvent(step: ProtocolStep, event: TimerClockEvent): PatientControl {
  const key = event === "start" ? "go" : event === "finish" ? "done" : "rest";
  return patientControls(step).find((c) => c.key === key)!;
}

/**
 * The event a timer's running flag moving from one render to the next stands
 * for, or null when nothing changed. An abort the timer already announced
 * (`aborted`) swallows the stop that follows it, so Rest is not overwritten
 * by Done.
 */
export function clockEventFor(wasRunning: boolean, running: boolean, aborted: boolean): TimerClockEvent | null {
  if (!wasRunning && running) return "start";
  if (wasRunning && !running) return aborted ? null : "finish";
  return null;
}
