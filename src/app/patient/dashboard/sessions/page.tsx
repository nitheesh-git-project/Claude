import type { Metadata } from "next";
import PatientDashboardShell from "@/components/patient/PatientDashboardShell";
import { loadPatientDashboard } from "@/lib/patientDashboardData";
import Link from "next/link";
import SurfaceCard from "@/components/dashboard/SurfaceCard";
import { renderPatientSessionCard } from "@/components/patient/PatientSessionCard";
import { BOOKING_FROM_DASHBOARD } from "@/components/BookingBackToSessions";

export const metadata: Metadata = {
  title: "Your Sessions | Dr. Pooja's Physio",
};

export default async function Page() {
  const d = await loadPatientDashboard();

  return (
    <PatientDashboardShell data={d} title="Your Sessions" subtitle="Video consultations, newest first.">
      {d.onlineAppointments.length > 0 && (
        <SurfaceCard
          id="sessions"
          title="Your Sessions"
          icon="fa-calendar-check"
          subtitle="Video consultations, newest first."
          className="mt-8"
          actions={
            /* ?from=dashboard so Back off the booking page returns here, to
               Your Sessions -- see BookingBackToSessions. */
            <Link
              href={BOOKING_FROM_DASHBOARD}
              className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-800"
            >
              Book New Session
            </Link>
          }
        >
          <ul className="space-y-3">
            {d.onlineAppointments.map((a) => (
              <li key={a.id}>{renderPatientSessionCard(d, a)}</li>
            ))}
          </ul>
        </SurfaceCard>
      )}
    </PatientDashboardShell>
  );
}
