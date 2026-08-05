"use client";

import { useEffect, useState } from "react";
import { debugNow } from "@/lib/debugNow";
import { useJoinWindow } from "@/lib/joinWindowContext";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";

export default function JoinSessionButton({
  meetLink,
  slotTime,
  status,
  durationMinutes,
  alwaysActive = false,
}: {
  meetLink: string | null | undefined;
  slotTime: string | null | undefined;
  status: string;
  durationMinutes?: number | null;
  // Set only on admin's own render sites (All Bookings, Session Story,
  // Calendar tab, SessionDetailDrawer, ProfileSessionList -- every one of
  // these is exclusively an admin-context component) -- an admin should
  // always be able to check/join a session's Meet call, so their button
  // ignores the Feature Control join-window entirely (both the before-slot
  // and after-slot boundaries). Patient/therapist/hospital call sites leave
  // this at its default false.
  alwaysActive?: boolean;
}) {
  const { beforeMinutes, afterMinutes } = useJoinWindow();
  const beforeMs = beforeMinutes * 60 * 1000;
  const afterMs = afterMinutes * 60 * 1000;
  const durationMs = (durationMinutes ?? BASE_DURATION_MINUTES) * 60 * 1000;
  const slotTimeMs = slotTime ? new Date(slotTime).getTime() : null;

  function computeJoinable(ms: number | null) {
    if (alwaysActive || ms === null) return true;
    const now = debugNow();
    return now >= ms - beforeMs && now <= ms + durationMs + afterMs;
  }

  // Lazy initializer -- read once on mount rather than on every render
  // (satisfies the "no impure calls during render" rule), mirroring the
  // one-time Date.now() read already used in ProfileSessionList.
  const [isJoinable, setIsJoinable] = useState(() => computeJoinable(slotTimeMs));

  // Re-derive immediately (during render, not in an effect) if this same
  // mounted instance receives a new slotTime -- e.g. an admin reschedule
  // followed by router.refresh() re-renders the same row (same key={a.id})
  // with fresh props rather than remounting. Without this, a button already
  // active would wrongly stay active/inactive after being rescheduled.
  const [trackedSlotTimeMs, setTrackedSlotTimeMs] = useState(slotTimeMs);
  if (slotTimeMs !== trackedSlotTimeMs) {
    setTrackedSlotTimeMs(slotTimeMs);
    setIsJoinable(computeJoinable(slotTimeMs));
  }

  useEffect(() => {
    if (alwaysActive || slotTimeMs === null) return;
    const openMs = slotTimeMs - beforeMs;
    const closeMs = slotTimeMs + durationMs + afterMs;
    const now = debugNow();
    // One-time timer, not a recurring interval -- this codebase has no
    // existing setInterval usage. isJoinable only ever has one upcoming
    // transition: currently-joinable can only flip to not-joinable at
    // closeMs, and currently-not-joinable can only flip to joinable at
    // openMs -- but only if openMs is still ahead of us. A session already
    // past closeMs is not-joinable with no boundary left to wait for; if
    // this scheduled a timer off openMs (in the past) like the closeMs case
    // does, Math.max(0, ...) would clamp it to 0 and immediately flip the
    // button back on right after it correctly rendered disabled.
    if (isJoinable) {
      const timer = setTimeout(() => setIsJoinable(false), Math.max(0, closeMs - now));
      return () => clearTimeout(timer);
    }
    if (now < openMs) {
      const timer = setTimeout(() => setIsJoinable(true), openMs - now);
      return () => clearTimeout(timer);
    }
  }, [isJoinable, slotTimeMs, beforeMs, durationMs, afterMs, alwaysActive]);

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
