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

  function computeJoinable(ms: number | null) {
    return ms === null ? true : Date.now() >= ms - JOINABLE_BEFORE_MS;
  }

  // Lazy initializer -- read once on mount rather than on every render
  // (satisfies the "no impure calls during render" rule), mirroring the
  // one-time Date.now() read already used in ProfileSessionList.
  const [isJoinable, setIsJoinable] = useState(() => computeJoinable(slotTimeMs));

  // Re-derive immediately (during render, not in an effect) if this same
  // mounted instance receives a new slotTime -- e.g. an admin reschedule
  // followed by router.refresh() re-renders the same row (same key={a.id})
  // with fresh props rather than remounting. Without this, a button already
  // active would wrongly stay active after being rescheduled further out.
  const [trackedSlotTimeMs, setTrackedSlotTimeMs] = useState(slotTimeMs);
  if (slotTimeMs !== trackedSlotTimeMs) {
    setTrackedSlotTimeMs(slotTimeMs);
    setIsJoinable(computeJoinable(slotTimeMs));
  }

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
