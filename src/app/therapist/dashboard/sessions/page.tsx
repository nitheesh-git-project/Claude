import type { Metadata } from "next";
import TherapistDashboardShell from "@/components/therapist/TherapistDashboardShell";
import SurfaceCard from "@/components/dashboard/SurfaceCard";
import SessionFilterList from "@/components/dashboard/SessionFilterList";
import {
  renderTherapistSessionCard,
  renderTherapistHomeVisitCard,
} from "@/components/therapist/TherapistSessionCards";
import { loadTherapistDashboard } from "@/lib/therapistDashboardData";

export const metadata: Metadata = {
  title: "Sessions | Dr. Pooja's Physio",
};

// One list of everything assigned to this therapist. Video consultations
// and home visits were two screens over the same rows, so "what am I doing
// tomorrow?" meant reading both and merging them by hand.
export default async function Page() {
  const d = await loadTherapistDashboard("sessions");

  const sessions = d.appointments.map((a) => ({
    id: a.id,
    slotTime: a.slot_time,
    status: a.status,
    noShow: a.no_show,
    isHomeVisit: a.visit?.visit_mode === "home_visit",
  }));
  const cardsById = Object.fromEntries(
    d.appointments.map((a) => [
      a.id,
      a.visit?.visit_mode === "home_visit"
        ? renderTherapistHomeVisitCard(d, a)
        : renderTherapistSessionCard(d, a),
    ])
  );

  return (
    <TherapistDashboardShell
      data={d}
      title="Sessions"
      subtitle="Everything assigned to you — video consultations and home visits together."
    >
      <SurfaceCard title="Assigned sessions" icon="fa-clipboard-list">
        <SessionFilterList
          sessions={sessions}
          cardsById={cardsById}
          nowMs={d.nowMs}
          emptyTitle="Nothing assigned yet"
          emptyBody="Keep your weekly availability up to date — the clinic assigns bookings into the hours you have open."
        />
      </SurfaceCard>
    </TherapistDashboardShell>
  );
}
