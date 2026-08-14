"use client";

import { useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";
import RealtimeRefresh from "@/components/RealtimeRefresh";

// Every base table this page's Promise.all queries (src/app/admin/dashboard/
// page.tsx) -- so any change, whether from another admin tab, a therapist/
// patient/hospital action, or a second admin logged in elsewhere, refreshes
// this dashboard. package_purchase_summary is deliberately excluded: it's a
// view, and postgres_changes only streams base tables -- its underlying
// patient_package_purchases is covered instead. See the supabase_realtime
// publication entries at the end of schema.sql. Fixed at module scope so
// RealtimeRefresh's own tables prop is referentially stable across renders.
const ADMIN_REALTIME_TABLES = [
  "appointments",
  "therapist_payout_requests",
  "patient_referrals",
  "b2b_leads",
  "profiles",
  "profile_change_requests",
  "patient_package_purchases",
  "payment_failure_log",
  "therapist_payout_batches",
  "site_settings",
  "therapist_availability_template",
  "therapist_availability_override",
  "appointment_reassignment_log",
  "treatment_categories",
  "treatment_category_packages",
  "testimonials",
  "faqs",
  "patient_condition_profiles",
  "condition_change_requests",
  "condition_access_grants",
  "pain_assessments",
  "home_visit_areas",
  "home_visit_packages",
  "home_visit_package_purchases",
  "home_visit_waitlist",
  "patient_addresses",
];

type TabKey =
  | "overview"
  | "approvalBookings"
  | "sessionStory"
  | "patients"
  | "conditions"
  | "therapists"
  | "roster"
  | "calendar"
  | "b2b"
  | "payouts"
  | "payoutRequests"
  | "paymentHistory"
  | "content"
  | "sessionManager"
  | "homeVisits"
  | "featureControl";

type TabDef = { key: TabKey; label: string; icon: string; badge?: number };

export default function AdminTabs({
  overview,
  approvalBookings,
  sessionStory,
  patients,
  conditions,
  conditionsBadgeCount,
  therapists,
  roster,
  calendar,
  b2bPartners,
  b2bBadgeCount,
  payouts,
  payoutRequests,
  payoutRequestsBadgeCount,
  paymentHistory,
  siteContent,
  sessionManager,
  homeVisits,
  homeVisitsBadgeCount,
  featureControl,
  adminName,
  adminEmail,
  adminAvatarUrl,
  offsetTop,
}: {
  // The at-a-glance landing tab -- the Metrics dashboard (cards/charts),
  // not the old approvals/bookings list. See approvalBookings below for
  // that.
  overview: ReactNode;
  // What used to be the Overview tab's own content (pending approvals +
  // All Bookings list), moved here and renamed so "Overview" can be a
  // pure at-a-glance metrics view instead.
  approvalBookings: ReactNode;
  sessionStory: ReactNode;
  patients: ReactNode;
  conditions: ReactNode;
  conditionsBadgeCount: number;
  therapists: ReactNode;
  roster: ReactNode;
  calendar: ReactNode;
  b2bPartners: ReactNode;
  b2bBadgeCount: number;
  payouts: ReactNode;
  payoutRequests: ReactNode;
  payoutRequestsBadgeCount: number;
  paymentHistory: ReactNode;
  siteContent: ReactNode;
  sessionManager: ReactNode;
  homeVisits: ReactNode;
  // Out-of-area requests waiting to be looked at -- the one thing on this
  // tab that arrives on its own and needs chasing, so it earns the badge.
  homeVisitsBadgeCount: number;
  featureControl: ReactNode;
  adminName: string;
  adminEmail: string;
  adminAvatarUrl: string | null;
  // Whether the dev-only DebugNav bar is showing above everything on this
  // page (same flag the root layout threads into Navbar as its own
  // `offsetTop` prop) -- this page hides the public Navbar entirely, so its
  // own fixed sidebar has to account for that offset itself instead of
  // inheriting it for free from normal document flow.
  offsetTop: boolean;
}) {
  const [tab, setTab] = useState<TabKey>("overview");
  // Desktop full <-> mini collapse. Independent of the mobile drawer below --
  // a phone gets an off-canvas drawer instead, never the mini/icon-only rail.
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const tabs: TabDef[] = [
    { key: "overview", label: "Overview", icon: "fa-gauge-high" },
    { key: "approvalBookings", label: "Approval & Bookings", icon: "fa-clipboard-check" },
    { key: "sessionStory", label: "Session Story", icon: "fa-book-open" },
    { key: "patients", label: "Patients", icon: "fa-user-injured" },
    { key: "conditions", label: "Patient Conditions", icon: "fa-notes-medical", badge: conditionsBadgeCount },
    { key: "therapists", label: "Therapists", icon: "fa-user-doctor" },
    { key: "roster", label: "Manage Roster", icon: "fa-calendar-days" },
    { key: "calendar", label: "Calendar", icon: "fa-calendar" },
    { key: "b2b", label: "B2B Partners", icon: "fa-handshake", badge: b2bBadgeCount },
    { key: "payouts", label: "Payouts", icon: "fa-sack-dollar" },
    {
      key: "payoutRequests",
      label: "Payout Requests",
      icon: "fa-hand-holding-dollar",
      badge: payoutRequestsBadgeCount,
    },
    { key: "paymentHistory", label: "Payment History", icon: "fa-receipt" },
    { key: "sessionManager", label: "Session Manager", icon: "fa-layer-group" },
    {
      key: "homeVisits",
      label: "Home Visit",
      icon: "fa-house-medical",
      badge: homeVisitsBadgeCount,
    },
    { key: "content", label: "Site Content", icon: "fa-pen-to-square" },
    { key: "featureControl", label: "Feature Control", icon: "fa-sliders" },
  ];

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
  // set in Feature Control applies to patient, therapist and hospital
  // sessions only. An admin is the one who configures that timeout and
  // routinely leaves this dashboard open while working elsewhere (waiting
  // on a payout, watching for a new approval), so timing them out of their
  // own control panel costs work and protects nothing they didn't choose.

  // A plain render function, not a nested component -- called directly as
  // renderNavItem(...) rather than <NavItem ... />, so React never treats it
  // as its own component type and there's nothing to remount every render.
  function renderNavItem(t: TabDef, mini: boolean, onNavigate?: () => void) {
    const active = tab === t.key;
    return (
      <button
        key={t.key}
        type="button"
        onClick={() => {
          setTab(t.key);
          onNavigate?.();
        }}
        title={mini ? t.label : undefined}
        className={`group relative w-full flex items-center gap-3 rounded-xl transition ${
          mini ? "justify-center px-0 py-3" : "px-3.5 py-2.5"
        } ${active ? "bg-teal-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
      >
        <i className={`fa-solid ${t.icon} ${mini ? "text-base" : "w-4 text-center text-sm"}`}></i>
        {!mini && <span className="flex-1 text-left text-sm font-semibold">{t.label}</span>}
        {!!t.badge && t.badge > 0 && !mini && (
          <span className="rounded-full bg-amber-300 px-1.5 py-0.5 text-[11px] font-bold text-amber-900">
            {t.badge}
          </span>
        )}
        {!!t.badge && t.badge > 0 && mini && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-400"></span>
        )}
        {mini && (
          <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 scale-95 whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:scale-100 group-hover:opacity-100">
            {t.label}
          </span>
        )}
      </button>
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
      <RealtimeRefresh tables={ADMIN_REALTIME_TABLES} />
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
            <div className="flex-1 space-y-1">
              {tabs.map((t) => renderNavItem(t, false, () => setMobileOpen(false)))}
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
        <div className="mt-2 flex-1 space-y-1 overflow-y-auto">
          {tabs.map((t) => renderNavItem(t, collapsed))}
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
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
            <p className="text-xs text-slate-500 mt-1">
              Manage approvals, bookings, and partner referrals
            </p>
          </div>

          <div className={tab === "overview" ? "" : "hidden"}>{overview}</div>
          <div className={tab === "approvalBookings" ? "" : "hidden"}>{approvalBookings}</div>
          <div className={tab === "sessionStory" ? "" : "hidden"}>{sessionStory}</div>
          <div className={tab === "patients" ? "" : "hidden"}>{patients}</div>
          <div className={tab === "conditions" ? "" : "hidden"}>{conditions}</div>
          <div className={tab === "therapists" ? "" : "hidden"}>{therapists}</div>
          <div className={tab === "roster" ? "" : "hidden"}>{roster}</div>
          <div className={tab === "calendar" ? "" : "hidden"}>{calendar}</div>
          <div className={tab === "b2b" ? "" : "hidden"}>{b2bPartners}</div>
          <div className={tab === "payouts" ? "" : "hidden"}>{payouts}</div>
          <div className={tab === "payoutRequests" ? "" : "hidden"}>{payoutRequests}</div>
          <div className={tab === "paymentHistory" ? "" : "hidden"}>{paymentHistory}</div>
          <div className={tab === "sessionManager" ? "" : "hidden"}>{sessionManager}</div>
          <div className={tab === "homeVisits" ? "" : "hidden"}>{homeVisits}</div>
          <div className={tab === "content" ? "" : "hidden"}>{siteContent}</div>
          <div className={tab === "featureControl" ? "" : "hidden"}>{featureControl}</div>
        </div>
      </div>
    </div>
  );
}
