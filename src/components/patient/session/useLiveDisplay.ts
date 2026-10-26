"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { parseLiveDisplayRow, type LiveDisplayView } from "@/lib/assessmentRun";
import { COMPANION_POLL_MS, COMPANION_REALTIME_GRACE_MS, asLiveDisplayView, serverOffsetMs } from "@/lib/companionScreen";
import { sessionProtocol } from "@/lib/sessionProtocols";

export type LiveDisplayInitial = { display: LiveDisplayView | null; serverNow: string; unreadable: boolean };

/**
 * The patient's screen following the physiotherapist: it subscribes to the
 * patient's own `assessment_live_display` row on the realtime publication
 * (filtered to their id; row-level security decides what the socket delivers),
 * and falls back to polling the loader every three seconds whenever realtime is
 * not reaching it (never connected, dropped, or refused). Every row it is
 * handed, by either road, is re-checked against the patient-safe whitelist
 * (`parseLiveDisplayRow`); one that fails is dropped and re-read, never drawn.
 * The server's own clock (`serverNow`) is kept as an offset so a countdown is
 * read against server time, not this device's.
 */
export function useLiveDisplay(patientId: string, initial: LiveDisplayInitial) {
  const [view, setView] = useState<LiveDisplayView | null>(initial.display);
  const [offsetMs, setOffsetMs] = useState(0);
  const [unreadable, setUnreadable] = useState(initial.unreadable);
  const [realtimeOk, setRealtimeOk] = useState(false);
  const [failing, setFailing] = useState(false);
  const failures = useRef(0);
  const inFlight = useRef(false);

  const apply = useCallback((next: LiveDisplayView | null, serverNow: string | null) => {
    setView(next);
    setUnreadable(false);
    if (serverNow) setOffsetMs(serverOffsetMs(serverNow, Date.now()));
  }, []);

  const refetch = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/patient/assessment-display", { cache: "no-store" });
      if (!res.ok) {
        // 429 and 503 are "could not check just now", not "nothing to show":
        // keep what is on screen and try again.
        failures.current += 1;
        if (failures.current >= 3) setFailing(true);
        return;
      }
      const body = (await res.json()) as { display: unknown; serverNow: string };
      // The route answers with the view the server already checked against the
      // patient-safe whitelist; the shape is checked again here all the same.
      const parsed = body.display ? asLiveDisplayView(body.display) : null;
      failures.current = 0;
      setFailing(false);
      if (body.display && !parsed) {
        setUnreadable(true);
        return;
      }
      apply(parsed, body.serverNow);
    } catch {
      failures.current += 1;
      if (failures.current >= 3) setFailing(true);
    } finally {
      inFlight.current = false;
    }
  }, [apply]);

  // One read as soon as the screen opens: it corrects the clock offset (the
  // server-rendered `serverNow` is older than the screen by the page load).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first read of the row
    void refetch();
  }, [refetch]);

  // The realtime channel.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`companion:${patientId}`);
    let disposed = false;
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "assessment_live_display", filter: `patient_id=eq.${patientId}` },
      (payload) => {
        if (payload.eventType === "DELETE") {
          apply(null, null);
          return;
        }
        const parsed = parseLiveDisplayRow(payload.new, sessionProtocol);
        if (parsed) apply(parsed, null);
        else void refetch();
      }
    );
    channel.subscribe((status) => {
      if (disposed) return;
      if (status === "SUBSCRIBED") {
        setRealtimeOk(true);
        // Whatever changed while the socket was joining was never delivered.
        void refetch();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setRealtimeOk(false);
      }
    });
    return () => {
      disposed = true;
      supabase.removeChannel(channel);
    };
  }, [patientId, apply, refetch]);

  // Polling: the fallback, used whenever realtime is not up (after a short
  // grace for the socket to join).
  useEffect(() => {
    if (realtimeOk) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    const grace = setTimeout(() => {
      void refetch();
      interval = setInterval(() => void refetch(), COMPANION_POLL_MS);
    }, COMPANION_REALTIME_GRACE_MS);
    return () => {
      clearTimeout(grace);
      if (interval) clearInterval(interval);
    };
  }, [realtimeOk, refetch]);

  // A tab brought back to the front catches up at once.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refetch]);

  return { view, offsetMs, unreadable, realtimeOk, failing };
}
