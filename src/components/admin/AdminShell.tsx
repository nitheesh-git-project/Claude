"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";
import RealtimeRefresh from "@/components/RealtimeRefresh";
import AdminGlobalSearch, { type SearchEntity } from "@/components/admin/AdminGlobalSearch";
import { ADMIN_SECTIONS, findTab, type AdminSectionKey } from "@/lib/adminNav";

// Every base table this page's Promise.all queries (src/app/admin/dashboard/
// page.tsx) -- so any change, whether from another admin screen, a therapist/
// patient/hospital action, or a second admin logged in elsewhere, refreshes
// this dashboard. package_purchase_summary is deliberately excluded: it's a
// view, and postgres_changes only streams base tables -- its underlying
// patient_package_purchases is covered instead. See the supabase_realtime
// publication entries at the end of schema.sql, and
// scripts/check-realtime-coverage.mjs, which fails the lint if a table
// listed here was never added to that publication (the failure mode is
// silent: the subscription succeeds and simply never fires).
//
// Split into two channels because a refresh here is expensive and the two
// halves change at wildly different rates. One router.refresh() re-runs the
// whole dashboard Server Component -- ~41 queries, every screen, not just
// the one on display -- so every event that survives the debounce costs
// that. Operational tables below fire on ordinary patient and therapist
// activity, many times an hour; catalog and settings tables change when an
// admin edits them, which is rarely, and never in a burst that anyone is
// watching land. Giving the catalog channel a much longer window means a
// stray FAQ edit can't drag the whole dashboard through a rebuild, while
// the operational channel keeps a window short enough that a booking still
// appears while the admin is looking at it.
//
// Both lists are read by the coverage check, which matches any
// *_REALTIME_TABLES array -- keep new tables in one of these two rather
// than inlining a third list at the call site.
const ADMIN_REALTIME_TABLES = [
  "session_suggestions",
  "appointments",
  "therapist_payout_requests",
  "patient_referrals",
  "b2b_leads",
  "profiles",
  "profile_change_requests",
  "patient_package_purchases",
  "payment_failure_log",
  "therapist_payout_batches",
  "therapist_availability_template",
  "therapist_availability_override",
  // The roster's version counter, read by the dashboard to hand the editor
  // the version its next save has to match. Without it here, one admin
  // saving a roster leaves another's open dashboard holding a stale
  // version -- the compare-and-swap catches it, so nothing is corrupted,
  // but the second admin gets a 409 telling them to reload where a refresh
  // would simply have happened.
  "therapist_schedule_state",
  "appointment_reassignment_log",
  "patient_condition_profiles",
  "condition_change_requests",
  "condition_access_grants",
  "pain_assessments",
  "home_visit_package_purchases",
  "home_visit_waitlist",
  "patient_addresses",
  "admin_activity_log",
  "hospital_admin_notes",
  "risk_signals",
  // A therapist writing a recommendation is operational traffic: the
  // clinic's Recommendations screen should show it without a reload.
  "care_plans",
  "care_plan_versions",
];

// Catalog and site configuration: edited by an admin on purpose, not
// produced by traffic.
const ADMIN_CATALOG_REALTIME_TABLES = [
  "site_settings",
  "treatment_categories",
  "treatment_category_packages",
  "testimonials",
  "faqs",
  "home_visit_areas",
  "home_visit_packages",
  // Costs are admin-entered like the rest of this list -- the editor already
  // sees their own change via router.refresh(), so the long cooldown is
  // right and the short operational one would be wasted rebuilds.
  "business_expenses",
  // Detector thresholds, edited on the Risk tab itself.
  "risk_rules",
  // The three records the Risk tab reads. Deliberately on the long cooldown
  // rather than the operational one: a reveal happens every time any
  // therapist taps "Show number", and a full ~40-query dashboard rebuild per
  // tap would be real cost for an append-only log nobody watches live. An
  // admin reading the queue deliberately is well served by 30s.
  "risk_reviews",
  "communication_flags",
  "contact_reveal_log",
];

// Cooldowns, not delays: RealtimeRefresh fires on the leading edge, so
// neither of these postpones the first change an admin is waiting on. They
// only bound how often a *burst* can rebuild this page.
//
// 2s for operational tables: one booking or one bulk action writes several
// rows in quick succession, and this collapses their tail into a single
// extra rebuild.
const ADMIN_REALTIME_COOLDOWN_MS = 2000;

// 30s for catalog and settings: still instant for the first edit, but an
// admin working through a list of FAQs or treatments can't drag every other
// admin's dashboard through a rebuild per save.
const ADMIN_CATALOG_REALTIME_COOLDOWN_MS = 30000;
// Content for every screen, keyed "<section>:<tab>" -- the page builds this
// map, the shell only decides which key is visible. Keeping it a flat map
// (rather than one prop per screen, as the old 16-prop AdminTabs did) means
// adding a screen is a nav-list entry plus a map entry, never a signature
// change here.
export type AdminScreens = Record<string, ReactNode>;

export default function AdminShell({
  screens,
  badges,
  searchEntities,
  adminName,
  adminEmail,
  adminAvatarUrl,
  allowedSections,
  offsetTop,
  initialSection,
  initialTab,
}: {
  screens: AdminScreens;
  // Keyed the same way as `screens`. A section's own badge is the sum of its
  // tabs' badges, computed here rather than passed, so the two can't drift.
  badges: Record<string, number>;
  searchEntities: SearchEntity[];
  adminName: string;
  adminEmail: string;
  adminAvatarUrl: string | null;
  // Which sections this admin's scope may open (see adminScope.ts). The
  // sidebar hides the rest -- but hiding is presentation only; every route
  // re-checks scope server-side, since a hidden button is not a permission.
  allowedSections: AdminSectionKey[];
  // Whether the dev-only DebugNav bar is showing above everything on this
  // page (same flag the root layout threads into Navbar as its own
  // `offsetTop` prop) -- this page hides the public Navbar entirely, so its
  // own fixed sidebar has to account for that offset itself instead of
  // inheriting it for free from normal document flow.
  offsetTop: boolean;
  // The ?section=/?tab= a deep link arrived with, read server-side by the
  // page so the right screen is in the very first HTML rather than after
  // hydration. Null on a plain /admin/dashboard visit.
  initialSection?: string | null;
  initialTab?: string | null;
}) {
  const sections = ADMIN_SECTIONS.filter((s) => allowedSections.includes(s.key));
  const firstSection = sections[0] ?? ADMIN_SECTIONS[0];

  const initial = findTab(initialSection ?? null, initialTab ?? null, allowedSections);
  const [sectionKey, setSectionKey] = useState<string>(initial.section);
  const [tabKey, setTabKey] = useState<string>(initial.tab);
  // Desktop full <-> mini collapse. Independent of the mobile drawer below --
  // a phone gets an off-canvas drawer instead, never the mini/icon-only rail.
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // URL <-> state sync. Deliberately the History API rather than
  // router.push/replace: this page is one big Server Component, and a
  // Next.js navigation would re-run all ~40 of its queries just to move
  // between two already-rendered screens. history.pushState changes the
  // address bar (so a screen is linkable and survives a reload) without
  // touching the server, and the popstate listener below makes the browser's
  // Back button walk the tab history the way a user expects.
  useEffect(() => {
    function applyFromLocation() {
      const params = new URLSearchParams(window.location.search);
      const found = findTab(params.get("section"), params.get("tab"), allowedSections);
      setSectionKey(found.section);
      setTabKey(found.tab);
    }
    applyFromLocation();
    window.addEventListener("popstate", applyFromLocation);
    return () => window.removeEventListener("popstate", applyFromLocation);
  }, [allowedSections]);

  function navigate(nextSection: string, nextTab: string) {
    setSectionKey(nextSection);
    setTabKey(nextTab);
    const params = new URLSearchParams(window.location.search);
    params.set("section", nextSection);
    params.set("tab", nextTab);
    // `view` is a one-shot filter preset a Today row or a stat tile arrived
    // with (adminScreenHref). Carrying it onto the next screen would make it
    // sticky -- an admin who filtered to unassigned sessions once would keep
    // re-applying that filter every time they came back to the tab -- and
    // would also stop a repeat tap on the same row from re-applying it.
    params.delete("view");
    window.history.pushState(null, "", `${window.location.pathname}?${params.toString()}`);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // A hard navigation so the browser sends a fresh request guaranteed to
    // carry the now-cleared auth cookies -- see SignOutButton for the same
    // reasoning, duplicated here since this sign-out control needs the
    // sidebar's dark styling rather than that component's light one.
    window.location.href = "/?farewell=1";
  }

  // No useIdleTimeout here on purpose: the Session Timeout of Inactivity
  // set in Settings applies to patient, therapist and hospital sessions
  // only. An admin is the one who configures that timeout and routinely
  // leaves this dashboard open while working elsewhere (waiting on a payout,
  // watching for a new approval), so timing them out of their own control
  // panel costs work and protects nothing they didn't choose.

  const activeSection = sections.find((s) => s.key === sectionKey) ?? firstSection;

  function sectionBadge(key: string) {
    const section = sections.find((s) => s.key === key);
    if (!section) return 0;
    return section.tabs.reduce((sum, t) => sum + (badges[`${key}:${t.key}`] ?? 0), 0);
  }

  // A plain render function, not a nested component -- called directly as
  // renderNavItem(...) rather than <NavItem ... />, so React never treats it
  // as its own component type and there's nothing to remount every render.
  function renderNavItem(
    section: (typeof ADMIN_SECTIONS)[number],
    mini: boolean,
    onNavigate?: () => void
  ) {
    const active = section.key === activeSection.key;
    const badge = sectionBadge(section.key);
    return (
      <div key={section.key}>
        <button
          type="button"
          onClick={() => {
            navigate(section.key, section.tabs[0].key);
            onNavigate?.();
          }}
          title={mini ? section.label : undefined}
          className={`group relative w-full flex items-center gap-3 rounded-xl transition ${
            mini ? "justify-center px-0 py-3" : "px-3.5 py-2.5"
          } ${active ? "bg-teal-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
        >
          <i className={`fa-solid ${section.icon} ${mini ? "text-base" : "w-4 text-center text-sm"}`}></i>
          {!mini && <span className="flex-1 text-left text-sm font-semibold">{section.label}</span>}
          {badge > 0 && !mini && (
            <span className="rounded-full bg-amber-300 px-1.5 py-0.5 text-[11px] font-bold text-amber-900">
              {badge}
            </span>
          )}
          {badge > 0 && mini && (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-400"></span>
          )}
          {mini && (
            <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 scale-95 whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:scale-100 group-hover:opacity-100">
              {section.label}
            </span>
          )}
        </button>
        {/* Sub-tabs live under their own section in the sidebar rather than
            as a second row above the content: the mini rail has no room for
            a second level, and an admin scanning for "where do I do X" reads
            one list, not a list plus a hidden strip. */}
        {active && !mini && section.tabs.length > 1 && (
          <div className="mt-1 space-y-0.5 border-l border-slate-800 pl-3 ml-4">
            {section.tabs.map((t) => {
              const tabBadge = badges[`${section.key}:${t.key}`] ?? 0;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    navigate(section.key, t.key);
                    onNavigate?.();
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition ${
                    t.key === tabKey
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                  }`}
                >
                  <span className="flex-1">{t.label}</span>
                  {tabBadge > 0 && (
                    <span className="rounded-full bg-amber-300 px-1.5 text-[10px] font-bold text-amber-900">
                      {tabBadge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderBrand(mini: boolean) {
    return (
      <div className={`flex items-center gap-2.5 px-1 py-2 ${mini ? "justify-center" : ""}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white">
          <i className="fa-solid fa-user-doctor text-sm"></i>
        </div>
        {!mini && <span className="text-sm font-bold leading-tight text-white">Admin Panel</span>}
      </div>
    );
  }

  // Sits directly under the brand, above the sections. The admin dashboard
  // is in NAV_HIDDEN_ROUTES like the other three, so without this the only
  // way off it is Log Out -- which also ends the session.
  //
  // A plain anchor rather than next/link: this leaves the dashboard chrome
  // for the public site's own layout, the transition DashboardShell's nav
  // entries document as silently not completing client-side here.
  function renderHomeLink(mini: boolean, onNavigate?: () => void) {
    return (
      // The hard navigation is the point here, not an oversight -- see the
      // comment above this function.
      // eslint-disable-next-line @next/next/no-html-link-for-pages
      <a
        href="/"
        onClick={onNavigate}
        title={mini ? "Back to Home" : undefined}
        className={`mt-1 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-white ${
          mini ? "justify-center px-0" : ""
        }`}
      >
        <i aria-hidden="true" className="fa-solid fa-house text-sm"></i>
        {!mini && <span>Back to Home</span>}
      </a>
    );
  }

  function renderFooter(mini: boolean) {
    return (
      <div className="mt-auto space-y-1 border-t border-slate-800 pt-3">
        <div className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${mini ? "justify-center" : ""}`}>
          <AvatarThumbnail url={adminAvatarUrl} name={adminName} size={32} />
          {!mini && (
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white">{adminName}</p>
              <p className="truncate text-[11px] text-slate-400">{adminEmail}</p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          title={mini ? "Log Out" : undefined}
          className={`group relative flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-white ${
            mini ? "justify-center px-0" : ""
          }`}
        >
          <i className="fa-solid fa-arrow-right-from-bracket text-sm"></i>
          {!mini && <span>Log Out</span>}
          {mini && (
            <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 scale-95 whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:scale-100 group-hover:opacity-100">
              Log Out
            </span>
          )}
        </button>
      </div>
    );
  }

  const contentPadClass = collapsed ? "lg:pl-[76px]" : "lg:pl-64";

  return (
    // Its own full-height dark app shell (fixed sidebar + a light content
    // pane), not a card sitting inside the site's normal centered page
    // column -- Navbar/Footer are hidden on this exact route (see their own
    // pathname checks) so this component owns the entire viewport.
    <div className="min-h-screen bg-slate-50">
      <RealtimeRefresh tables={ADMIN_REALTIME_TABLES} cooldownMs={ADMIN_REALTIME_COOLDOWN_MS} />
      <RealtimeRefresh
        tables={ADMIN_CATALOG_REALTIME_TABLES}
        cooldownMs={ADMIN_CATALOG_REALTIME_COOLDOWN_MS}
      />
      {/* Narrow screens: a compact dark top bar that opens an off-canvas
          drawer -- a fixed-width sidebar doesn't leave enough room for
          content on a phone/tablet. */}
      <div className="flex items-center justify-between bg-slate-900 px-4 py-3 lg:hidden">
        {renderBrand(false)}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-800 hover:text-white"
        >
          <i className="fa-solid fa-bars"></i>
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          ></div>
          <nav className="absolute bottom-0 left-0 top-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-slate-900 p-3">
            <div className="mb-2 flex items-center justify-between">
              {renderBrand(false)}
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            {renderHomeLink(false, () => setMobileOpen(false))}
            <div className="mt-1 flex-1 space-y-1">
              {sections.map((s) => renderNavItem(s, false, () => setMobileOpen(false)))}
            </div>
            {renderFooter(false)}
          </nav>
        </div>
      )}

      {/* lg and up: dark sidebar fixed flush against the left edge, spanning
          the full viewport height, collapsible to an icon-only rail with
          hover tooltips. offsetTop accounts for the dev-only DebugNav bar
          the same way Navbar's own offsetTop prop does -- a fixed element
          doesn't inherit that space from document flow the way Navbar
          (sticky, still in flow) does. */}
      <nav
        className={`fixed left-0 z-30 hidden flex-col bg-slate-900 p-3 transition-[width] duration-200 lg:flex ${
          collapsed ? "w-[76px]" : "w-64"
        } ${offsetTop ? "top-[41px] h-[calc(100vh-41px)]" : "top-0 h-screen"}`}
      >
        {renderBrand(collapsed)}
        {renderHomeLink(collapsed)}
        <div className="mt-2 flex-1 space-y-1 overflow-y-auto">
          {sections.map((s) => renderNavItem(s, collapsed))}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={`mt-2 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-white ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          <i className={`fa-solid ${collapsed ? "fa-angles-right" : "fa-angles-left"} text-sm`}></i>
          {!collapsed && <span>Collapse</span>}
        </button>
        {renderFooter(collapsed)}
      </nav>

      <div className={`transition-[padding] duration-200 ${contentPadClass}`}>
        <div className="px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {activeSection.label}
                {/* Suppressed when the screen's own name repeats the
                    section's -- Today's default screen is called Today, and
                    "Today Today" reads as a rendering bug. */}
                {activeSection.tabs.length > 1 &&
                  (() => {
                    const tabLabel = activeSection.tabs.find((t) => t.key === tabKey)?.label ?? "";
                    if (!tabLabel || tabLabel === activeSection.label) return null;
                    return (
                      <span className="ml-2 text-base font-semibold text-slate-400">{tabLabel}</span>
                    );
                  })()}
              </h1>
              <p className="text-xs text-slate-500 mt-1">{activeSection.blurb}</p>
            </div>
            <AdminGlobalSearch entities={searchEntities} />
          </div>

          {/* Every screen stays mounted and is hidden with CSS rather than
              unmounted -- the same trade the old tab shell made. It keeps a
              half-typed filter or an open row from being thrown away when an
              admin checks something on another screen and comes back. */}
          {sections.flatMap((section) =>
            section.tabs.map((t) => {
              const key = `${section.key}:${t.key}`;
              return (
                <div
                  key={key}
                  className={section.key === activeSection.key && t.key === tabKey ? "" : "hidden"}
                >
                  {screens[key] ?? null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
