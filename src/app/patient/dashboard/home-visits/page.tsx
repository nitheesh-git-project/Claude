import type { Metadata } from "next";
import PatientDashboardShell from "@/components/patient/PatientDashboardShell";
import { loadPatientDashboard } from "@/lib/patientDashboardData";
import Link from "next/link";
import SurfaceCard from "@/components/dashboard/SurfaceCard";
import { renderPatientSessionCard } from "@/components/patient/PatientSessionCard";

export const metadata: Metadata = {
  title: "Your Home Visits | Dr. Pooja's Physio",
};

export default async function Page() {
  const d = await loadPatientDashboard("home-visits");

  return (
    <PatientDashboardShell data={d} title="Your Home Visits" subtitle="Sessions delivered at your address.">
      {d.homeVisitAppointments.length > 0 && (
        <SurfaceCard
          id="home-visits"
          title="Your Home Visits"
          icon="fa-house-medical"
          subtitle="A therapist coming to your address."
          className="mt-8"
          actions={
            <Link
              href="/book-home-visit"
              className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-800"
            >
              Book a Home Visit
            </Link>
          }
        >
          <ul className="space-y-3">
            {d.homeVisitAppointments.map((a) => (
              <li key={a.id}>{renderPatientSessionCard(d, a, d.visitDetailById.get(a.id) ?? null)}</li>
            ))}
          </ul>
        </SurfaceCard>
      )}
    </PatientDashboardShell>
  );
}
