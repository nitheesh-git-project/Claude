"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * The screen someone actually sees when a page throws.
 *
 * Before this existed the app had no error boundary anywhere, so any throw
 * in a Server Component rendered Next's own error page: a bare stack trace
 * in development and an unstyled "Application error" in production, with no
 * way back into the product. On a healthcare app that is the worst possible
 * moment to lose someone.
 *
 * Deliberately says nothing about *what* broke. The message on an Error can
 * carry a database column name or a row id, and this renders for patients.
 * `digest` is Next's own hash of the server-side error — safe to show, and
 * the one thing that lets a real report be matched to a real server log.
 */
export default function RouteError({
  error,
  reset,
  homeHref = "/",
  homeLabel = "Back to home",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref?: string;
  homeLabel?: string;
}) {
  useEffect(() => {
    // The full error still reaches the browser console for anyone debugging;
    // it is only the rendered output that stays vague.
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
        <i className="fa-solid fa-triangle-exclamation text-xl" />
      </span>
      <h1 className="font-display text-2xl font-bold text-slate-900">
        This page didn&apos;t load
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Something went wrong on our side, not yours. Nothing you were doing has been
        lost — try again, and if it keeps happening let the clinic know.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
        >
          Try again
        </button>
        <Link
          href={homeHref}
          className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
        >
          {homeLabel}
        </Link>
      </div>
      {error.digest && (
        <p className="mt-6 font-mono text-[11px] text-slate-400">
          Reference {error.digest}
        </p>
      )}
    </div>
  );
}
