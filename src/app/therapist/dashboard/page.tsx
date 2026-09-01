import type { Metadata } from "next";
import TherapistDashboardShell from "@/components/therapist/TherapistDashboardShell";
import DashboardOverview from "@/components/dashboard/DashboardOverview";
import { loadTherapistDashboard } from "@/lib/therapistDashboardData";

export const metadata: Metadata = {
  title: "Therapist Dashboard | Dr. Pooja's Physio",
};

// The landing screen. Availability, Assigned Sessions, Home Visits,
// Programme Patients, Calendar, Earnings and Payout Receipts are each
// their own route now, so the sidebar navigates rather than scroll-spying
// down one long page.
export default async function TherapistDashboardPage() {
  const d = await loadTherapistDashboard();

  return (
    <TherapistDashboardShell
      data={d}
      title={`Welcome, ${d.profile?.full_name ?? "there"}`}
      subtitle={
        <>
          <p>{d.profile?.credentials}</p>
          {d.profile?.revenue_share_percent !== null &&
            d.profile?.revenue_share_percent !== undefined && (
              <p className="mt-1">
                Your Revenue Share:{" "}
                <strong className="text-slate-600">{d.profile.revenue_share_percent}%</strong>
              </p>
            )}
          <p className="mt-1">
            Your Rating:{" "}
            {d.ownRating.average === null ? (
              <strong className="text-slate-600">No ratings yet</strong>
            ) : (
              <strong className="text-slate-600">
                {d.ownRating.average.toFixed(1)} ({d.ownRating.count} rating
                {d.ownRating.count === 1 ? "" : "s"})
              </strong>
            )}
            {d.profile?.rating_visible === false && (
              <span className="text-slate-400"> — hidden from public pages</span>
            )}
          </p>
        </>
      }
    >
      <DashboardOverview
        greeting="Your practice today"
        headline={
          d.nextSession?.slot_time
            ? `Next up: ${d.patientNameById.get(d.nextSession.patient_id) ?? "a patient"} at ${new Date(
                d.nextSession.slot_time
              ).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}.`
            : "No sessions booked yet — keep your availability open and the clinic assigns work to it."
        }
        cells={d.overviewCells}
        feed={d.therapistFeed}
        feedEmptyBody="Assignments, completed sessions and payouts show up here as they happen."
        actions={[
          // A real route, not an anchor. Availability stopped being a
          // section of this page when the dashboard was split into routes,
          // and this link kept pointing at a fragment that no longer
          // exists -- so the therapist's own primary action landed them
          // back on the screen they were already looking at.
          { label: "Set your availability", hint: "Weekly hours and day overrides", icon: "fa-calendar-days", href: "/therapist/dashboard/availability", primary: true },
          { label: "Your assigned sessions", hint: "Join, complete, or mark a no-show", icon: "fa-clipboard-list", href: "/therapist/dashboard/sessions" },
          { label: "Patient health profiles", hint: "Intake answers and pain maps", icon: "fa-notes-medical", href: "/therapist/dashboard/health-profile" },
          { label: "Earnings and payouts", hint: "What you've earned and what's owed", icon: "fa-chart-line", href: "/therapist/dashboard/earnings" },
        ]}
      />
    </TherapistDashboardShell>
  );
}
