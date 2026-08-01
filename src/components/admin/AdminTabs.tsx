"use client";

import { useState, type ReactNode } from "react";

export default function AdminTabs({
  overview,
  approvalBookings,
  sessionStory,
  patients,
  therapists,
  roster,
  calendar,
  b2bPartners,
  b2bBadgeCount,
  payouts,
  paymentHistory,
  siteContent,
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
  therapists: ReactNode;
  roster: ReactNode;
  calendar: ReactNode;
  b2bPartners: ReactNode;
  b2bBadgeCount: number;
  payouts: ReactNode;
  paymentHistory: ReactNode;
  siteContent: ReactNode;
}) {
  const [tab, setTab] = useState<
    | "overview"
    | "approvalBookings"
    | "sessionStory"
    | "patients"
    | "therapists"
    | "roster"
    | "calendar"
    | "b2b"
    | "payouts"
    | "paymentHistory"
    | "content"
  >("overview");

  const tabs: { key: typeof tab; label: string; badge?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "approvalBookings", label: "Approval & Bookings" },
    { key: "sessionStory", label: "Session Story" },
    { key: "patients", label: "Patients" },
    { key: "therapists", label: "Therapists" },
    { key: "roster", label: "Manage Roster" },
    { key: "calendar", label: "Calendar" },
    { key: "b2b", label: "B2B Partners", badge: b2bBadgeCount },
    { key: "payouts", label: "Payouts" },
    { key: "paymentHistory", label: "Payment History" },
    { key: "content", label: "Site Content" },
  ];

  return (
    // A plain block below lg (so the horizontal bar sits above the
    // content, stacked), a row flex at lg+ (sidebar beside the content).
    // Content is rendered exactly once either way -- only the nav chrome
    // around it switches with the breakpoint -- since duplicating it into
    // two parallel trees would double-mount every tab's components (and
    // any of their side effects/requests) at once.
    <div className="lg:flex lg:gap-8 lg:items-start">
      {/* Narrow screens: the original horizontal, scrollable tab bar -- a
          fixed-width left sidebar doesn't leave enough room for content on
          a phone/tablet. */}
      <div className="lg:hidden flex gap-2 mb-6 border-b border-slate-200 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
              tab === t.key
                ? "border-teal-700 text-teal-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
            {!!t.badge && t.badge > 0 && (
              <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* lg and up: vertical sidebar on the left. */}
      <nav className="hidden lg:block w-56 shrink-0 sticky top-8 space-y-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-semibold transition flex items-center justify-between gap-2 border-l-4 ${
              tab === t.key
                ? "border-teal-700 bg-teal-50 text-teal-700"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span>{t.label}</span>
            {!!t.badge && t.badge > 0 && (
              <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="flex-1 min-w-0">
        <div className={tab === "overview" ? "" : "hidden"}>{overview}</div>
        <div className={tab === "approvalBookings" ? "" : "hidden"}>{approvalBookings}</div>
        <div className={tab === "sessionStory" ? "" : "hidden"}>{sessionStory}</div>
        <div className={tab === "patients" ? "" : "hidden"}>{patients}</div>
        <div className={tab === "therapists" ? "" : "hidden"}>{therapists}</div>
        <div className={tab === "roster" ? "" : "hidden"}>{roster}</div>
        <div className={tab === "calendar" ? "" : "hidden"}>{calendar}</div>
        <div className={tab === "b2b" ? "" : "hidden"}>{b2bPartners}</div>
        <div className={tab === "payouts" ? "" : "hidden"}>{payouts}</div>
        <div className={tab === "paymentHistory" ? "" : "hidden"}>{paymentHistory}</div>
        <div className={tab === "content" ? "" : "hidden"}>{siteContent}</div>
      </div>
    </div>
  );
}
