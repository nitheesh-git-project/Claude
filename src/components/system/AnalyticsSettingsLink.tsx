"use client";

import { COOKIE_SETTINGS_EVENT, COOKIE_SETTINGS_HASH, GA_MEASUREMENT_ID } from "@/lib/analytics";
import { marketingConsentEnabled } from "@/lib/cookieConsent";

// The footer's way back to the cookie choice. Withdrawing consent has to be
// as easy as giving it, so this is always there while anything optional is
// offered. A link, not a button: tapped before the page has hydrated, it
// still lands on COOKIE_SETTINGS_HASH, which the pop-up answers when it mounts.
export default function AnalyticsSettingsLink() {
  if (!GA_MEASUREMENT_ID && !marketingConsentEnabled()) return null;
  return (
    <>
      <span aria-hidden="true"> · </span>
      <a
        href={COOKIE_SETTINGS_HASH}
        onClick={(e) => {
          e.preventDefault();
          window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT));
        }}
        // A 44px tap target (MOB-003), as a real box rather than padding that
        // would overlap the line below (LAYOUT-STATE).
        className="inline-flex min-h-11 items-center underline-offset-2 transition hover:text-teal-400 hover:underline"
      >
        Cookie settings
      </a>
    </>
  );
}
