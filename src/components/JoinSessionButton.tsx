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
  // Set only on admin's own render sites (All Sessions, the Calendar tab,
  // SessionDetailDrawer, ProfileSessionList -- every one of these is
  // exclusively an admin-context component) -- an admin should always be
  // able to check/join a session's Meet call, so their button ignores the
  // Feature Control join-window entirely (both the before-slot and
  // after-slot boundaries). Patient/therapist/hospital call sites leave this
  // at its default false.
  //
  // It does *not* exempt them from the completed cutoff below: a session an
  // hour past its start reads the same way on every screen it appears on,
  // admin's included.
  alwaysActive?: boolean;
}) {
  const { beforeMinutes, afterMinutes, completedAfterMinutes } = useJoinWindow();
  const beforeMs = beforeMinutes * 60 * 1000;
  const afterMs = afterMinutes * 60 * 1000;
  const completedAfterMs = completedAfterMinutes * 60 * 1000;
  const durationMs = (durationMinutes ?? BASE_DURATION_MINUTES) * 60 * 1000;
  const slotTimeMs = slotTime ? new Date(slotTime).getTime() : null;

  function computeJoinable(ms: number | null) {
    if (alwaysActive || ms === null) return true;
    const now = debugNow();
    return now >= ms - beforeMs && now <= ms + durationMs + afterMs;
  }

  // Measured from slot_time rather than from the end of the duration:
  // "an hour after the appointment" is how this is set and read, and a
  // duration that varies per package shouldn't quietly move the line.
  function computeCompleted(ms: number | null) {
    if (ms === null) return false;
    return debugNow() >= ms + completedAfterMs;
  }

  // Lazy initializer -- read once on mount rather than on every render
  // (satisfies the "no impure calls during render" rule), mirroring the
  // one-time Date.now() read already used in ProfileSessionList.
  const [isJoinable, setIsJoinable] = useState(() => computeJoinable(slotTimeMs));
  const [isPastCutoff, setIsPastCutoff] = useState(() => computeCompleted(slotTimeMs));

  // Re-derive immediately (during render, not in an effect) if this same
  // mounted instance receives a new slotTime -- e.g. an admin reschedule
  // followed by router.refresh() re-renders the same row (same key={a.id})
  // with fresh props rather than remounting. Without this, a button already
  // active would wrongly stay active/inactive after being rescheduled, and a
  // session moved to a new time would keep reading as completed.
  const [trackedSlotTimeMs, setTrackedSlotTimeMs] = useState(slotTimeMs);
  if (slotTimeMs !== trackedSlotTimeMs) {
    setTrackedSlotTimeMs(slotTimeMs);
    setIsJoinable(computeJoinable(slotTimeMs));
    setIsPastCutoff(computeCompleted(slotTimeMs));
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

  // Its own timer, and its own effect, because this boundary is crossed on
  // every surface (alwaysActive included) and only ever in one direction:
  // once past, there is nothing left to wait for. A dashboard left open
  // across the cutoff relabels itself rather than offering a call to a
  // session that is over.
  useEffect(() => {
    if (isPastCutoff || slotTimeMs === null) return;
    const completedAtMs = slotTimeMs + completedAfterMs;
    const timer = setTimeout(
      () => setIsPastCutoff(true),
      Math.max(0, completedAtMs - debugNow())
    );
    return () => clearTimeout(timer);
  }, [isPastCutoff, slotTimeMs, completedAfterMs]);

  if (!meetLink) return null;

  // A cancelled session is not a completed one, and saying so would be a
  // plain lie on a row an admin is trying to read.
  const cancelled = status === "cancelled";
  const completed = !cancelled && (status === "completed" || isPastCutoff);
  const label = cancelled ? "Session Cancelled" : completed ? "Session Completed" : "Tap to Join";
  const disabled = cancelled || completed || !isJoinable;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => window.open(meetLink, "_blank", "noopener,noreferrer")}
      className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg transition"
    >
      {label}
    </button>
  );
}
