// Finishing a session from the end of a guided assessment (B3): the session
// note and the patient's summary start from what the run already knows,
// but only where the physiotherapist has written nothing. Their own text is
// never replaced, and what is filled is a starting point they edit - the
// note is still theirs, saved through the same note route, and the session
// is still closed by the same complete-session route with its own gates.
// Dependency-free.

import type { ResultRow } from "@/lib/cockpit";

/** `prefill` written into the keys of `current` that are blank; a key with
 *  any text in it is left exactly as it is. */
export function fillEmptyOnly<T extends Record<string, string | null>>(current: T, prefill: Partial<Record<keyof T, string | null | undefined>>): T {
  const out = { ...current };
  for (const key of Object.keys(prefill) as (keyof T)[]) {
    const value = prefill[key];
    if (typeof value !== "string" || !value.trim()) continue;
    const now = current[key];
    if (typeof now === "string" && now.trim()) continue;
    (out as Record<keyof T, string | null>)[key] = value.trim();
  }
  return out;
}

const TREATED_MAX = 600;

/**
 * "Guided video assessment (Knee pain: video assessment): Safety check all
 * clear; Sit to stand for 30 seconds 12 stands; Walking speed skipped." -
 * the note's "What did you treat today?" from the run's own results. Null
 * when nothing was recorded.
 */
export function treatedLineFromRun(protocolTitle: string, rows: readonly ResultRow[]): string | null {
  const parts = rows
    .filter((r) => r.tone !== "todo")
    .map((r) => (r.tone === "done" ? `${r.label} ${lowerFirst(r.value)}` : `${r.label}: ${lowerFirst(r.value)}`));
  if (parts.length === 0) return null;
  const text = `Guided video assessment (${protocolTitle}): ${parts.join("; ")}.`;
  return text.length <= TREATED_MAX ? text : `${text.slice(0, TREATED_MAX - 1).trimEnd()}…`;
}

function lowerFirst(text: string): string {
  return text && /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

/** What "Finish this session" has done so far, for its three-line checklist. */
export type FinishProgress = { noteSaved: boolean; summarySaved: boolean; sessionClosed: boolean };

export const FINISH_STEPS: readonly { key: keyof FinishProgress; label: string }[] = [
  { key: "noteSaved", label: "Session note saved" },
  { key: "summarySaved", label: "Summary shared with the patient" },
  { key: "sessionClosed", label: "Session closed" },
];
