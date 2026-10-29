"use client";

import { ANALYTICS_REOPEN_EVENT, GA_MEASUREMENT_ID } from "@/lib/analytics";

// The footer's way back to the analytics choice. Withdrawing consent has to be
// as easy as giving it, so this is always there once analytics is switched on.
export default function AnalyticsSettingsLink() {
  if (!GA_MEASUREMENT_ID) return null;
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(ANALYTICS_REOPEN_EVENT))}
      className="inline-block py-1 underline-offset-2 transition hover:text-teal-400 hover:underline"
    >
      Analytics settings
    </button>
  );
}
