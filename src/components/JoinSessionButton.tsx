"use client";

import { useEffect, useState } from "react";

const JOINABLE_BEFORE_MS = 15 * 60 * 1000;

export default function JoinSessionButton({
  meetLink,
  slotTime,
  status,
}: {
  meetLink: string | null | undefined;
  slotTime: string | null | undefined;
  status: string;
}) {
  const slotTimeMs = slotTime ? new Date(slotTime).getTime() : null;

  // Lazy initializer -- read once on mount rather than on every render
  // (satisfies the "no impure calls during render" rule), mirroring the
  // one-time Date.now() read already used in ProfileSessionList.
  const [isJoinable, setIsJoinable] = useState(() =>
    slotTimeMs === null ? true : Date.now() >= slotTimeMs - JOINABLE_BEFORE_MS
  );

  useEffect(() => {
    if (isJoinable || slotTimeMs === null) return;
    const msUntilJoinable = slotTimeMs - JOINABLE_BEFORE_MS - Date.now();
    // One-time timer, not a recurring interval -- this codebase has no
    // existing setInterval usage, and a single scheduled flip at exactly
    // the joinable moment is the cheapest correct approach. Clamped to 0 so
    // a stale render (msUntilJoinable already <= 0 by the time this effect
    // runs) still flips on the next tick rather than needing a synchronous
    // setState here.
    const timer = setTimeout(() => setIsJoinable(true), Math.max(0, msUntilJoinable));
    return () => clearTimeout(timer);
  }, [isJoinable, slotTimeMs]);

  if (!meetLink) return null;

  const disabled = status === "completed" || status === "cancelled" || !isJoinable;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => window.open(meetLink, "_blank", "noopener,noreferrer")}
      className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg transition"
    >
      Tap to Join
    </button>
  );
}
