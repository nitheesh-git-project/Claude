"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import QrCode from "@/components/patient/QrCode";
import { SECOND_SCREEN_HELP, companionShortLink } from "@/lib/companionScreen";

const noSubscribe = () => () => {};
const readOrigin = () => window.location.origin;
const serverOrigin = () => "";

/**
 * Shown on every patient screen while the physiotherapist has a guided video
 * assessment open: the way to the companion screen. It appears and goes by
 * itself (the shell refreshes on the live display table).
 *
 * The screen is meant for a second device - the video call stays on the phone
 * - so under the link it says exactly that, offers a short link to type on a
 * laptop, tablet or TV and a QR code for the same, and says plainly that one
 * device is fine. The QR is drawn in the browser from the page's own origin
 * (src/lib/qrCode.ts); until the origin is known (server render) only the
 * words show.
 */
export default function GuidedCheckBar() {
  const origin = useSyncExternalStore(noSubscribe, readOrigin, serverOrigin);
  const shortLink = origin ? companionShortLink(origin) : null;

  return (
    <div
      data-testid="guided-check-bar"
      className="mb-6 rounded-2xl border border-teal-300 bg-teal-50 p-3 pr-4 transition hover:border-teal-500"
    >
      <Link
        href="/patient/dashboard/session"
        data-testid="guided-check-link"
        className="flex min-h-12 items-center gap-3"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white">
          <i className="fa-solid fa-display" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold uppercase tracking-wide text-teal-900">Happening now</span>
          <span className="block text-base font-semibold text-slate-900">{SECOND_SCREEN_HELP.title}</span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-teal-900">
          Open <i className="fa-solid fa-arrow-right ml-0.5 text-[13px]" aria-hidden="true" />
        </span>
      </Link>

      <div className="mt-3 flex items-start gap-4 border-t border-teal-200 pt-3">
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
    </div>
  );
}
