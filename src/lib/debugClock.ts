// The server half of the debug bar's simulated clock. Dependency-free so the
// rule can be tested without a request.
//
// The bar stores its simulated "now" as an offset in the browser
// (`debugNow.ts`). On its own that only moves what the UI offers: a
// therapist could simulate "one hour after the session" and see Done, then
// tap it and be told the session had not started, because the route judged
// the join window against the server's real clock. The client now sends its
// offset in a header, and the server honours it **only** when
// `ALLOW_DEBUG_CLOCK` is exactly "true" in the server environment.
//
// Deliberately a server-only flag and not `NEXT_PUBLIC_SHOW_DEBUG_NAV`: the
// bar is on in every environment while the app is pre-launch, and the gate
// this moves is a financial one (completion is what makes a therapist's
// share payable). Reusing the public flag would let anyone holding a
// therapist login complete sessions before they happen on the live site.
// Unset, the header is ignored and every gate reads the real clock.

export const DEBUG_NOW_OFFSET_HEADER = "x-debug-now-offset-ms";

// A year either way covers any test scenario; anything larger is a typo or
// a forged header, and is treated as no offset at all.
const MAX_OFFSET_MS = 366 * 24 * 60 * 60 * 1000;

export function resolveServerNowMs({
  realNowMs,
  headerValue,
  enabled,
}: {
  realNowMs: number;
  headerValue: string | null | undefined;
  enabled: boolean;
}): number {
  if (!enabled || !headerValue) return realNowMs;
  const offset = Number(headerValue.trim());
  if (!Number.isFinite(offset) || Math.abs(offset) > MAX_OFFSET_MS) return realNowMs;
  return realNowMs + Math.trunc(offset);
}

export function isDebugClockEnabled(): boolean {
  return process.env.ALLOW_DEBUG_CLOCK === "true";
}

/** "Now" for a server-side time gate that the debug clock may move. */
export function serverNowMs(request: { headers: { get(name: string): string | null } }): number {
  return resolveServerNowMs({
    realNowMs: Date.now(),
    headerValue: request.headers.get(DEBUG_NOW_OFFSET_HEADER),
    enabled: isDebugClockEnabled(),
  });
}
