import type { Metadata } from "next";
import TherapistDashboardShell from "@/components/therapist/TherapistDashboardShell";
import { loadTherapistDashboard } from "@/lib/therapistDashboardData";
import SurfaceCard from "@/components/dashboard/SurfaceCard";
import { renderTherapistHomeVisitCard } from "@/components/therapist/TherapistSessionCards";

export const metadata: Metadata = {
  title: "Home Visits | Dr. Pooja's Physio",
};

export default async function Page() {
  const d = await loadTherapistDashboard("home-visits");

  return (
    <TherapistDashboardShell data={d} title="Home Visits" subtitle="Sessions you travel to.">
      {d.homeVisits.length > 0 && (
        <SurfaceCard
          id="home-visits"
          title="Home Visits"
          icon="fa-house-medical"
          subtitle="Sessions you travel to. Check the address and access notes before you set off."
          className="mt-8"
        >
          <ul className="space-y-3">
            {d.homeVisits.map((a) => (
              <li key={a.id}>{renderTherapistHomeVisitCard(d, a)}</li>
            ))}
          </ul>
        </SurfaceCard>
      )}
    </TherapistDashboardShell>
  );
}
