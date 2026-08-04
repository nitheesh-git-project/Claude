"use client";

import { useEffect } from "react";

/**
 * Warns the user before they navigate away/reload while `active` is true.
 * Used by one-shot admin action buttons (assign therapist, approve, etc.)
 * whose request can take a few seconds — a reload mid-request can abort the
 * connection before the server even receives it, silently losing the write
 * (confirmed: once a request is genuinely in flight server-side, it
 * completes regardless of the client disconnecting; the real risk window is
 * the client bailing before the request is fully sent).
 */
export function useUnloadWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);
}
