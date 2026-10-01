import Link from "next/link";

/**
 * The screen an admin sees when we could not work out whether they are one.
 *
 * This is the third outcome `getAdminContextResult()` exists to keep apart,
 * rendered rather than collapsed: a failed profile read is not a refusal, so
 * bouncing them to /get-started would tell a Master Admin they are not an
 * admin because a query hiccupped. It is also not a blank page, which is
 * what this route used to render for every unhappy path -- a screen with
 * nothing on it is indistinguishable from the app being down, and it is the
 * one state where somebody starts checking their own network.
 *
 * Retry is a plain link to the same URL rather than a button: the check runs
 * server-side, so the only thing that can answer differently is another
 * request, and the commonest cause here is the session-refresh race that
 * clears itself on the very next one.
 */
export default function AdminAccessUnavailable() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
        <i className="fa-solid fa-triangle-exclamation text-xl" aria-hidden="true" />
      </span>
      <h1 className="font-display text-2xl font-bold text-slate-900">
        We couldn&apos;t check your access
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        This isn&apos;t a refusal - the check itself didn&apos;t complete, so nothing has
        been decided about your account. It usually clears on the next try.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/admin/dashboard"
          className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
        >
          Try again
        </Link>
        <Link
          href="/dashboard"
          className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Back to my dashboard
        </Link>
      </div>
    </div>
  );
}
