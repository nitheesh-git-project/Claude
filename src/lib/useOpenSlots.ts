"use client";

import { useEffect, useState } from "react";
import { CLINIC_TIMEZONE, toDateKey, wallClockMs, type SlotOpenCheck } from "@/lib/bookingSlots";
import { openSlotPredicate } from "@/lib/openHours";

/** How far ahead the pickers ask about, in clinic days. */
export const OPEN_SLOT_WINDOW_DAYS = 120;

/**
 * Which slot starts a therapist can take, for a booking picker
 * (/api/appointments/open-hours, openHours.ts).
 *
 * `isOpen` is null until the answer arrives and whenever the roster could
 * not be read: a check that could not be run is not a "no", so the picker
 * then offers every hour, exactly as it did before this existed, and the
 * clinic confirms or offers another time. `checked` says which of the two
 * the screen is showing.
 */
export function useOpenSlots(nowMs: number | null, categoryId: string | null | undefined): {
  isOpen: SlotOpenCheck;
  checked: boolean;
} {
  const [state, setState] = useState<{ key: string; open: number[] | null }>({ key: "", open: null });
  // No clock yet (a screen that reads it after mount): nothing to ask.
  const fromKey = nowMs === null ? "" : toDateKey(new Date(wallClockMs(nowMs, CLINIC_TIMEZONE)));
  const key = `${fromKey}|${categoryId ?? ""}`;

  useEffect(() => {
    if (!fromKey) return;
    let cancelled = false;
    const params = new URLSearchParams({ from: fromKey, days: String(OPEN_SLOT_WINDOW_DAYS) });
    if (categoryId) params.set("categoryId", categoryId);
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
    return () => {
      cancelled = true;
    };
  }, [key, fromKey, categoryId]);

  const open = state.key === key ? state.open : null;
  return { isOpen: openSlotPredicate(open), checked: open !== null };
}
