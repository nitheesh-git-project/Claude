// How the Health Profile header words the phase. A phase the physiotherapist
// stored is stated plainly. When none is stored but the plan's milestones
// imply one (progressView.inferPhase), it is shown as a clearly labelled
// suggestion -- never as the physiotherapist's own call. With nothing to go
// on it stays "Phase not set". Shared by ortho, neuro and paediatric pages.

import { childWords } from "@/lib/childVoice";
import type { Voice } from "@/lib/progressView";

export type PhaseHeadline = {
  /** The bold part. */
  headline: string;
  /** The sentence after it, or null. */
  detail: string | null;
  state: "confirmed" | "suggested" | "unset";
};

export function describePhase(input: { phase: string | null; suggested: boolean; voice: Voice; child?: boolean }): PhaseHeadline {
  const { phase, suggested, voice, child = false } = input;
  if (!phase) return { headline: "Phase not set", detail: null, state: "unset" };
  if (!suggested) return { headline: phase, detail: null, state: "confirmed" };
  if (voice === "clinician") {
    return { headline: `Suggested: ${phase}`, detail: "(from the milestones) - set the phase to confirm", state: "suggested" };
  }
  const confirm = "Your physiotherapist will confirm.";
  return { headline: `Suggested stage: ${phase}.`, detail: child ? childWords(confirm) : confirm, state: "suggested" };
}

export type PhaseBarState = "done" | "current" | "suggested" | "ahead";

/** One segment of the bar. A suggestion marks only its own segment: stages
 *  before it are not "done" until the physiotherapist says so. */
export function phaseBarState(index: number, currentIndex: number, suggested: boolean): PhaseBarState {
  if (currentIndex < 0) return "ahead";
  if (suggested) return index === currentIndex ? "suggested" : "ahead";
  return index < currentIndex ? "done" : index === currentIndex ? "current" : "ahead";
}
