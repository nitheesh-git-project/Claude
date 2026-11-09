// A development-only trail of the realtime/refresh decisions behind the
// Refresh badge: when a deliberate refresh starts and lands, when a change
// event arrives, whether it was counted or judged covered by the browser's
// own refresh, and how each channel's join went.
//
// The badge's judgement is timing (src/lib/refreshCoverage.ts), and a timing
// fault is invisible from outside: a spec only sees "no badge". The trail is
// what `e2e/admin-refresh-badge.spec.ts` prints when it fails, so one CI run
// says which step went wrong instead of a round of guesses. It records
// nothing in a production build.

export type TrailEntry = { at: number; kind: string; detail?: string };

const ENABLED = process.env.NODE_ENV !== "production";
const MAX_ENTRIES = 300;

export function trail(kind: string, detail?: string): void {
  if (!ENABLED || typeof window === "undefined") return;
  const w = window as unknown as { __realtimeTrail?: TrailEntry[] };
  const list = (w.__realtimeTrail ??= []);
  list.push({ at: Date.now(), kind, detail });
  if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
}
