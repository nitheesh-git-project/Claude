"use client";

import { useEffect, useState } from "react";
import { companionSeenState, type CompanionSeen } from "@/lib/companionScreen";

const EVERY_MS = 15_000;

/**
 * Whether the patient's screen is open (E12), asked every fifteen seconds
 * while the run is open: the last heartbeat the patient's screen left, read
 * against the server's clock (`companionSeenState`). A failed or refused
 * read is "unknown" - said as "couldn't check", never "not open".
 */
export function useCompanionSeen(runId: string, active: boolean): CompanionSeen {
  const [seen, setSeen] = useState<CompanionSeen>("unknown");
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    async function ask() {
      try {
        const res = await fetch(`/api/therapist/assessment-runs/companion-seen?runId=${encodeURIComponent(runId)}`, { cache: "no-store" });
        const body = res.ok ? ((await res.json()) as { known?: boolean; seenAt?: string | null; serverNow?: string }) : null;
        const next =
          body?.known && typeof body.serverNow === "string"
            ? companionSeenState({ status: "ok", seenAt: body.seenAt ?? null, serverNow: body.serverNow })
            : "unknown";
        if (!cancelled) setSeen(next);
      } catch {
        if (!cancelled) setSeen("unknown");
      }
    }
    void ask();
    const id = window.setInterval(() => void ask(), EVERY_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [runId, active]);
  return seen;
}
