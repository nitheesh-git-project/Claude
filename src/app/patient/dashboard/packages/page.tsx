import type { Metadata } from "next";
import PatientDashboardShell from "@/components/patient/PatientDashboardShell";
import { loadPatientDashboard } from "@/lib/patientDashboardData";
import PatientPackageWidget from "@/components/packages/PatientPackageWidget";
import HomeVisitPackageWidget from "@/components/patient/HomeVisitPackageWidget";
import TabSummary from "@/components/dashboard/TabSummary";
import { pickHomeProgramme } from "@/lib/patientHomeCards";

export const metadata: Metadata = {
  title: "My programme | MoveRestore",
};

export default async function Page() {
  const d = await loadPatientDashboard("packages");

  // The programme with the most still to book, the same pick Home makes, so
  // the two screens point at the same thing.
  const lead = pickHomeProgramme(
    d.ownedPackages ?? [],
    d.completedCountByPurchase,
    d.scheduledCountByPurchase,
    (p) => d.programmeDisplayByPurchase.get(p.id)?.title ?? "Your programme",
    d.therapistMap as Map<string, string>
  );
  const otherActive = (d.ownedPackages ?? []).filter((p) => p.status === "active").length - (lead ? 1 : 0);

  return (
    <PatientDashboardShell data={d} title="My programme" subtitle="The treatment your physiotherapist arranged, and the sessions you have left.">
      {lead && (
        <TabSummary
          testId="programme-summary"
          eyebrow="Your programme"
          tone="hero"
          title={
            lead.toBook > 0
              ? `${lead.toBook} paid ${lead.toBook === 1 ? "session" : "sessions"} left to book`
              : lead.scheduled > 0
                ? "Every session is booked"
                : "All sessions used"
          }
          detail={[
            lead.title,
            lead.therapistName ? `with ${lead.therapistName}` : null,
            otherActive > 0 ? `+ ${otherActive} more ${otherActive === 1 ? "programme" : "programmes"} below` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          action={lead.toBook > 0 ? { label: "Book your next session", href: "#your-packages", icon: "fa-calendar-plus" } : null}
          facts={[
            { label: "Done", value: `${lead.completed} of ${lead.total}`, tone: "green" },
            { label: "Booked", value: String(lead.scheduled), tone: "teal" },
            { label: "Left to book", value: String(lead.toBook), tone: lead.toBook > 0 ? "amber" : "slate" },
          ]}
        />
      )}
      {d.ownedPackages && d.ownedPackages.length > 0 && (
        <div id="your-packages" className="mt-8 scroll-mt-24">
          <PatientPackageWidget
            bulkScheduleMax={d.adminSettings.packageBulkScheduleMax}
            expiryReminderDays={d.adminSettings.packageExpiryReminderDays}
            purchases={d.ownedPackages.map((p) => ({
              id: p.id,
              purchaseCode: p.purchase_code,
              programmeTag: d.programmeTagByPurchase.get(p.id) ?? null,
              title: d.programmeDisplayByPurchase.get(p.id)?.title ?? "Your programme",
              cover: d.programmeDisplayByPurchase.get(p.id)?.cover ?? null,
              sessionCount: p.session_count,
              sessionsUsed: p.sessions_used,
              completedCount: d.completedCountByPurchase.get(p.id) ?? 0,
              scheduledCount: d.scheduledCountByPurchase.get(p.id) ?? 0,
              status: p.status,
              expiresAt: p.expires_at,
              therapistName: p.locked_therapist_id ? d.therapistMap.get(p.locked_therapist_id) ?? null : null,
              frequencyPerWeek: d.frequencyByPurchase.get(p.id) ?? null,
              minGapHours: d.ownedPackageInfoMap.get(p.package_id)?.min_gap_hours ?? null,
              maxPerWeek: d.ownedPackageInfoMap.get(p.package_id)?.max_sessions_per_week ?? null,
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
              programmeTag: d.programmeTagByPurchase.get(p.id) ?? null,
              title: d.programmeDisplayByPurchase.get(p.id)?.title ?? "Home visits",
              cover: d.programmeDisplayByPurchase.get(p.id)?.cover ?? null,
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
