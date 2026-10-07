"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "@/lib/useRouter";
import { createClient } from "@/lib/supabase/client";
import { isEventCoveredByLocalRefresh } from "@/lib/refreshSignal";
import { useLiveUpdates } from "@/lib/liveUpdates";

// Keeps an already-open dashboard in sync with other users' actions (a
// therapist requesting a payout, a hospital submitting a referral, a new
// therapist signing up) without a manual reload -- subscribes to Postgres
// changes on the given tables via the browser's own authenticated client, so
// RLS applies exactly as it would to any other read by this user (admin sees
// everything via the *_select_admin policies in schema.sql; patient/
// therapist/hospital only see events for their own rows via their existing
// *_select_own policies).
//
// Requires the target tables to be added to the `supabase_realtime`
// publication (see schema.sql) -- without that, Supabase never emits
// postgres_changes events at all, and this silently does nothing (no error,
// just no live updates), same graceful-degradation posture as this
// codebase's migration-dependent queries elsewhere.
// scripts/check-realtime-coverage.mjs fails the lint on that mismatch.
//
// Leading edge, then a cooldown -- deliberately not a plain trailing
// debounce. A refresh is expensive (router.refresh() re-runs the whole
// Server Component; on the admin dashboard that is ~41 queries across every
// screen, not just the visible one), so a burst -- one booking writing
// several rows, or an admin bulk action -- must not cost one refresh per
// row. But a trailing debounce pays for that by delaying *every* update,
// including a lone event with no burst behind it, which is the common case
// and the one an admin is actually watching for.
//
// So: refresh immediately on the first event, then absorb anything that
// arrives during the cooldown and fire exactly one more refresh at the end
// of it if something did. A single change appears at once; a burst still
// collapses to two refreshes at most.
const DEFAULT_COOLDOWN_MS = 2000;

export default function RealtimeRefresh({
  tables,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  mode = "refresh",
}: {
  tables: string[];
  // Worth tuning per caller: the cooldown never delays the first change, it
  // only decides how tightly a burst behind it is collapsed. Somewhere the
  // data changes rarely and no one is watching for it (catalog, settings), a
  // long cooldown costs nothing.
  cooldownMs?: number;
  // "refresh" re-runs the Server Component, which is right where a rebuild
  // is cheap and the reader is usually waiting for the row (a patient
  // watching for a therapist's suggested time). "notify" only counts, for
  // the admin dashboard: a rebuild there is ~41 queries and every screen's
  // markup, and almost none of its traffic is a change the admin reading it
  // is waiting on -- so the count goes on the Refresh button and the admin
  // decides when the page moves. See src/lib/liveUpdates.tsx.
  mode?: "refresh" | "notify";
}) {
  const router = useRouter();
  const { noteUpdate } = useLiveUpdates();
  const tablesKey = tables.join(",");
  const trailingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshRef = useRef(0);
  // When the newest change waiting to be covered arrived. Newest rather than
  // oldest: a burst whose last event landed after this browser's own refresh
  // still holds something that refresh did not read.
  const lastEventAtRef = useRef<number | null>(null);
  // Whether live updates are currently reaching this screen. A websocket that
  // dropped or was refused used to stop updating the dashboard with nothing
  // on screen to say so -- the figures simply went stale.
  const [degraded, setDegraded] = useState(false);
  // Bumped by the banner's Refresh: tears the channel down and joins it
  // again. Refresh used to re-read the page only, so the data came back but
  // the dropped socket did not, and the banner stayed until a browser reload.
  const [connectAttempt, setConnectAttempt] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);

  // A screen can carry more than one of these (the admin dashboard has two
  // channels), and each drew its own banner in the same fixed spot, stacked.
  // Refresh on the top one reconnected only that channel, so the one beneath
  // stayed -- which read as Refresh not working. One Refresh now reconnects
  // every channel on the page, and only the first degraded one draws.
  const bannerId = useId();
  useEffect(() => {
    const onReconnect = () => {
      setReconnecting(true);
      setConnectAttempt((n) => n + 1);
    };
    window.addEventListener(RECONNECT_EVENT, onReconnect);
    return () => window.removeEventListener(RECONNECT_EVENT, onReconnect);
  }, []);
  const drawsBanner = useBannerOwner(bannerId, degraded);

  useEffect(() => {
    const list = tablesKey.split(",").filter(Boolean);
    if (list.length === 0) return;

    const supabase = createClient();
    const channel = supabase.channel(`realtime-refresh:${tablesKey}`);

    // Fires unless this browser's own refreshing has already read the write
    // behind the change. Most events on the admin dashboard are its own work
    // coming back -- the row a control just changed, and the admin_activity_log
    // entry describing it -- and the control called router.refresh() itself,
    // so acting again says nothing new (see src/lib/refreshCoverage.ts).
    //
    // A refresh is a **window**, not an instant. Comparing against its start
    // alone could never catch that case: the route commits, the response
    // returns, the control refreshes, and only *then* does the event arrive,
    // so it was always newer than the refresh meant to cover it -- which is
    // why every admin action added one to the Refresh button's badge their own
    // refresh had just cleared.
    const fire = () => {
      const newestEventAt = lastEventAtRef.current;
      lastEventAtRef.current = null;
      if (newestEventAt !== null && isEventCoveredByLocalRefresh(newestEventAt)) return;
      // Only a refresh that actually happens starts a cooldown. Counting a
      // skipped one would hold the next genuine change off for up to
      // cooldownMs -- 30 seconds on the catalog channel -- for a rebuild
      // that never took place.
      lastRefreshRef.current = Date.now();
      if (mode === "notify") {
        noteUpdate();
        return;
      }
      router.refresh();
    };

    const handleChange = () => {
      lastEventAtRef.current = Date.now();

      // Already waiting to fire at the end of the current cooldown -- this
      // event is part of the burst that trailing refresh will cover.
      if (trailingRef.current) return;

      const sinceLast = Date.now() - lastRefreshRef.current;
      if (sinceLast >= cooldownMs) {
        fire();
        return;
      }

      trailingRef.current = setTimeout(() => {
        trailingRef.current = null;
        fire();
      }, cooldownMs - sinceLast);
    };

    for (const table of list) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, handleChange);
    }

    let hadProblem = false;
    let disposed = false;
    channel.subscribe((status) => {
      // Removing the channel on unmount reports CLOSED; that is this screen
      // leaving, not a fault.
      if (disposed) return;
      if (status === "SUBSCRIBED") {
        // A join from the banner's Refresh starts with hadProblem false, so
        // the banner is cleared here on any successful join, not only on a
        // recovery this channel saw itself.
        setDegraded(false);
        setReconnecting(false);
        if (hadProblem) {
          // Back after a gap: whatever changed while the socket was down was
          // never delivered, so catch up once.
          hadProblem = false;
          setDegraded(false);
          fire();
        }
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        hadProblem = true;
        setDegraded(true);
        setReconnecting(false);
      }
    });

    return () => {
      if (trailingRef.current) clearTimeout(trailingRef.current);
      trailingRef.current = null;
      disposed = true;
      supabase.removeChannel(channel);
    };
  }, [tablesKey, cooldownMs, router, mode, noteUpdate, connectAttempt]);

  if (!degraded || !drawsBanner) return null;
  return (
    <div
      role="status"
      className="fixed bottom-[calc(1rem+var(--app-bottom-inset,0px))] left-1/2 z-50 -translate-x-1/2 flex w-max max-w-[calc(100vw-2rem)] items-center gap-2 rounded-2xl sm:rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 shadow-md print:hidden"
    >
      <i aria-hidden className="fa-solid fa-plug-circle-exclamation shrink-0" />
      <span>Live updates paused - this screen may be out of date.</span>
      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(new Event(RECONNECT_EVENT));
          router.refresh();
        }}
        disabled={reconnecting}
        className="shrink-0 whitespace-nowrap rounded-full bg-amber-600 px-3 py-1 text-white hover:bg-amber-700 disabled:opacity-70 transition"
      >
        {reconnecting ? "Reconnecting..." : "Refresh"}
      </button>
    </div>
  );
}

const RECONNECT_EVENT = "realtime-refresh:reconnect";

// Which degraded channel draws the one banner: the first to report, until it
// recovers. A tiny module-level registry rather than context, because the
// channels are mounted by unrelated parts of the page.
const degradedOrder: string[] = [];
const ownerListeners = new Set<() => void>();
function setDegradedEntry(id: string, isDegraded: boolean) {
  const at = degradedOrder.indexOf(id);
  if (isDegraded && at === -1) degradedOrder.push(id);
  if (!isDegraded && at !== -1) degradedOrder.splice(at, 1);
  ownerListeners.forEach((l) => l());
}

function useBannerOwner(id: string, isDegraded: boolean): boolean {
  useEffect(() => {
    setDegradedEntry(id, isDegraded);
    return () => setDegradedEntry(id, false);
  }, [id, isDegraded]);
  return useSyncExternalStore(
    (cb) => {
      ownerListeners.add(cb);
      return () => ownerListeners.delete(cb);
    },
    () => degradedOrder[0] === id,
    () => false
  );
}
