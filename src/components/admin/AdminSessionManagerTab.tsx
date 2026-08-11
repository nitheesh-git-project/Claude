"use client";

import { useMemo, useState } from "react";
import type { AdminSettings } from "@/lib/adminSettings";
import PackageCatalogManager from "@/components/admin/PackageCatalogManager";
import PackagePurchasesTable, { type PurchaseRow } from "@/components/admin/PackagePurchasesTable";
import PackageSettingsForm from "@/components/admin/PackageSettingsForm";
import { daysUntilExpiry } from "@/lib/packageProgress";

type Package = {
  id: string;
  package_code: string | null;
  category_id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  promises: string[];
  badge_label: string | null;
  highlight: boolean;
  terms: string | null;
  session_count: number;
  price_paise: number;
  compare_at_paise: number | null;
  display_order: number;
  therapist_rate_basis: "package_actual" | "category_list";
  validity_days: number | null;
  session_duration_minutes: number | null;
  therapist_locked: boolean;
  min_gap_hours: number | null;
  max_sessions_per_week: number | null;
  max_purchases_per_patient: number | null;
  visible_on_home: boolean;
  visible_on_conditions: boolean;
  visible_in_dashboard: boolean;
  active: boolean;
};

type SubTab = "catalog" | "purchases" | "settings";

export default function AdminSessionManagerTab({
  packages,
  categories,
  purchases,
  therapists,
  settings,
}: {
  packages: Package[];
  categories: { id: string; title: string; price_paise: number }[];
  purchases: PurchaseRow[];
  therapists: { id: string; full_name: string }[];
  settings: AdminSettings;
}) {
  const [subTab, setSubTab] = useState<SubTab>("purchases");
  // Lazy initializer -- read once at mount, not on every render, so this
  // stays a pure render function (Date.now() directly in a useMemo body is
  // an impure call React's rules disallow). Same pattern as
  // ProfileSessionList/BookingWizard elsewhere in this codebase.
  const [now] = useState(() => Date.now());

  const stats = useMemo(() => {
    const activePurchases = purchases.filter((p) => p.status === "active");
    const sessionsBanked = purchases.reduce((sum, p) => sum + p.pendingCount, 0);
    const bankedValuePaise = purchases.reduce((sum, p) => {
      const perSession = p.sessionCount > 0 ? (p.amountPaidPaise ?? 0) / p.sessionCount : 0;
      return sum + perSession * p.pendingCount;
    }, 0);
    const expiringSoon = activePurchases.filter((p) => {
      const days = daysUntilExpiry(p.expiresAt, now);
      return days !== null && days <= settings.packageExpiryReminderDays;
    }).length;
    const totalRevenuePaise = purchases
      .filter((p) => p.paymentStatus === "paid")
      .reduce((sum, p) => sum + (p.amountPaidPaise ?? 0), 0);
    return {
      totalSold: purchases.length,
      activeCount: activePurchases.length,
      sessionsBanked,
      bankedValuePaise,
      expiringSoon,
      totalRevenuePaise,
    };
  }, [purchases, now, settings.packageExpiryReminderDays]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-lg text-slate-900">Session Manager</h2>
        <p className="text-xs text-slate-500 mt-1">
          Everything about session packages — the catalog patients see, every purchase ever made,
          and the platform-wide rules that govern them.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Packages Sold" value={String(stats.totalSold)} />
        <StatCard label="Active Packages" value={String(stats.activeCount)} />
        <StatCard
          label="Sessions Banked"
          value={String(stats.sessionsBanked)}
          sub={`≈ ₹${(stats.bankedValuePaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
        />
        <StatCard
          label={`Expiring ≤${settings.packageExpiryReminderDays}d`}
          value={String(stats.expiringSoon)}
          tone={stats.expiringSoon > 0 ? "text-amber-700" : undefined}
        />
        <StatCard label="Package Revenue" value={`₹${(stats.totalRevenuePaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} />
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {(
          [
            { key: "purchases", label: "Purchases" },
            { key: "catalog", label: "Catalog" },
            { key: "settings", label: "Settings" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition -mb-px ${
              subTab === t.key ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "purchases" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <PackagePurchasesTable
            purchases={purchases}
            packages={packages.map((p) => ({ id: p.id, title: p.title }))}
            categories={categories.map((c) => ({ id: c.id, title: c.title }))}
            therapists={therapists}
          />
        </div>
      )}

      {subTab === "catalog" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h3 className="font-bold text-sm text-slate-800 mb-1">Package Catalog</h3>
          <p className="text-xs text-slate-500 mb-4">
            What patients see and buy — name, image, promises, price, and every rule the
            programme runs by.
          </p>
          <PackageCatalogManager packages={packages} categories={categories} />
        </div>
      )}

      {subTab === "settings" && <PackageSettingsForm settings={settings} />}
    </div>
  );
}

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={`font-bold text-xl mt-1 ${tone ?? "text-slate-900"}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}
