import type { Metadata } from "next";
import PatientDashboardShell from "@/components/patient/PatientDashboardShell";
import { loadPatientDashboard } from "@/lib/patientDashboardData";
import SurfaceCard from "@/components/dashboard/SurfaceCard";
import PatientPackageWidget from "@/components/packages/PatientPackageWidget";
import HomeVisitPackageWidget from "@/components/patient/HomeVisitPackageWidget";
import BuyPackageButton from "@/components/BuyPackageButton";
import { computePackageSavings } from "@/lib/packageProgress";

export const metadata: Metadata = {
  title: "Packages | Dr. Pooja's Physio",
};

export default async function Page() {
  const d = await loadPatientDashboard();

  return (
    <PatientDashboardShell data={d} title="Packages" subtitle="Programmes you own, and the bundles you can buy.">
      {d.ownedPackages && d.ownedPackages.length > 0 && (
        <div id="your-packages" className="mt-8">
          <PatientPackageWidget
            bulkScheduleMax={d.adminSettings.packageBulkScheduleMax}
            expiryReminderDays={d.adminSettings.packageExpiryReminderDays}
            purchases={d.ownedPackages.map((p) => ({
              id: p.id,
              purchaseCode: p.purchase_code,
              title: d.ownedPackageInfoMap.get(p.package_id)?.title ?? d.activeCategoryMap.get(p.category_id) ?? "Session Package",
              imageUrl: d.ownedPackageInfoMap.get(p.package_id)?.image_url ?? null,
              sessionCount: p.session_count,
              sessionsUsed: p.sessions_used,
              completedCount: d.completedCountByPurchase.get(p.id) ?? 0,
              scheduledCount: d.scheduledCountByPurchase.get(p.id) ?? 0,
              status: p.status,
              expiresAt: p.expires_at,
              therapistName: p.locked_therapist_id ? d.therapistMap.get(p.locked_therapist_id) ?? null : null,
            }))}
          />
        </div>
      )}

      {d.ownedHomeVisitPackages && d.ownedHomeVisitPackages.length > 0 && (
        <div id="your-home-visit-packages" className="mt-8">
          <HomeVisitPackageWidget
            bulkScheduleMax={d.adminSettings.homeVisitBulkScheduleMax}
            expiryReminderDays={d.adminSettings.packageExpiryReminderDays}
            leadTimeHours={d.adminSettings.homeVisitLeadTimeHours}
            purchases={d.ownedHomeVisitPackages.map((p) => ({
              id: p.id,
              purchaseCode: p.purchase_code,
              title: d.ownedHomeVisitPackageInfoMap.get(p.package_id)?.title ?? "Home Visit Package",
              imageUrl: d.ownedHomeVisitPackageInfoMap.get(p.package_id)?.image_url ?? null,
              visitCount: p.visit_count,
              visitsUsed: p.visits_used,
              completedCount: d.completedCountByHomeVisitPurchase.get(p.id) ?? 0,
              scheduledCount: d.scheduledCountByHomeVisitPurchase.get(p.id) ?? 0,
              status: p.status,
              expiresAt: p.expires_at,
              therapistName: p.locked_therapist_id ? d.therapistMap.get(p.locked_therapist_id) ?? null : null,
              paymentMode: p.payment_mode,
            }))}
          />
        </div>
      )}

      {d.adminSettings.sessionPackagesVisible && d.availablePackages && d.availablePackages.length > 0 && (
        <SurfaceCard
          id="session-packages"
          title="Session Packages"
          icon="fa-layer-group"
          subtitle="Buy a bundle of sessions upfront and use them one at a time, whenever you're ready to book."
          className="mt-8"
        >
          <ul className="space-y-3">
            {d.availablePackages.map((pkg) => {
              const savings = computePackageSavings({
                sessionCount: pkg.session_count,
                pricePaise: pkg.price_paise,
                compareAtPaise: pkg.compare_at_paise,
                categoryPricePaise: d.categoryPriceMap.get(pkg.category_id) ?? null,
              });
              return (
                <li
                  key={pkg.id}
                  className="p-4 rounded-xl border border-slate-200 text-xs flex items-center justify-between gap-3 flex-wrap"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {pkg.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={pkg.image_url} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900">{pkg.title}</p>
                      <p className="text-slate-500 mt-1">
                        {d.activeCategoryMap.get(pkg.category_id) ?? "General Consultation"} •{" "}
                        {pkg.session_count} sessions • ₹{(savings.perSessionPaise / 100).toFixed(0)}/session
                        {savings.savingsPercent !== null && (
                          <span className="text-teal-700 font-semibold"> · Save {savings.savingsPercent}%</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <BuyPackageButton
                    packageId={pkg.id}
                    name={d.profile?.full_name ?? ""}
                    email={d.profile?.email ?? ""}
                    description={pkg.title}
                    priceInPaise={pkg.price_paise}
                  />
                </li>
              );
            })}
          </ul>
        </SurfaceCard>
      )}
    </PatientDashboardShell>
  );
}
