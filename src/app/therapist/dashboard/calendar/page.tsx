import type { Metadata } from "next";
import TherapistDashboardShell from "@/components/therapist/TherapistDashboardShell";
import { loadTherapistDashboard } from "@/lib/therapistDashboardData";
import SessionCalendarTab from "@/components/dashboard/SessionCalendarTab";
import { renderTherapistSessionCard, renderTherapistHomeVisitCard } from "@/components/therapist/TherapistSessionCards";

export const metadata: Metadata = {
  title: "Calendar | Dr. Pooja's Physio",
};

export default async function Page() {
  const d = await loadTherapistDashboard("calendar");

  return (
    <TherapistDashboardShell data={d} title="Calendar" subtitle="Your week, video calls and home visits together.">
      <div id="calendar" className="mt-8">
        {/* Both kinds share the calendar -- a therapist's day is one day,
            whether a slot is a call or a journey. Each entry renders the
            card that matches its own mode. */}
        <SessionCalendarTab
          sessions={d.appointments}
          cardsById={Object.fromEntries(
            d.appointments.map((a) => [
              a.id,
              a.visit?.visit_mode === "home_visit"
                ? renderTherapistHomeVisitCard(d, a)
                : renderTherapistSessionCard(d, a),
            ])
          )}
        />
      </div>
    </TherapistDashboardShell>
  );
}
