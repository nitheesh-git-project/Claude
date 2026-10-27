"use client";

import { buildIcs, icsDataUrl } from "@/lib/icsEvent";

/**
 * "Add to calendar" on the booking confirmation: a download of one .ics
 * event, built in the browser (src/lib/icsEvent.ts) as a data URL, so there is
 * no route and nothing stored. The title says the time is a request, because
 * until the clinic confirms it, it is.
 */
export default function AddToCalendarLink({
  uid,
  startIso,
  durationMinutes,
  title,
  description,
}: {
  uid: string;
  startIso: string;
  durationMinutes: number;
  title: string;
  description: string;
}) {
  const ics = buildIcs({ uid, start: startIso, durationMinutes, title, description });
  if (!ics) return null;
  return (
    <a
      href={icsDataUrl(ics)}
      download="physiotherapy-session.ics"
      data-testid="add-to-calendar"
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-teal-300 bg-white px-5 py-3 text-base font-bold text-teal-800 transition hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 sm:w-auto"
    >
      <i className="fa-solid fa-calendar-plus" aria-hidden="true" />
      Add to calendar
    </a>
  );
}
