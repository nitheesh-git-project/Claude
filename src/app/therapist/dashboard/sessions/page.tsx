import type { Metadata } from "next";
import TherapistDashboardShell from "@/components/therapist/TherapistDashboardShell";
import { loadTherapistDashboard } from "@/lib/therapistDashboardData";
import SurfaceCard, { EmptyState } from "@/components/dashboard/SurfaceCard";
import { renderTherapistSessionCard } from "@/components/therapist/TherapistSessionCards";

export const metadata: Metadata = {
  title: "Assigned Sessions | Dr. Pooja's Physio",
};

export default async function Page() {
  const d = await loadTherapistDashboard();

  return (
    <TherapistDashboardShell data={d} title="Assigned Sessions" subtitle="Video consultations the clinic has assigned to you.">
      <SurfaceCard
        id="sessions"
        title="Assigned Patient Sessions"
        icon="fa-clipboard-list"
        subtitle="Video consultations the clinic has assigned to you."
      >
        {d.onlineAppointments.length === 0 ? (
          <EmptyState
            icon="fa-clipboard-list"
            title="No sessions assigned yet"
            body="Keep your weekly availability up to date — the clinic assigns bookings into the hours you have open."
          />
        ) : (
          <ul className="space-y-3">
            {d.onlineAppointments.map((a) => (
              <li key={a.id}>{renderTherapistSessionCard(d, a)}</li>
            ))}
          </ul>
        )}
      </SurfaceCard>
    </TherapistDashboardShell>
  );
}
