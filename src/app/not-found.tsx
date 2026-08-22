import Link from "next/link";

// A mistyped URL, a stale bookmark, or a link to something that has since
// been cancelled. Next renders its own bare 404 without this file, which
// leaves someone on an unbranded dead end with no route back.
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <i className="fa-solid fa-magnifying-glass text-xl" />
      </span>
      <h1 className="font-display text-2xl font-bold text-slate-900">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        The link may be out of date, or the page may have moved. If you were following
        a link to a session, sign in and it will be on your dashboard.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
        >
          Back to home
        </Link>
        <Link
          href="/book"
          className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
        >
          Book a session
        </Link>
      </div>
    </div>
  );
}
