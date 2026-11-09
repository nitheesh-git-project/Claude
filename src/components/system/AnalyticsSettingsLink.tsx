"use client";

import { ANALYTICS_REOPEN_EVENT, ANALYTICS_SETTINGS_HASH, GA_MEASUREMENT_ID } from "@/lib/analytics";

// The footer's way back to the analytics choice. Withdrawing consent has to be
// as easy as giving it, so this is always there once analytics is switched on.
// A link, not a button: tapped before the page has hydrated, it still lands on
// ANALYTICS_SETTINGS_HASH, which the consent card answers when it mounts.
export default function AnalyticsSettingsLink() {
  if (!GA_MEASUREMENT_ID) return null;
  return (
    <>
      <span aria-hidden="true"> · </span>
      <a
        href={ANALYTICS_SETTINGS_HASH}
        onClick={(e) => {
          e.preventDefault();
          window.dispatchEvent(new Event(ANALYTICS_REOPEN_EVENT));
        }}
        className="inline underline-offset-2 transition hover:text-teal-400 hover:underline"
      >
        Analytics settings
      </a>
    </>
  );
}
