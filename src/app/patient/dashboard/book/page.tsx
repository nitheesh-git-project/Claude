import type { Metadata } from "next";
import PatientDashboardShell from "@/components/patient/PatientDashboardShell";
import { loadPatientDashboard } from "@/lib/patientDashboardData";
import SurfaceCard from "@/components/dashboard/SurfaceCard";
import PatientBookingHub from "@/components/patient/PatientBookingHub";

export const metadata: Metadata = {
  title: "Book a Session | Dr. Pooja's Physio",
};

export default async function Page() {
  const d = await loadPatientDashboard("book");

  return (
    <PatientDashboardShell
      data={d}
      title="Book a Session"
      // Named rather than fixed: with home visits switched off the hub shows
      // consultations alone, and a subtitle promising visits at home is the
      // clinic advertising something it has stopped offering -- on the one
      // screen a patient comes to in order to book it.
      subtitle={
        d.adminSettings.homeVisitEnabled
          ? "Video consultations and home visits, in one place."
          : "Everything you can book, in one place."
      }
    >
      <SurfaceCard
        id="book"
        title="Book a Session"
        icon="fa-plus"
        subtitle="Everything you can book, in one place."
      >
        <PatientBookingHub
          categories={d.bookableCategories ?? []}
          homeVisitPackages={d.hubHomeVisitPackages}
        />
      </SurfaceCard>
    </PatientDashboardShell>
  );
}
