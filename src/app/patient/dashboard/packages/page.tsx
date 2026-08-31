import type { Metadata } from "next";
import PatientDashboardShell from "@/components/patient/PatientDashboardShell";
import { loadPatientDashboard } from "@/lib/patientDashboardData";
import PatientPackageWidget from "@/components/packages/PatientPackageWidget";
import HomeVisitPackageWidget from "@/components/patient/HomeVisitPackageWidget";

export const metadata: Metadata = {
  title: "Packages | Dr. Pooja's Physio",
};

export default async function Page() {
  const d = await loadPatientDashboard("packages");

  return (
    <PatientDashboardShell data={d} title="Packages" subtitle="The programmes your therapist has arranged for you.">
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

    </PatientDashboardShell>
  );
}
