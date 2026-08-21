import type { Metadata } from "next";
import Link from "next/link";
import PatientDashboardShell from "@/components/patient/PatientDashboardShell";
import SurfaceCard from "@/components/dashboard/SurfaceCard";
import SessionsView from "@/components/dashboard/SessionsView";
import { renderPatientSessionCard } from "@/components/patient/PatientSessionCard";
import { loadPatientDashboard } from "@/lib/patientDashboardData";
import { BOOKING_FROM_DASHBOARD } from "@/components/BookingBackToSessions";

export const metadata: Metadata = {
  title: "Your Sessions | Dr. Pooja's Physio",
};

// One screen for every session -- video and home visit together, as a
// filtered list or a month calendar. "When is my next session?" should be
// one place to look; see SessionsView and SessionFilterList for the full
// reasoning.
export default async function Page() {
  const d = await loadPatientDashboard("sessions");

  const sessions = d.appointments.map((a) => ({
    id: a.id,
    slotTime: a.slot_time,
    status: a.status,
    noShow: a.no_show,
    isHomeVisit: d.visitDetailById.get(a.id)?.visit_mode === "home_visit",
  }));
  const cardsById = Object.fromEntries(
    d.appointments.map((a) => [a.id, renderPatientSessionCard(d, a, d.visitDetailById.get(a.id) ?? null)])
  );

  return (
    <PatientDashboardShell
      data={d}
      title="Your Sessions"
      subtitle="Every session you have booked — video consultations and home visits together."
    >
      <SurfaceCard
        title="Your Sessions"
        icon="fa-calendar-check"
        actions={
          /* ?from=dashboard so Back off the booking page returns here --
             see BookingBackToSessions. */
          <Link
            href={BOOKING_FROM_DASHBOARD}
            className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-800"
          >
            Book a session
          </Link>
        }
      >
        <SessionsView
          sessions={sessions}
          cardsById={cardsById}
          nowMs={d.nowMs}
          showMotivation
          emptyTitle="Nothing here yet"
          emptyBody="Book a session and it shows up here with your joining details."
        />
      </SurfaceCard>
    </PatientDashboardShell>
  );
}
