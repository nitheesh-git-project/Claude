"use client";

import { useState } from "react";
import type { AdminSettings } from "@/lib/adminSettings";
import HomeVisitPackageManager from "@/components/admin/HomeVisitPackageManager";
import type { HomeVisitPackage } from "@/components/admin/HomeVisitPackageForm";
import HomeVisitAreaManager, {
  type ServiceAreaRow,
  type WaitlistRow,
} from "@/components/admin/HomeVisitAreaManager";
import HomeVisitSettingsForm from "@/components/admin/HomeVisitSettingsForm";
import HomeVisitQueue, { type HomeVisitRow } from "@/components/admin/HomeVisitQueue";

// Programmes and Cash Ledger join this union in Phases 6 and 5 -- the shell
// is deliberately the same one AdminSessionManagerTab uses so adding them is
// a switch case, not a rewrite.
type SubTab = "visits" | "catalog" | "areas" | "settings";

export default function AdminHomeVisitsTab({
  visits,
  therapists,
  packages,
  areas,
  waitlist,
  categories,
  settings,
}: {
  visits: HomeVisitRow[];
  therapists: { id: string; full_name: string }[];
  packages: HomeVisitPackage[];
  areas: ServiceAreaRow[];
  waitlist: WaitlistRow[];
  categories: { id: string; title: string }[];
  settings: AdminSettings;
}) {
  // Visits first: once the service is live this is the tab an admin opens
  // to do today's work, and the catalogue is set up once and rarely touched.
  const [subTab, setSubTab] = useState<SubTab>("visits");

  const activeAreas = areas.filter((a) => a.active).length;
  const livePackages = packages.filter((p) => p.active).length;
  const newRequests = waitlist.filter((w) => w.status === "new").length;
  const cities = new Set(areas.filter((a) => a.active).map((a) => a.city.toLowerCase())).size;
  const unassigned = visits.filter((v) => !v.therapist_id && v.status !== "cancelled").length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-lg text-slate-900">Home Visit</h2>
        <p className="text-xs text-slate-500 mt-1">
          Where a therapist will travel, what a home visit costs, and the rules the whole flow runs
          by.
        </p>
      </div>

      {!settings.homeVisitEnabled && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
          Home Visit is switched off. Patients see nothing about it anywhere — set everything up
          here first, then turn it on under Settings.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard
          label="Needs a Therapist"
          value={String(unassigned)}
          tone={unassigned > 0 ? "text-amber-700" : undefined}
        />
        <StatCard label="Pincodes Served" value={String(activeAreas)} />
        <StatCard label="Cities" value={String(cities)} />
        <StatCard label="Packages Live" value={String(livePackages)} />
        <StatCard
          label="Out-of-area Requests"
          value={String(newRequests)}
          tone={newRequests > 0 ? "text-amber-700" : undefined}
        />
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {(
          [
            { key: "visits", label: "Visits" },
            { key: "catalog", label: "Catalog" },
            { key: "areas", label: "Service Areas" },
            { key: "settings", label: "Settings" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition -mb-px ${
              subTab === t.key
                ? "border-teal-600 text-teal-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "visits" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <HomeVisitQueue visits={visits} therapists={therapists} />
        </div>
      )}

      {subTab === "catalog" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h3 className="font-bold text-sm text-slate-800 mb-1">Home Visit Packages</h3>
          <p className="text-xs text-slate-500 mb-4">
            What patients see and buy. A one-off visit is a package with 1 visit — there is no
            separate single-visit product.
          </p>
          <HomeVisitPackageManager packages={packages} categories={categories} />
        </div>
      )}

      {subTab === "areas" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <HomeVisitAreaManager areas={areas} waitlist={waitlist} />
        </div>
      )}

      {subTab === "settings" && (
        <HomeVisitSettingsForm
          settings={settings}
          areaCount={activeAreas}
          packageCount={livePackages}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={`font-bold text-xl mt-1 ${tone ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}
