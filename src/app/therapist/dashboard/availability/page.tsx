import TabSummary, { JumpChips } from "@/components/dashboard/TabSummary";
import { availabilitySummary } from "@/lib/tabSummaries";
import { formatClinicDate } from "@/lib/formatDateTime";
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
  const avail = availabilitySummary(d.availabilitySlots ?? [], d.upcomingOverrides ?? []);
  const onLeave = d.onLeaveProfile?.on_leave ?? false;
  // An exception's date is a wall-clock day with no instant behind it; noon
  // in the clinic's zone formats as that same day for every reader.
  const dayLabel = (ymd: string) => formatClinicDate(`${ymd}T12:00:00+05:30`);

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
        <TabSummary
          testId="availability-summary"
          eyebrow="Your week"
          tone={onLeave ? "plain" : "hero"}
          title={
            onLeave
              ? "You're on time off"
              : avail.hoursPerWeek > 0
                ? `${avail.hoursPerWeek} hours a week, over ${avail.workingDays} ${avail.workingDays === 1 ? "day" : "days"}`
                : "No weekly hours set yet"
          }
          detail={
            onLeave
              ? "No new bookings come to you until it ends. Sessions already booked stay as they are."
              : "The clinic assigns bookings into these hours. Nothing is booked by this page itself."
          }
          facts={[
            { label: "Hours a week", value: String(avail.hoursPerWeek), tone: "teal" },
            {
              label: "Next date that differs",
              value: avail.nextException ? dayLabel(avail.nextException.date) : "None",
              note: avail.nextException ? (avail.nextException.available ? "Extra hours" : "Not working") : undefined,
              tone: avail.nextException ? "amber" : "slate",
            },
            { label: "Time off", value: onLeave ? "On" : "Off", tone: onLeave ? "amber" : "slate" },
          ]}
        />
        <JumpChips
          className=""
          items={[
            { id: "weekly-hours", label: "Weekly hours" },
            { id: "exceptions", label: "Dates that differ" },
            { id: "time-off", label: "Time off" },
          ]}
        />
        <SurfaceCard
          id="weekly-hours"
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
          id="exceptions"
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

        <SurfaceCard id="time-off" title="Time off" icon="fa-plane-departure">
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
