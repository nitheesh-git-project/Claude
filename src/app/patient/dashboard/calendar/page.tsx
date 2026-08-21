import type { Metadata } from "next";
import PatientDashboardShell from "@/components/patient/PatientDashboardShell";
import { loadPatientDashboard } from "@/lib/patientDashboardData";
import SessionCalendarTab from "@/components/dashboard/SessionCalendarTab";
import { renderPatientSessionCard } from "@/components/patient/PatientSessionCard";

export const metadata: Metadata = {
  title: "Calendar | Dr. Pooja's Physio",
};

export default async function Page() {
  const d = await loadPatientDashboard("calendar");

  return (
    <PatientDashboardShell data={d} title="Calendar" subtitle="Every session you have booked, by date.">
      <div id="calendar" className="mt-8">
        {/* Both kinds share one calendar -- a patient's week is one week,
            whether a slot is a call or someone coming round. */}
        <SessionCalendarTab
          sessions={d.appointments}
          cardsById={Object.fromEntries(
            d.appointments.map((a) => [
              a.id,
              renderPatientSessionCard(d, a, d.visitDetailById.get(a.id) ?? null),
            ])
          )}
          showMotivation
        />
      </div>

    </PatientDashboardShell>
  );
}
