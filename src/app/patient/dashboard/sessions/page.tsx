import type { Metadata } from "next";
import Link from "next/link";
import PatientDashboardShell from "@/components/patient/PatientDashboardShell";
import SurfaceCard from "@/components/dashboard/SurfaceCard";
import SessionsView from "@/components/dashboard/SessionsView";
import { renderPatientSessionCard } from "@/components/patient/PatientSessionCard";
import { loadPatientDashboard } from "@/lib/patientDashboardData";
import { patientSessionStatus } from "@/lib/sessionRowStatus";
import { BOOKING_FROM_DASHBOARD } from "@/components/BookingBackToSessions";
import TabSummary from "@/components/dashboard/TabSummary";
import { sessionsSummary } from "@/lib/tabSummaries";
import { formatSlotTime } from "@/lib/formatSlotTime";

export const metadata: Metadata = {
  title: "Your Sessions | MoveRestore",
};

// One screen for every session -- video and home visit together, as a
// filtered list or a month calendar. "When is my next session?" should be
// one place to look; see SessionsView and SessionFilterList for the full
// reasoning.
export default async function Page() {
  const d = await loadPatientDashboard("sessions");

  const sessions = d.appointments.map((a) => ({
    id: a.id,
    slotTime: a.slot_time,
    status: a.status,
    noShow: a.no_show,
    isHomeVisit: d.visitDetailById.get(a.id)?.visit_mode === "home_visit",
    // The desktop list's row: the same words the card leads with.
    title: a.concern ?? "General Consultation",
    detail: a.therapist_id ? d.therapistMap.get(a.therapist_id) ?? undefined : "Therapist not yet assigned",
    // The card's own status word, so the row and the card agree.
    statusLabel: patientSessionStatus({
      status: a.status,
      no_show: a.no_show,
      therapist_id: a.therapist_id,
      package_purchase_id: a.package_purchase_id,
      pay_later_approval: a.pay_later_approval,
      payment_status: a.payment_status,
      payment_terms: a.payment_terms,
      home_visit_purchase_id: d.visitDetailById.get(a.id)?.home_visit_purchase_id ?? null,
    }),
  }));
  const cardsById = Object.fromEntries(
    d.appointments.map((a) => [a.id, renderPatientSessionCard(d, a, d.visitDetailById.get(a.id) ?? null)])
  );

  // The answer first: when is the next one, and how many are ahead / done.
  // Counted by the list's own rule (sessionBucket), so the two never disagree.
  const summary = sessionsSummary(sessions, d.nowMs);
  const nextAppt = summary.next ? d.appointments.find((a) => a.id === summary.next!.id) ?? null : null;
  const nextIsHome = nextAppt ? d.visitDetailById.get(nextAppt.id)?.visit_mode === "home_visit" : false;
  const nextWith = nextAppt?.therapist_id ? d.therapistMap.get(nextAppt.therapist_id) ?? null : null;

  return (
    <PatientDashboardShell
      data={d}
      title="Your Sessions"
      subtitle="Every session you have booked - video consultations and home visits together."
    >
      <TabSummary
        testId="sessions-summary"
        eyebrow="Your next session"
        tone={nextAppt ? "hero" : "plain"}
        title={nextAppt ? formatSlotTime(nextAppt.slot_time, nextAppt.timezone) : "Nothing coming up"}
        detail={
          nextAppt
            ? [nextAppt.concern ?? "General Consultation", nextIsHome ? "Home visit" : "Video consultation", nextWith ?? "Physiotherapist not yet assigned"].join(" · ")
            : "Book a session and it shows up here with your joining details."
        }
        action={nextAppt ? null : { label: "Book a session", href: BOOKING_FROM_DASHBOARD, icon: "fa-plus" }}
        secondary={nextAppt ? { label: "Book another", href: BOOKING_FROM_DASHBOARD, icon: "fa-plus" } : null}
        facts={[
          { label: "Upcoming", value: String(summary.upcoming), tone: "teal" },
          { label: "Done", value: String(summary.done), tone: "green" },
          { label: "Cancelled", value: String(summary.cancelled), tone: "slate" },
        ]}
      />
      <SurfaceCard
        title="Your Sessions"
        info="card:session-status"
        icon="fa-calendar-check"
        actions={
          /* ?from=dashboard so Back off the booking page returns here --
             see BookingBackToSessions. */
          <Link
            href={BOOKING_FROM_DASHBOARD}
            className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-800"
          >
            Book a session
          </Link>
        }
      >
        <SessionsView
          sessions={sessions}
          cardsById={cardsById}
          nowMs={d.nowMs}
          showMotivation
          emptyTitle="Nothing here yet"
          emptyBody="Book a session and it shows up here with your joining details."
        />
      </SurfaceCard>
    </PatientDashboardShell>
  );
}
