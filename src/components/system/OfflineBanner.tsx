"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  installNetworkGuard,
  isOfflineNow,
  subscribeNetwork,
} from "@/lib/networkStatus";

/**
 * "You're offline" -- said once, in plain words, on every page.
 *
 * Without this a dead connection shows up as whatever each control happens
 * to do with a failed request: Safari's bare "Load failed" in a sign-in
 * box, a button that spins and stops, a list that never fills. The person
 * has done nothing wrong and is told nothing useful. This banner names the
 * cause and the fix, and clears itself (with a short "back online") the
 * moment a request gets through or the browser reports a connection.
 *
 * It also installs the fetch guard (src/lib/networkStatus.ts), which is
 * what rewrites the browser's generic network error text everywhere else.
 */
export default function OfflineBanner() {
  const offline = useSyncExternalStore(subscribeNetwork, isOfflineNow, () => false);
  const [backOnline, setBackOnline] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => installNetworkGuard(), []);

  // One subscription: going down arms the "back online" message, coming back
  // up shows it. Set from the store's event, never from render.
  useEffect(() => {
    let down = isOfflineNow();
    let timer: number | undefined;
    const unsub = subscribeNetwork(() => {
      const now = isOfflineNow();
      if (now === down) return;
      down = now;
      window.clearTimeout(timer);
      if (now) {
        setBackOnline(false);
      } else {
        setBackOnline(true);
        timer = window.setTimeout(() => setBackOnline(false), 3000);
      }
    });
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, []);

  async function check() {
    setChecking(true);
    try {
      // Goes through the guarded fetch: success clears the banner, failure
      // keeps it. no-store so a cached copy cannot pretend we are online.
      await fetch("/icon.png", { method: "HEAD", cache: "no-store" });
    } catch {
      /* still offline -- the banner stays */
    }
    setChecking(false);
  }

  if (!offline && !backOnline) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[2000] flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      data-testid="offline-banner"
    >
      {offline ? (
        <div
          role="alert"
          className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl"
        >
          <i className="fa-solid fa-wifi text-amber-300" aria-hidden="true" />
          <span className="flex-1">
            <strong className="block font-semibold">You&apos;re offline</strong>
            Connect to the internet to continue. Nothing you&apos;ve entered is lost.
          </span>
          <button
            type="button"
            onClick={check}
            disabled={checking}
            className="rounded-lg border border-white/30 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/10 disabled:opacity-60"
          >
            {checking ? "Checking…" : "Try again"}
          </button>
        </div>
      ) : (
        <div
          role="status"
          className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-xl"
        >
          <i className="fa-solid fa-circle-check" aria-hidden="true" />
          You&apos;re back online
        </div>
      )}
    </div>
  );
}
