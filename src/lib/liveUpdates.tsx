"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { onLocalRefresh } from "@/lib/refreshSignal";

/**
 * How many changes have landed that this screen has not read yet.
 *
 * The admin dashboard used to re-render itself on every one of them. That is
 * ~41 queries and every screen's markup for a change the person reading is
 * almost never waiting on -- a patient booking, another admin's edit, a
 * therapist revealing a number -- and it moved the list they were reading
 * while they read it. Two controls, `RealtimeRefresh` and the Refresh
 * button, were answering the same question and only one of them was asked.
 *
 * So the live connection stays and only its ending changes: it counts
 * instead of acting, the Refresh button says how many are waiting, and the
 * person decides when the screen changes. The count resets on any deliberate
 * refresh (see `markLocalRefresh`), not on the button's own click, so a
 * control that mutates and refreshes clears it too.
 *
 * What this costs is stated plainly rather than hidden: a figure on Today
 * can be a few minutes old, and the badge is what says so.
 */
type LiveUpdates = {
  /** Changes waiting to be read. Counts bursts, as RealtimeRefresh collapses them. */
  pending: number;
  noteUpdate: () => void;
};

const NO_PROVIDER: LiveUpdates = { pending: 0, noteUpdate: () => {} };

const LiveUpdatesContext = createContext<LiveUpdates | null>(null);

export function LiveUpdatesProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState(0);

  useEffect(() => onLocalRefresh(() => setPending(0)), []);

  const noteUpdate = useCallback(() => setPending((n) => n + 1), []);
  const value = useMemo(() => ({ pending, noteUpdate }), [pending, noteUpdate]);

  return <LiveUpdatesContext.Provider value={value}>{children}</LiveUpdatesContext.Provider>;
}

/**
 * Never throws outside a provider -- same posture as `useToast`. `RefreshButton`
 * renders on all four dashboards and only the admin one counts today; a
 * missing counter must not be the thing that takes a screen down.
 */
export function useLiveUpdates(): LiveUpdates {
  return useContext(LiveUpdatesContext) ?? NO_PROVIDER;
}
