import type { Metadata } from "next";
import HospitalDashboardShell from "@/components/hospital/HospitalDashboardShell";
import { loadHospitalDashboard } from "@/lib/hospitalDashboardData";
import SurfaceCard from "@/components/dashboard/SurfaceCard";
import SubmitReferralForm from "@/components/hospital/SubmitReferralForm";

export const metadata: Metadata = {
  title: "Refer a Patient | Dr. Pooja's Physio",
};

export default async function Page() {
  const d = await loadHospitalDashboard("refer");

  return (
    <HospitalDashboardShell data={d} title="Refer a Patient" subtitle="Send a patient across and the clinic takes it from there.">
        <SurfaceCard
          id="refer"
          title="Refer a Patient"
          icon="fa-user-plus"
          subtitle="Send a patient across and the clinic takes it from there."
        >
          <SubmitReferralForm hospitalId={d.user.id} homeVisitEnabled={d.adminSettings.homeVisitEnabled} />
        </SurfaceCard>
    </HospitalDashboardShell>
  );
}
