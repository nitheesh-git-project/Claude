import Link from "next/link";
import type { ReactNode } from "react";
import { ADMIN_SECTIONS, adminScreenHref, visibleTabs } from "@/lib/adminNav";
import {
  ADMIN_SCOPE_LABELS,
  scopeCanManage,
  sectionsForScope,
  type AdminScope,
} from "@/lib/adminScope";
import { isDebugNavVisible } from "@/lib/debugNavVisible";

/**
 * The dashboard's chrome around a leaf detail page.
 *
 * A patient's, therapist's or condition's page is normally an overlay: the
 * dashboard intercepts the route (`@modal/(.)patients/[id]`) and shows the
 * detail on top of the screen you were already on. Interception only applies
 * to **client-side** navigation, though -- so a reload, a shared link, a new
 * tab, and `router.refresh()` after an action inside the overlay all land on
 * the real page underneath. That page was a bare `<section>` with a small
 * "← Back to Dashboard" link and none of the dashboard around it, so
 * pressing Mark Done on a patient's profile appeared to throw the admin out
 * of the back office onto a different, plainer site.
 *
 * This frame is what the real page wears now: the same dark rail, the same
 * section list, the same header shape. Two things keep it honest rather than
 * a second dashboard:
 *
 * - **The sections come from `ADMIN_SECTIONS` and the scope grid**, exactly
 *   as the shell's own sidebar does, so the two cannot list different
 *   sections or offer one this admin cannot open.
 * - **It is deliberately reduced** -- no collapse, no badges, no global
 *   search, no tab state. This is a leaf page, and every one of those
 *   belongs to the screen you return to. Reproducing them here would be a
 *   second implementation of the shell that drifts from the first.
 *
 * Each entry is a plain `<a>` through `adminScreenHref`, so it lands on a
 * real dashboard screen rather than a hardcoded `?section=` that `findTab`
 * would quietly redirect.
 */
export default function AdminDetailFrame({
  scope,
  title,
  children,
}: {
  scope: AdminScope;
  /** What this page is, in the header. The detail content carries the name. */
  title: string;
  children: ReactNode;
}) {
  const allowed = sectionsForScope(scope);
  const sections = ADMIN_SECTIONS.filter((s) => allowed.includes(s.key));
  // The debug bar is fixed to the top of every page until launch, so the
  // rail has to start below it -- same offset the shell takes.
  const offsetTop = isDebugNavVisible();

  return (
    <div className="min-h-screen bg-slate-50">
      <nav
        className={`fixed left-0 z-30 hidden w-64 flex-col overflow-y-auto bg-slate-900 p-3 lg:flex ${
          offsetTop ? "top-10 bottom-0" : "inset-y-0"
        }`}
      >
        <div className="flex items-center gap-2.5 px-1 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white">
            <i aria-hidden className="fa-solid fa-user-doctor text-sm"></i>
          </div>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold leading-tight text-white">
              {ADMIN_SCOPE_LABELS[scope]}
            </span>
            <span className="block text-[11px] leading-tight text-slate-400">Admin Panel</span>
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-0.5">
          {sections.map((section) => {
            const tabs = visibleTabs(section, scopeCanManage(scope, section.key), scope !== "full");
            const first = tabs[0];
            if (!first) return null;
            return (
              <a
                key={section.key}
                href={adminScreenHref(section.key, first.key)}
                className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
              >
                <i aria-hidden className={`fa-solid ${section.icon} w-4 text-center text-sm`}></i>
                <span>{section.label}</span>
              </a>
            );
          })}
        </div>

        {/* A plain anchor, and a hard navigation, for the same reason both
            shells use one here: this leaves the dashboard's chrome for the
            public site's own Navbar/Footer layout, and those client-side
            transitions were silently not completing. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="mt-auto flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-white"
        >
          <i aria-hidden className="fa-solid fa-house text-sm"></i>
          <span>Back to Home</span>
        </a>
      </nav>

      <div className="lg:pl-64">
        <div className="px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6">
            <Link
              href="/admin/dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 transition hover:text-teal-900"
            >
              <i aria-hidden className="fa-solid fa-arrow-left text-[10px]"></i>
              Back to the dashboard
            </Link>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-teal-700">
              <i aria-hidden className="fa-solid fa-shield-halved text-[10px]" />
              {ADMIN_SCOPE_LABELS[scope]}
            </p>
            <h1 className="mt-0.5 font-display text-2xl font-bold text-slate-900">{title}</h1>
          </div>
          <div className="max-w-4xl">{children}</div>
        </div>
      </div>
    </div>
  );
}
