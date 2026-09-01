import type { Metadata } from "next";
import TherapistDashboardShell from "@/components/therapist/TherapistDashboardShell";
import { loadTherapistDashboard } from "@/lib/therapistDashboardData";
import SurfaceCard from "@/components/dashboard/SurfaceCard";
import WeeklyScheduleEditor from "@/components/roster/WeeklyScheduleEditor";
import ScheduleExceptionsPanel from "@/components/roster/ScheduleExceptionsPanel";
import LeavePanel from "@/components/roster/LeavePanel";
import { templateToWeekly } from "@/lib/availabilityRanges";

export const metadata: Metadata = {
  title: "My availability | Dr. Pooja's Physio",
};

export default async function Page() {
  const d = await loadTherapistDashboard("availability");
  const weekly = templateToWeekly(d.availabilitySlots ?? []);

  return (
    <TherapistDashboardShell
      data={d}
      title="My availability"
      subtitle="Your weekly hours, dates that differ, and time off."
    >
      <div id="availability" className="space-y-4">
        <SurfaceCard
          title="Your schedule"
          icon="fa-clock"
          subtitle="Set it once and it repeats every week. It tells the clinic when to expect you; it doesn't book anything by itself."
        >
          <WeeklyScheduleEditor
            initialWeekly={weekly}
            initialVersion={d.scheduleVersion}
            timezone={d.profile?.timezone ?? null}
            endpoint="/api/therapist/save-availability"
            appointments={d.rosterAppointments}
            voice="self"
          />
        </SurfaceCard>

        <SurfaceCard
          title="Exceptions"
          icon="fa-calendar-day"
          subtitle="Dates the clinic has set differently from your weekly hours."
        >
          {/* Read-only on purpose: writing a date exception has always been
              an admin action, and a redesign is not the place to widen who
              can do what. */}
          <ScheduleExceptionsPanel
            therapistId={d.user.id}
            therapistName={d.profile?.full_name ?? "you"}
            templateRows={d.availabilitySlots ?? []}
            overrideRows={d.upcomingOverrides ?? []}
            todayKey={d.therapistTodayKey}
            readOnly
          />
        </SurfaceCard>

        <SurfaceCard title="Time off" icon="fa-plane-departure">
          <LeavePanel
            endpoint="/api/therapist/set-on-leave"
            onLeave={d.onLeaveProfile?.on_leave ?? false}
            from={d.leaveDates.from}
            to={d.leaveDates.to}
            reason={d.leaveDates.reason}
            voice="self"
          />
        </SurfaceCard>
      </div>
    </TherapistDashboardShell>
  );
}
