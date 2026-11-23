"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import QrCode from "@/components/patient/QrCode";
import { SECOND_SCREEN_HELP, companionShortLink } from "@/lib/companionScreen";

const noSubscribe = () => () => {};
const readOrigin = () => window.location.origin;
const serverOrigin = () => "";

/**
 * Shown on every patient screen while the physiotherapist has a guided
 * check open: one line and Open (P3). It appears and goes by itself (the
 * shell refreshes on the live display table).
 *
 * One device is the normal case, so the second-screen help - the call stays
 * on the phone, a short link to type on a laptop, tablet or TV and a QR code
 * for the same - is folded behind "Use a bigger screen". The QR is drawn in the browser from the page's own origin
 * (src/lib/qrCode.ts); until the origin is known (server render) only the
 * words show.
 */
export default function GuidedCheckBar() {
  const origin = useSyncExternalStore(noSubscribe, readOrigin, serverOrigin);
  const shortLink = origin ? companionShortLink(origin) : null;

  return (
    <div data-testid="guided-check-bar" className="mb-6 rounded-2xl border border-teal-300 bg-teal-50 px-3 py-2 transition hover:border-teal-500">
      <Link href="/patient/dashboard/session" data-testid="guided-check-link" className="flex min-h-12 items-center gap-3">
        <span aria-hidden="true" className="relative flex h-3 w-3 shrink-0">
          <span className="absolute inset-0 rounded-full bg-teal-500 opacity-60 motion-safe:animate-ping" />
          <span className="relative h-3 w-3 rounded-full bg-teal-700" />
        </span>
        <span className="min-w-0 flex-1 text-base font-semibold text-slate-900">{SECOND_SCREEN_HELP.title}</span>
        <span className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white">
          Open <i className="fa-solid fa-arrow-right ml-1.5 text-[13px]" aria-hidden="true" />
        </span>
      </Link>

      <details data-testid="guided-check-bigger" className="group">
        <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1 text-sm font-semibold text-teal-900 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
          {SECOND_SCREEN_HELP.bigger}
          <span aria-hidden="true" className="no-underline group-open:rotate-180">▾</span>
        </summary>
        <div className="flex items-start gap-4 border-t border-teal-200 pb-1 pt-3">
          <div className="min-w-0 flex-1 space-y-2">
            <p data-testid="guided-check-help" className="text-base leading-relaxed text-slate-800">
              {SECOND_SCREEN_HELP.twoDevices}
            </p>
            {shortLink && (
              <p className="text-sm text-slate-700">
                {SECOND_SCREEN_HELP.scan}{" "}
                <span data-testid="guided-check-short-link" className="font-mono text-base font-bold text-teal-900 break-all">
                  {shortLink.display}
                </span>
              </p>
            )}
          </div>
          {shortLink && (
            <span data-testid="guided-check-qr" className="shrink-0">
              <QrCode text={shortLink.href} label={`QR code for ${shortLink.display}`} size={112} />
            </span>
          )}
        </div>
      </details>
    </div>
  );
}
