"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clockShown, companionMoment, liveAnnouncement } from "@/lib/companionScreen";
import LiveScreen from "@/components/patient/session/LiveScreen";
import WaitingState from "@/components/patient/session/WaitingState";
import { useLiveDisplay, type LiveDisplayInitial } from "@/components/patient/session/useLiveDisplay";

/**
 * The patient's companion screen for a guided video assessment: dark, high
 * contrast, display only. It follows the physiotherapist live (realtime, with
 * a three-second poll as the fallback) and otherwise waits calmly. The only
 * thing on it that can be pressed is the way back to the dashboard, and that
 * appears only while nothing is in progress.
 */
export default function CompanionScreen({ patientId, initial }: { patientId: string; initial: LiveDisplayInitial }) {
  const { view, offsetMs, failing } = useLiveDisplay(patientId, initial);

  // "Now" starts as the server's own moment, so the first client render is the
  // server's render; from there it follows this device's clock, read in an
  // effect and corrected by the offset against the server.
  const [nowMs, setNowMs] = useState<number | null>(null);
  const ticking = !!view?.clock;
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, ticking ? 250 : 5000);
    return () => window.clearInterval(id);
  }, [ticking]);
  const now = (nowMs ?? Date.parse(initial.serverNow)) + (nowMs === null ? 0 : offsetMs);

  const moment = companionMoment(view, now);
  const clock = moment.kind === "live" ? clockShown(moment.view, now, 0) : null;

  return (
    <main data-testid="companion" className="min-h-dvh bg-[#0f172a] text-white">
      <div role="status" aria-live="polite" className="sr-only">
        {liveAnnouncement(moment)}
      </div>
      {moment.kind === "live" ? (
        <LiveScreen view={moment.view} clock={clock} />
      ) : (
        <>
          <WaitingState ended={moment.kind === "ended"} />
          <p className="fixed inset-x-0 bottom-4 text-center">
            <Link
              href="/patient/dashboard"
              className="inline-flex min-h-[44px] items-center rounded-lg px-4 text-base font-semibold text-[#94a3b8] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5eead4]"
            >
              Back to your dashboard
            </Link>
          </p>
        </>
      )}
      {failing && (
        <p data-testid="companion-reconnecting" className="fixed inset-x-0 top-3 text-center text-sm text-[#94a3b8]">
          Reconnecting
        </p>
      )}
    </main>
  );
}
