import TabSummary from "@/components/dashboard/TabSummary";
import { sessionsSummary } from "@/lib/tabSummaries";
import { todayProgress, todayProgressLabel } from "@/lib/therapistToday";
import { formatSlotTime } from "@/lib/formatSlotTime";
import type { Metadata } from "next";
import TherapistDashboardShell from "@/components/therapist/TherapistDashboardShell";
import SurfaceCard from "@/components/dashboard/SurfaceCard";
import SessionsView from "@/components/dashboard/SessionsView";
import {
  renderTherapistSessionCard,
  renderTherapistHomeVisitCard,
} from "@/components/therapist/TherapistSessionCards";
import { loadTherapistDashboard } from "@/lib/therapistDashboardData";

export const metadata: Metadata = {
  title: "Sessions | MoveRestore",
};

// One list of everything assigned to this therapist. Video consultations
// and home visits were two screens over the same rows, so "what am I doing
// tomorrow?" meant reading both and merging them by hand.
export default async function Page() {
  const d = await loadTherapistDashboard("sessions");

  const sessions = d.appointments.map((a) => ({
    id: a.id,
    slotTime: a.slot_time,
    status: a.status,
    noShow: a.no_show,
    isHomeVisit: a.visit?.visit_mode === "home_visit",
    // The desktop list's row: the same words the card leads with.
    title: d.patientMap.get(a.patient_id)?.full_name ?? "Unknown patient",
    detail: a.concern ?? "General Consultation",
  }));
  const cardsById = Object.fromEntries(
    d.appointments.map((a) => [
      a.id,
      a.visit?.visit_mode === "home_visit"
        ? renderTherapistHomeVisitCard(d, a)
        : renderTherapistSessionCard(d, a),
    ])
  );

  // Counted by the list's own rule, so the card and the list agree.
  const summary = sessionsSummary(sessions, d.nowMs);
  const next = summary.next ? d.appointments.find((a) => a.id === summary.next!.id) ?? null : null;
  const today = todayProgress(d.todayRows);

  return (
    <TherapistDashboardShell
      data={d}
      title="Sessions"
      subtitle="Everything assigned to you - video consultations and home visits together."
    >
      <TabSummary
        testId="therapist-sessions-summary"
        eyebrow="Next session"
        tone={next ? "hero" : "plain"}
        title={next ? formatSlotTime(next.slot_time, next.timezone) : "Nothing coming up"}
        detail={
          next
            ? [
                d.patientMap.get(next.patient_id)?.full_name ?? "A patient",
                next.concern ?? "General Consultation",
                next.visit?.visit_mode === "home_visit" ? "Home visit" : "Video",
              ].join(" · ")
            : "Keep your weekly availability up to date - the clinic assigns bookings into the hours you have open."
        }
        secondary={next ? null : { label: "My availability", href: "/therapist/dashboard/availability", icon: "fa-calendar-days" }}
        facts={[
          { label: "Today", value: todayProgressLabel(today), tone: "teal" },
          { label: "Upcoming", value: String(summary.upcoming), tone: "teal" },
          {
            label: "Notes to write",
            value: String(d.notesOwedCount),
            note: d.notesOwedCount > 0 ? "Write them while they're fresh" : "All written up",
            tone: d.notesOwedCount > 0 ? "amber" : "green",
          },
        ]}
      />
      <SurfaceCard title="Assigned sessions" info="card:session-status" icon="fa-clipboard-list">
        <SessionsView
          sessions={sessions}
          cardsById={cardsById}
          nowMs={d.nowMs}
          emptyTitle="Nothing assigned yet"
          emptyBody="Keep your weekly availability up to date - the clinic assigns bookings into the hours you have open."
        />
      </SurfaceCard>
    </TherapistDashboardShell>
  );
}
