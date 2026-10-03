"use client";

import { useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import Spinner from "@/components/system/Spinner";

/**
 * What an Edit Profile screen shows in place of a form whose data could not
 * be read.
 *
 * The three profile pages (patient, therapist, partner) used to render their
 * editable forms anyway, with blank values standing in as "what is on file"
 * and any change already waiting for approval hidden. A person reading that
 * screen is told, in effect, that their details are missing -- and the
 * natural response is to fill them in again, or to send a change that is
 * already queued. A failed read is not an empty profile, so the form is
 * withheld and this says what happened instead.
 *
 * Three things it is careful to say, because they are the questions a
 * person has at that moment: nothing they entered is lost, nothing can be
 * sent from here until it loads, and trying again is safe. Retry refreshes
 * the server render in place rather than asking for a page reload -- the
 * read is the only thing that can answer differently, and making somebody
 * find the browser's reload button is handing them our work.
 *
 * Scoped to the section that failed. A page whose address list could not be
 * read still lets the person edit their name; only the part with nothing
 * true to show is replaced.
 */
export default function ProfileLoadFailed({
  title,
  body,
  compact = false,
  anchorIds = [],
}: {
  /** What could not be loaded, in the reader's words. */
  title: string;
  /** What is still true: what is unchanged, and what cannot be done yet. */
  body: string;
  /** Inside a card that already has its own frame and heading. */
  compact?: boolean;
  /** The ids of the sections this replaces. The sidebar links to them by
   *  id (Photo, Personal Details, ...); without these, those links would
   *  point at nothing and a tap would do nothing. Landing on this notice is
   *  the honest answer to "where are my details?". */
  anchorIds?: string[];
}) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();

  return (
    <div
      role="alert"
      className={
        compact
          ? "rounded-xl border border-amber-200 bg-amber-50 p-4"
          : "mb-6 rounded-2xl border border-amber-200 bg-white p-6 shadow-sm"
      }
    >
      {anchorIds.map((id) => (
        <span key={id} id={id} aria-hidden="true" className="block scroll-mt-24" />
      ))}
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"
        >
          <i className="fa-solid fa-triangle-exclamation" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold text-slate-800">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{body}</p>
          <button
            type="button"
            onClick={() => startRetry(() => router.refresh())}
            disabled={retrying}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
          >
            {retrying ? (
              <>
                <Spinner /> Trying again…
              </>
            ) : (
              "Try again"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
