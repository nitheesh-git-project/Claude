import type { Metadata } from "next";
import TherapistDashboardShell from "@/components/therapist/TherapistDashboardShell";
import { loadTherapistDashboard } from "@/lib/therapistDashboardData";
import SurfaceCard, { EmptyState } from "@/components/dashboard/SurfaceCard";
import WeeklyScheduleEditor from "@/components/roster/WeeklyScheduleEditor";
import ScheduleExceptionsPanel from "@/components/roster/ScheduleExceptionsPanel";
import LeavePanel from "@/components/roster/LeavePanel";
import { templateToWeekly } from "@/lib/availabilityRanges";

export const metadata: Metadata = {
  title: "My availability | MoveRestore",
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
      {d.availabilityLoadFailed ? (
        // No editor at all when a read failed. An empty week drawn from a
        // read that never happened looks exactly like "no hours set", and
        // one Save would replace the real roster with it.
        <SurfaceCard title="Your schedule" icon="fa-clock">
          <EmptyState
            icon="fa-triangle-exclamation"
            title="We couldn't load your schedule"
            body="Nothing is shown rather than an empty week that isn't really yours. Your hours, exceptions and leave are unchanged. Refresh the page to try again."
          />
        </SurfaceCard>
      ) : (
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
        >
          {/* A therapist writes their own exceptions now, the way they
              already set their weekly hours and their leave -- through
              their own route, which takes no therapist id and refuses a
              date already behind them. */}
          <ScheduleExceptionsPanel
            therapistId={d.user.id}
            therapistName={d.profile?.full_name ?? "you"}
            templateRows={d.availabilitySlots ?? []}
            overrideRows={d.upcomingOverrides ?? []}
            todayKey={d.therapistTodayKey}
            endpoint="/api/therapist/set-availability-exception"
            voice="self"
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
      )}
    </TherapistDashboardShell>
  );
}
