"use client";

import { useEffect, useMemo, useState } from "react";
import { CLINIC_TIMEZONE, toDateKey, wallClockMs, type SlotOpenCheck } from "@/lib/bookingSlots";
import { openSlotPredicate } from "@/lib/openHours";

/** How far ahead the pickers ask about, in clinic days. */
export const OPEN_SLOT_WINDOW_DAYS = 120;

/** How long a picker waits for the answer before it stops saying
 *  "checking" and offers every hour, as when the roster cannot be read. */
export const OPEN_SLOT_WAIT_MS = 6000;

/**
 * Which slot starts a therapist can take, for a booking picker
 * (/api/appointments/open-hours, openHours.ts).
 *
 * `isOpen` is null until the answer arrives and whenever the roster could
 * not be read: a check that could not be run is not a "no", so the picker
 * then offers every hour, exactly as it did before this existed, and the
 * clinic confirms or offers another time. `checked` says which of the two
 * the screen is showing, and `loading` that the answer has not arrived yet:
 * a picker shows "checking" then rather than every hour, which it used to
 * draw first and narrow a moment later -- the staging review saw dates and
 * times appear and then vanish. After OPEN_SLOT_WAIT_MS without an answer
 * it stops waiting and offers every hour.
 */
export type OpenSlotOptions = {
  /** Only this therapist's hours: the one suggesting a session, or the one
   *  an admin has chosen. Needs a signed-in caller. */
  therapistId?: string | null;
  /** The session being moved: its own slot does not block it. */
  excludeAppointmentId?: string | null;
  /** A home visit: other visits are padded by the travel buffer. */
  visitMode?: "online" | "home_visit";
  /**
   * The zone the picker draws its hours in. Default: the browser's own, which
   * is what the patient's and therapist's pickers use (slotStartMs). The
   * admin pickers draw the clinic's hours and pass CLINIC_TIMEZONE. The
   * server answers on this grid; asking about the clinic grid from a browser
   * in UTC (or anywhere not on India's half hour) greyed out every date.
   */
  gridTimeZone?: string;
  /** Bump to ask again: a screen that has just taken an hour (a booking made
   *  on someone's behalf) re-reads the open hours instead of showing that hour
   *  free until the page is reloaded. */
  reloadKey?: number;
};

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || CLINIC_TIMEZONE;
  } catch {
    return CLINIC_TIMEZONE;
  }
}

export function useOpenSlots(
  nowMs: number | null,
  categoryId: string | null | undefined,
  options: OpenSlotOptions = {}
): {
  isOpen: SlotOpenCheck;
  checked: boolean;
  loading: boolean;
} {
  const [state, setState] = useState<{ key: string; open: number[] | null }>({ key: "", open: null });
  // No clock yet (a screen that reads it after mount): nothing to ask.
  const fromKey = nowMs === null ? "" : toDateKey(new Date(wallClockMs(nowMs, CLINIC_TIMEZONE)));
  const therapistId = options.therapistId ?? "";
  const exclude = options.excludeAppointmentId ?? "";
  const visitMode = options.visitMode === "home_visit" ? "home_visit" : "";
  const gridZone = options.gridTimeZone ?? (nowMs === null ? "" : browserTimeZone());
  const reload = options.reloadKey ?? 0;
  const key = `${fromKey}|${categoryId ?? ""}|${therapistId}|${exclude}|${visitMode}|${gridZone}|${reload}`;

  useEffect(() => {
    if (!fromKey) return;
    let cancelled = false;
    const params = new URLSearchParams({ from: fromKey, days: String(OPEN_SLOT_WINDOW_DAYS) });
    if (categoryId) params.set("categoryId", categoryId);
    if (therapistId) params.set("therapistId", therapistId);
    if (exclude) params.set("exclude", exclude);
    if (visitMode) params.set("visitMode", visitMode);
    // The clinic's own grid is the server's default; anything else is said.
    if (gridZone && gridZone !== CLINIC_TIMEZONE) params.set("tz", gridZone);
    fetch(`/api/appointments/open-hours?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { checked?: boolean; open?: unknown } | null) => {
        if (cancelled) return;
        const open =
          body?.checked === true && Array.isArray(body.open) && body.open.every((n) => typeof n === "number")
            ? (body.open as number[])
            : null;
        setState({ key, open });
      })
      .catch(() => {
        if (!cancelled) setState({ key, open: null });
      });
    // No answer in time reads like an unreadable roster: stop waiting and
    // offer every hour. A late answer still lands and narrows them.
    const giveUp = setTimeout(() => {
      if (!cancelled) setState((s) => (s.key === key ? s : { key, open: null }));
    }, OPEN_SLOT_WAIT_MS);
    return () => {
      cancelled = true;
      clearTimeout(giveUp);
    };
  }, [key, fromKey, categoryId, therapistId, exclude, visitMode, gridZone]);

  const open = state.key === key ? state.open : null;
  // One function per answer, not per render: callers compare it to decide
  // whether the open hours changed, and a fresh function every render made
  // that comparison always true -- a render loop that took the booking
  // wizard and the whole admin dashboard (which keeps Book a session
  // mounted) down the moment the hours arrived.
  const isOpen = useMemo(() => openSlotPredicate(open), [open]);
  return { isOpen, checked: open !== null, loading: fromKey !== "" && state.key !== key };
}
