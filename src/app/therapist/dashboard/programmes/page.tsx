import type { Metadata } from "next";
import TherapistDashboardShell from "@/components/therapist/TherapistDashboardShell";
import { loadTherapistDashboard } from "@/lib/therapistDashboardData";
import SurfaceCard from "@/components/dashboard/SurfaceCard";
import TherapistProgrammePatients from "@/components/packages/TherapistProgrammePatients";

export const metadata: Metadata = {
  title: "Programme Patients | Dr. Pooja's Physio",
};

export default async function Page() {
  const d = await loadTherapistDashboard();

  return (
    <TherapistDashboardShell data={d} title="Programme Patients" subtitle="Package purchases locked to you for their whole programme.">
      <SurfaceCard
        id="programmes"
        title="Programme Patients"
        icon="fa-layer-group"
        subtitle="Package purchases locked to you for their whole programme — tap one for the full completed/upcoming/pending picture."
        className="mt-8"
      >
        <TherapistProgrammePatients
          purchases={(d.programmePurchases ?? []).map((p) => ({
            id: p.id,
            purchaseCode: p.purchase_code,
            patientName: d.patientNameById.get(p.patient_id) ?? "Unknown patient",
            patientCode: d.patientMap.get(p.patient_id)?.patient_code ?? null,
            packageTitle: d.programmePackageTitleById.get(p.package_id) ?? "Session Package",
            sessionCount: p.session_count,
            sessionsUsed: p.sessions_used,
            completedCount: d.programmeCompletedByPurchase.get(p.id) ?? 0,
            scheduledCount: d.programmeScheduledByPurchase.get(p.id) ?? 0,
            status: p.status,
          }))}
        />
      </SurfaceCard>
    </TherapistDashboardShell>
  );
}
