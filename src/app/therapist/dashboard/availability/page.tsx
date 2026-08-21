import type { Metadata } from "next";
import TherapistDashboardShell from "@/components/therapist/TherapistDashboardShell";
import { loadTherapistDashboard } from "@/lib/therapistDashboardData";
import TherapistAvailabilityRoster from "@/components/TherapistAvailabilityRoster";
import TherapistOnLeaveToggle from "@/components/TherapistOnLeaveToggle";
import TherapistUpcomingOverrides from "@/components/TherapistUpcomingOverrides";

export const metadata: Metadata = {
  title: "Availability | Dr. Pooja's Physio",
};

export default async function Page() {
  const d = await loadTherapistDashboard();

  return (
    <TherapistDashboardShell data={d} title="Availability" subtitle="Your weekly hours, day overrides and leave.">
      <div id="availability">
        <div className="mb-6">
          <TherapistOnLeaveToggle initialOnLeave={d.onLeaveProfile?.on_leave ?? false} />
        </div>

        <div className="mb-6">
          <TherapistAvailabilityRoster
            initialSlots={d.availabilitySlots ?? []}
            timezone={d.profile?.timezone ?? null}
          />
        </div>

        {d.upcomingOverrides && d.upcomingOverrides.length > 0 && (
          <div className="mb-6">
            <TherapistUpcomingOverrides overrides={d.upcomingOverrides} />
          </div>
        )}
      </div>
    </TherapistDashboardShell>
  );
}
