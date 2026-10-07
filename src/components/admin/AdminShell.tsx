"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";
import RealtimeRefresh from "@/components/RealtimeRefresh";
import { LiveUpdatesProvider } from "@/lib/liveUpdates";
import { AdminScreenNavigationProvider } from "@/lib/adminScreenNavigation";
import AdminGlobalSearch, { type SearchEntity } from "@/components/admin/AdminGlobalSearch";
import RefreshButton from "@/components/dashboard/RefreshButton";
import { useLeavingPage } from "@/lib/useLeavingPage";
import { ADMIN_SECTIONS, findTab, visibleTabs, type AdminSectionKey } from "@/lib/adminNav";
import { adminShortcuts, filterAdminScreens } from "@/lib/adminMobileNav";

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
  // The developer's own inbox (Settings -> Dev Reachouts): a new message
  // should show up without a reload, like a new B2B lead does.
  "dev_reachouts",
  // ...and the notes on those messages, so a second admin's note appears too.
  "dev_reachout_notes",
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
  "hospital_admin_notes",
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
  "mission_principles",
  "home_visit_areas",
  "home_visit_packages",
  // Costs are admin-entered like the rest of this list -- the editor already
  // sees their own change via router.refresh(), so the long cooldown is
  // right and the short operational one would be wasted rebuilds.
  "business_expenses",
  // Business Health's three input tables, on the same reasoning as costs
  // above: an owner types into them on Your Numbers a few times a month and
  // sees their own change immediately, so what the long cooldown buys is a
  // second admin's screen catching up -- not a live feed worth a full
  // dashboard rebuild each keystroke's worth of work.
  "capital_investments",
  "marketing_campaigns",
  "balance_sheet_entries",
  // Payments a patient declares against what they owe. On the long cooldown
  // rather than the operational one, the same move `admin_activity_log` got:
  // a declaration is a queue entry an admin opens deliberately, the admin who
  // confirms one has already refreshed for their own action, and a full
  // ~40-query rebuild per declaration would be real cost for a row nobody
  // watches land.
  "pay_later_payments",
  // Detector thresholds, edited on the Risk tab itself.
  "risk_rules",
  // The settlement record, on the long cooldown for the reason
  // `admin_activity_log` is: it is written by the same request that completes
  // a session, and that request already writes `appointments`, which is on
  // the operational channel. On the short one, one completion would rebuild
  // the whole dashboard twice -- once for the session and once for the row
  // describing it -- which is exactly the double rebuild that moved the audit
  // log off that channel. Nothing reads these rows yet either, so the only
  // thing a live feed would buy is a second admin's System Health count
  // catching up 30 seconds sooner.
  "session_settlements",
  // The signals themselves, moved off the operational channel: they are
  // written by the lazy detector sweep that runs after this very page's
  // render, so on a 2s cooldown the page's own sweep rebuilt the page. The
  // sweep's five-minute interval bounded that, and 30s is instant enough for
  // a queue an admin opens deliberately.
  "risk_signals",
  // The three records the Risk tab reads. Deliberately on the long cooldown
  // rather than the operational one: a reveal happens every time any
  // therapist taps "Show number", and a full ~40-query dashboard rebuild per
  // tap would be real cost for an append-only log nobody watches live. An
  // admin reading the queue deliberately is well served by 30s.
  "risk_reviews",
  "communication_flags",
  "contact_reveal_log",
  // The audit log, for the same reason and more sharply. **Every** mutating
  // admin route writes a row here, so on the operational channel each of
  // them rebuilt this whole page a second time -- once for the row the
  // action changed, once for the log entry describing it -- and the admin
  // who performed it had already refreshed deliberately. It is an
  // append-only record nobody watches live; 30s is instant enough for the
  // Logs screen and stops every tap in the back office costing two rebuilds.
  "admin_activity_log",
  "admin_activity_gaps",
  // Campaigns are admin-edited catalog data like the rest of this list, and
  // the editor already sees their own change -- so the long cooldown is
  // right and the operational one would be wasted rebuilds.
  "promo_codes",
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

/**
 * The label of a screen that was asked for and not rendered, or null.
 *
 * Only names a tab that exists in the nav at all: an unknown key is a stale
 * or hand-typed link rather than an access refusal, and telling somebody
 * they lack access to a screen that does not exist is worse than the silent
 * fallback it replaces.
 */
function unreachableTabLabel(
  requestedSection: string | null,
  requestedTab: string | null,
  resolved: { section: string; tab: string }
): string | null {
  if (!requestedTab) return null;
  if (requestedSection === resolved.section && requestedTab === resolved.tab) return null;
  const section = ADMIN_SECTIONS.find((s) => s.key === (requestedSection ?? resolved.section));
  const tab = section?.tabs.find((t) => t.key === requestedTab);
  return tab ? tab.label : null;
}

export default function AdminShell({
  screens,
  badges,
  searchEntities,
  adminName,
  adminEmail,
  adminAvatarUrl,
  scopeLabel,
  allowedSections,
  manageSections,
  limitedScope,
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
  // What this dashboard is called -- "Master Admin", "Operations",
  // "Finance", "Clinical" (ADMIN_SCOPE_LABELS). Every scope has one,
  // including full: four different dashboards that all say "Admin Panel"
  // and differ only in which sidebar entries are missing leave an admin
  // working out which one they are looking at from an absence. It is shown
  // in the sidebar brand and again in the page header, because the
  // collapsed rail hides the brand's text and the header is the one thing
  // on screen at every width and on every screen.
  scopeLabel: string;
  // Which sections this admin's scope may open (see adminScope.ts). The
  // sidebar hides the rest -- but hiding is presentation only; every route
  // re-checks scope server-side, since a hidden button is not a permission.
  allowedSections: AdminSectionKey[];
  // The subset of those the viewer may change rather than only read. A
  // section held at `view` keeps its listing screens (rendered read-only)
  // and loses the ones that are nothing but actions -- hiding every control
  // on those would leave an empty page with a heading.
  manageSections: AdminSectionKey[];
  /** True for Operations, Finance and Clinical -- the three desks that
   *  cannot open Settings, and so get their own Activity screen under Today
   *  (see `limitedScopesOnly` in adminNav.ts). */
  limitedScope: boolean;
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
  const sections = ADMIN_SECTIONS.filter((s) => allowedSections.includes(s.key)).map((s) => ({
    ...s,
    tabs: visibleTabs(s, manageSections.includes(s.key), limitedScope),
  }));
  const firstSection = sections[0] ?? ADMIN_SECTIONS[0];

  const initial = findTab(
    initialSection ?? null,
    initialTab ?? null,
    allowedSections,
    manageSections,
    limitedScope
  );
  const [sectionKey, setSectionKey] = useState<string>(initial.section);
  const [tabKey, setTabKey] = useState<string>(initial.tab);
  // A link that asked for a screen this scope cannot open, said out loud.
  //
  // `findTab` falls back to the first screen a scope *can* reach, which is
  // the right behaviour -- a stale bookmark must land somewhere valid -- but
  // on its own it is silent, and a tap that quietly goes somewhere else is
  // the failure mode this codebase already names as a bug class. The
  // clearest case is Finance following "Book for a patient" from the booking
  // page: they read Sessions and cannot change one, so New Booking is not
  // theirs, and without this they arrive at the Schedule calendar with
  // nothing saying why.
  //
  // Computed once from the URL this render was given, held in state so it
  // clears the moment they navigate. Only an *explicitly asked for* screen
  // counts -- landing on a section's default because no tab was named is not
  // a refusal.
  const [missedTab, setMissedTab] = useState<string | null>(() =>
    unreachableTabLabel(initialSection ?? null, initialTab ?? null, initial)
  );
  const markLeaving = useLeavingPage();
  // The phone's full menu (a modal sheet), and what has been typed into its
  // "Find a screen" box. The 2xl sidebar has the same box, sharing state, so
  // a half-typed filter is not lost when a window is resized across it.
  const [menuOpen, setMenuOpen] = useState(false);
  const [screenQuery, setScreenQuery] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

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
      // `limitedScope` passed here too. Without it this defaulted to false
      // and dropped every `limitedScopesOnly` screen on mount and on Back --
      // so a limited desk deep-linking to Today -> Activity, or walking back
      // to it, landed on Today's overview instead, having resolved the URL
      // differently from the server that had just rendered it.
      // The URL wins when it names a screen -- that is what makes a deep
      // link, a pushState and the Back button all land where they say. When
      // it names nothing, the server's own answer does, and that second half
      // is load-bearing on the detail routes: `/admin/dashboard/patients/<id>`
      // carries no query at all, so reading the URL alone threw away the
      // screen the server had just rendered and reset the dashboard behind
      // the overlay to Today. Closing the overlay then revealed a screen the
      // admin had never asked for.
      const found = findTab(
        params.get("section") ?? initialSection ?? null,
        params.get("tab") ?? initialTab ?? null,
        allowedSections,
        manageSections,
        limitedScope
      );
      setSectionKey(found.section);
      setTabKey(found.tab);
    }
    applyFromLocation();
    window.addEventListener("popstate", applyFromLocation);
    return () => window.removeEventListener("popstate", applyFromLocation);
  }, [allowedSections, manageSections, limitedScope, initialSection, initialTab]);

  function navigate(nextSection: string, nextTab: string, view?: string | null) {
    setSectionKey(nextSection);
    setTabKey(nextTab);
    // The notice describes the link they arrived on, not the screen they
    // chose next.
    setMissedTab(null);
    const params = new URLSearchParams(window.location.search);
    params.set("section", nextSection);
    params.set("tab", nextTab);
    // `view` is a one-shot filter preset a Today row or a stat tile arrived
    // with (adminScreenHref). Carrying it onto the next screen would make it
    // sticky -- an admin who filtered to unassigned sessions once would keep
    // re-applying that filter every time they came back to the tab -- and
    // would also stop a repeat tap on the same row from re-applying it.
    params.delete("view");
    // ...unless this navigation *is* one of those presets. A Today count
    // linking to the rows it counted carries `view`, and it has to survive
    // into the URL for the target screen to read it -- `useSearchParams`
    // follows a pushState, so the screen applies it during its own render
    // rather than after a mount it never has (every screen is already
    // mounted).
    if (view) params.set("view", view);
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

  const shortcuts = adminShortcuts(sections);
  const totalBadge = sections.reduce((n, s) => n + sectionBadge(s.key), 0);
  const screenMatches = filterAdminScreens(sections, screenQuery);

  useEffect(() => {
    // The phone menu is a modal: Escape closes it, focus moves into it and
    // back to the button that opened it, and the page under it stays put.
    if (!menuOpen) return;
    const opener = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    menuRef.current?.querySelector<HTMLElement>("input, button")?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
    setScreenQuery("");
  }

  // The phone's Search shortcut: the people-and-sessions search already sits
  // at the top of every screen, so it brings that into view and focuses it
  // rather than opening a second, different search.
  function focusGlobalSearch() {
    closeMenu();
    window.scrollTo({ top: 0, behavior: "smooth" });
    const input = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[aria-label="Search the admin dashboard"]')
    ).find((el) => el.getClientRects().length > 0);
    input?.focus();
  }

  function count(n: number, className = "") {
    if (n <= 0) return null;
    return (
      <span
        className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-300 px-1.5 text-[11px] font-bold leading-none text-amber-900 ${className}`}
      >
        {n > 99 ? "99+" : n}
      </span>
    );
  }

  // One section entry. "rail" is the laptop's icon-over-label button; the
  // other two are the full-width row used by the 2xl sidebar and the phone
  // menu. A plain render function, not a nested component, so React never
  // treats it as its own component type.
  function renderSectionButton(
    section: (typeof sections)[number],
    variant: "sidebar" | "rail" | "menu",
    onNavigate?: () => void
  ) {
    const active = section.key === activeSection.key;
    const badge = sectionBadge(section.key);
    if (variant === "rail") {
      return (
        <button
          key={section.key}
          type="button"
          onClick={() => navigate(section.key, section.tabs[0].key)}
          aria-current={active ? "page" : undefined}
          title={section.label}
          className={`relative mx-1.5 flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-2 text-[11px] leading-tight tracking-tight transition ${
            active ? "bg-teal-50 font-bold text-teal-800" : "font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <i aria-hidden="true" className={`fa-solid ${section.icon} text-base`}></i>
          <span>{section.label}</span>
          {count(badge, "absolute left-1/2 top-1 ml-2 ring-2 ring-white")}
        </button>
      );
    }
    return (
      <div key={section.key}>
        <button
          type="button"
          onClick={() => {
            navigate(section.key, section.tabs[0].key);
            if (variant === "menu" && section.tabs.length <= 1) onNavigate?.();
          }}
          aria-current={active ? "page" : undefined}
          aria-expanded={section.tabs.length > 1 ? active : undefined}
          className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 transition ${
            active ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <i aria-hidden="true" className={`fa-solid ${section.icon} w-4 text-center text-sm`}></i>
          <span className="flex-1 text-left text-sm font-semibold">{section.label}</span>
          {count(badge)}
        </button>
        {/* Sub-tabs under their own section: an admin scanning for "where
            do I do X" reads one list, not a list plus a hidden strip. */}
        {active && section.tabs.length > 1 && renderSubTabs(section, onNavigate)}
      </div>
    );
  }

  function renderSubTabs(section: (typeof sections)[number], onNavigate?: () => void) {
    return (
      <div className="mb-1 ml-5 mt-1 space-y-0.5 border-l-2 border-slate-100 pl-2">
        {section.tabs.map((t, i) => {
          const tabBadge = badges[`${section.key}:${t.key}`] ?? 0;
          // A caption whenever the group changes, so Settings' screens read
          // as short lists rather than one long one.
          const caption = t.group && t.group !== section.tabs[i - 1]?.group ? t.group : null;
          return (
            <Fragment key={t.key}>
              {caption && (
                <p
                  className={`px-2.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 ${
                    i === 0 ? "pt-1" : "pt-3"
                  }`}
                >
                  {caption}
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  navigate(section.key, t.key);
                  onNavigate?.();
                }}
                aria-current={t.key === tabKey ? "page" : undefined}
                className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition ${
                  t.key === tabKey ? "bg-slate-100 text-teal-800" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className="flex-1">{t.label}</span>
                {count(tabBadge, "h-4 min-w-4 text-[10px]")}
              </button>
            </Fragment>
          );
        })}
      </div>
    );
  }

  // "Find a screen": narrows the menu to screens whose name matches, for the
  // admin who knows they want Payouts and not which section it is under.
  // Not the people-and-sessions search in the header -- that one finds rows.
  function renderScreenFilter(id: string) {
    return (
      <div className="relative mb-3">
        <i
          aria-hidden="true"
          className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400"
        ></i>
        <label htmlFor={id} className="sr-only">
          Find a screen
        </label>
        <input
          id={id}
          type="search"
          value={screenQuery}
          onChange={(e) => setScreenQuery(e.target.value)}
          placeholder="Find a screen…"
          autoComplete="off"
          className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none"
        />
      </div>
    );
  }

  function renderMatches(onNavigate?: () => void) {
    if (screenMatches.length === 0) {
      return <p className="px-3.5 py-3 text-sm text-slate-500">No screen called that.</p>;
    }
    return (
      <div className="space-y-0.5">
        {screenMatches.map((m) => (
          <button
            key={`${m.section}:${m.tab}`}
            type="button"
            onClick={() => {
              navigate(m.section, m.tab);
              setScreenQuery("");
              onNavigate?.();
            }}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 py-2 text-left text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <i aria-hidden="true" className={`fa-solid ${m.icon} w-4 text-center text-sm text-slate-400`}></i>
            <span className="flex-1 text-sm font-semibold">{m.label}</span>
            {m.label !== m.sectionLabel && <span className="text-xs text-slate-500">{m.sectionLabel}</span>}
          </button>
        ))}
      </div>
    );
  }

  function renderSections(variant: "sidebar" | "menu", onNavigate?: () => void) {
    return screenQuery.trim()
      ? renderMatches(onNavigate)
      : <div className="space-y-1">{sections.map((s) => renderSectionButton(s, variant, onNavigate))}</div>;
  }

  // In every render. The admin dashboard is in NAV_HIDDEN_ROUTES like the
  // other three, so without this the only way off it is Log Out -- which
  // also ends the session. A plain anchor: this leaves the dashboard chrome
  // for the public site's own layout, the transition DashboardShell's nav
  // entries document as silently not completing client-side here.
  function renderHomeLink(variant: "sidebar" | "rail" | "menu", onNavigate?: () => void) {
    return (
      // eslint-disable-next-line @next/next/no-html-link-for-pages
      <a
        href="/"
        onClick={() => {
          markLeaving();
          onNavigate?.();
        }}
        className={
          variant === "rail"
            ? "mx-2 flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center text-[11px] font-semibold leading-tight text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            : "flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        }
      >
        <i aria-hidden="true" className={`fa-solid fa-house ${variant === "rail" ? "text-base" : "w-4 text-center text-sm"}`}></i>
        <span>Back to Home</span>
      </a>
    );
  }

  function renderSignOut(variant: "sidebar" | "rail" | "menu") {
    if (variant === "rail") {
      return (
        <button
          type="button"
          onClick={handleSignOut}
          aria-label="Log Out"
          title="Log Out"
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <i aria-hidden="true" className="fa-solid fa-arrow-right-from-bracket text-sm"></i>
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={handleSignOut}
        className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
          variant === "menu" ? "text-red-700 hover:bg-red-50" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        <i aria-hidden="true" className="fa-solid fa-arrow-right-from-bracket w-4 text-center text-sm"></i>
        <span>Log Out</span>
      </button>
    );
  }

  function renderIdentity() {
    return (
      <div className="flex min-w-0 items-center gap-2.5 px-2.5 py-2">
        <AvatarThumbnail url={adminAvatarUrl} name={adminName} size={32} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{adminName}</p>
          {/* No scope pill here: the brand and the page header both name
              the dashboard already. */}
          <p className="truncate text-xs text-slate-500">{adminEmail}</p>
        </div>
      </div>
    );
  }

  function renderBrand() {
    return (
      <div className="flex min-w-0 items-center gap-2.5 px-1 py-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white">
          <i aria-hidden="true" className="fa-solid fa-user-doctor text-sm"></i>
        </div>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold leading-tight text-slate-900">{scopeLabel}</span>
          <span className="block text-[11px] leading-tight text-slate-500">Admin Panel</span>
        </span>
      </div>
    );
  }

  const top = offsetTop ? "top-[41px] h-[calc(100vh-41px)]" : "top-0 h-screen";
  const activeTabLabel = activeSection.tabs.find((t) => t.key === tabKey)?.label ?? "";

  return (
    // Its own full-height app shell, in the same light chrome as the other
    // three dashboards (DashboardShell). Navbar/Footer are hidden on this
    // route, so this component owns the entire viewport.
    //
    // Both channels notify rather than refresh, and the provider carries the
    // count from them to the Refresh button in the header: a rebuild here is
    // ~41 queries and most of what arrives is not what the reader is waiting
    // on. The other three dashboards still refresh themselves.
    //
    // Navigation by width, like DashboardShell's: a phone gets a top bar,
    // two shortcuts plus Search and the full menu along the bottom;
    // `lg` to `2xl` an 88px icon rail with this section's screens as a
    // strip above the content; `2xl` up the full sidebar with sub-screens
    // nested under their section.
    <AdminScreenNavigationProvider value={{ goToScreen: navigate }}>
    <LiveUpdatesProvider>
    <div className="min-h-screen bg-slate-50">
      <RealtimeRefresh
        tables={ADMIN_REALTIME_TABLES}
        cooldownMs={ADMIN_REALTIME_COOLDOWN_MS}
        mode="notify"
      />
      <RealtimeRefresh
        tables={ADMIN_CATALOG_REALTIME_TABLES}
        cooldownMs={ADMIN_CATALOG_REALTIME_COOLDOWN_MS}
        mode="notify"
      />

      {/* Phone top bar */}
      <div
        className={`sticky z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 pl-3 pr-1 backdrop-blur lg:hidden ${
          offsetTop ? "top-[41px]" : "top-0"
        }`}
      >
        {renderBrand()}
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          className="relative flex h-12 w-12 items-center justify-center rounded-lg text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <i aria-hidden="true" className="fa-solid fa-bars text-lg"></i>
          {count(totalBadge, "absolute right-0.5 top-1")}
        </button>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/45" onClick={closeMenu}></div>
          <div
            ref={menuRef}
            role="dialog"
            aria-modal="true"
            aria-label="Admin menu"
            className="absolute inset-0 flex flex-col overflow-y-auto bg-white px-3 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 sm:inset-y-0 sm:left-0 sm:right-auto sm:w-96"
          >
            <div className="mb-3 flex items-center justify-between">
              {renderBrand()}
              <button
                type="button"
                onClick={closeMenu}
                aria-label="Close menu"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <i aria-hidden="true" className="fa-solid fa-xmark"></i>
              </button>
            </div>
            {renderScreenFilter("admin-menu-screen-filter")}
            <nav aria-label="Admin sections" className="flex-1">
              {renderSections("menu", closeMenu)}
              <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                {renderHomeLink("menu", closeMenu)}
                {renderIdentity()}
                {renderSignOut("menu")}
              </div>
            </nav>
          </div>
        </div>
      )}

      {/* Laptop icon rail */}
      <nav
        aria-label="Admin sections"
        className={`fixed left-0 z-30 hidden w-[88px] flex-col border-r border-slate-200 bg-white py-3 lg:flex 2xl:hidden ${top}`}
      >
        <div className="mb-3 flex flex-col items-center gap-1.5 px-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-white">
            <i aria-hidden="true" className="fa-solid fa-user-doctor text-sm"></i>
          </div>
          {/* The rail keeps the dashboard's name: a scoped admin asks
              "which one am I on" at every width. */}
          <span className="text-[10px] font-bold leading-tight text-slate-700">{scopeLabel}</span>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto">
          {sections.map((s) => renderSectionButton(s, "rail"))}
        </div>
        <div className="space-y-1 border-t border-slate-100 pt-2">
          {renderHomeLink("rail")}
          <div className="flex justify-center pt-1" title={`${adminName} · ${adminEmail}`}>
            <AvatarThumbnail url={adminAvatarUrl} name={adminName} size={36} />
          </div>
          {renderSignOut("rail")}
        </div>
      </nav>

      {/* Desktop sidebar */}
      <nav
        aria-label="Admin sections"
        className={`fixed left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white p-4 2xl:flex ${top}`}
      >
        {renderBrand()}
        <div className="mt-2">{renderScreenFilter("admin-sidebar-screen-filter")}</div>
        <div className="flex-1 overflow-y-auto">{renderSections("sidebar")}</div>
        <div className="mt-2 space-y-1 border-t border-slate-100 pt-3">
          {renderHomeLink("sidebar")}
          {renderIdentity()}
          {renderSignOut("sidebar")}
        </div>
      </nav>

      {/* Phone shortcuts. data-tabbar lifts toasts and the live-update
          banner above it (--app-bottom-inset in globals.css). */}
      <nav
        aria-label="Admin shortcuts"
        data-tabbar=""
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-slate-200 bg-white px-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5 lg:hidden"
        style={{ gridTemplateColumns: `repeat(${shortcuts.length + 2}, minmax(0, 1fr))` }}
      >
        {shortcuts.map((sc) => {
          const active = activeSection.key === sc.section && tabKey === sc.tab;
          const n = badges[`${sc.section}:${sc.tab}`] ?? 0;
          return (
            <button
              key={`${sc.section}:${sc.tab}`}
              type="button"
              onClick={() => navigate(sc.section, sc.tab)}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 text-[11px] ${
                active ? "font-bold text-teal-700" : "font-semibold text-slate-500"
              }`}
            >
              <i aria-hidden="true" className={`fa-solid ${sc.icon} text-lg`}></i>
              <span className="max-w-full truncate px-0.5">{sc.label}</span>
              {n > 0 && (
                <span className="absolute left-1/2 top-1 ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-700 px-1.5 text-[11px] font-bold leading-none text-white ring-2 ring-white">
                  {n > 99 ? "99+" : n}
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={focusGlobalSearch}
          className="flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-slate-500"
        >
          <i aria-hidden="true" className="fa-solid fa-magnifying-glass text-lg"></i>
          <span>Search</span>
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-haspopup="dialog"
          className="flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-slate-500"
        >
          <i aria-hidden="true" className="fa-solid fa-bars text-lg"></i>
          <span>All sections</span>
        </button>
      </nav>

      <div className="pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-[88px] 2xl:pl-64">
        <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4 sm:mb-8">
            <div className="min-w-0">
              {/* Which dashboard this is, above what part of it you are
                  looking at -- a question a scoped admin has on every
                  screen and at every width. */}
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-teal-700">
                <i aria-hidden className="fa-solid fa-shield-halved text-[10px]" />
                {scopeLabel}
              </p>
              <h1 className="mt-0.5 text-2xl font-bold text-slate-900">
                {activeSection.label}
                {/* Suppressed when the screen's own name repeats the
                    section's -- "Today Today" reads as a rendering bug. */}
                {activeSection.tabs.length > 1 && activeTabLabel && activeTabLabel !== activeSection.label && (
                  <span className="ml-2 text-base font-semibold text-slate-500">{activeTabLabel}</span>
                )}
              </h1>
              {/* The screen's own sentence when it has one, the section's
                  otherwise. */}
              {(() => {
                const activeTab = activeSection.tabs.find((t) => t.key === tabKey);
                if (!activeTab?.blurb) {
                  return <p className="text-xs text-slate-500 mt-1">{activeSection.blurb}</p>;
                }
                return (
                  <div className="mt-1 max-w-2xl">
                    <p className="text-xs text-slate-600">{activeTab.blurb}</p>
                    {activeTab.example && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        <span className="font-semibold text-slate-600">For example:</span>{" "}
                        {activeTab.example}
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
              <AdminGlobalSearch entities={searchEntities} />
              {/* Beside the search: it acts on the screen in front of you. */}
              <RefreshButton />
            </div>
          </div>

          {/* Below 2xl the rail has no room for a second level, so this
              section's screens are a strip above its content instead -- one
              tap between Schedule and All Sessions, at every width. */}
          {activeSection.tabs.length > 1 && (
            <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 2xl:hidden">
              <div role="group" aria-label={`${activeSection.label} screens`} className="flex w-max gap-2 pb-1">
                {activeSection.tabs.map((t) => {
                  const on = t.key === tabKey;
                  const n = badges[`${activeSection.key}:${t.key}`] ?? 0;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => navigate(activeSection.key, t.key)}
                      aria-current={on ? "page" : undefined}
                      className={`inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition ${
                        on
                          ? "border-teal-700 bg-teal-700 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      {t.label}
                      {count(n, "h-[18px] min-w-[18px] text-[10px]")}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {missedTab && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
              <i aria-hidden className="fa-solid fa-circle-info text-[11px]" />
              <span>
                <strong className="font-semibold">{missedTab}</strong> is not part of your
                access, so this is the nearest screen you can open. Ask a Master Admin if
                you need it.
              </span>
              <button
                type="button"
                onClick={() => setMissedTab(null)}
                className="ml-auto rounded-lg border border-amber-300 bg-white px-2 py-1 font-semibold text-amber-800 transition hover:bg-amber-100"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Every screen stays mounted and is hidden with CSS rather than
              unmounted, so a half-typed filter or an open row survives a
              look at another screen. */}
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
    </LiveUpdatesProvider>
    </AdminScreenNavigationProvider>
  );
}
