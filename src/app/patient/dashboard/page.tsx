import type { Metadata } from "next";
import Link from "next/link";
import PatientDashboardShell from "@/components/patient/PatientDashboardShell";
import DashboardOverview from "@/components/dashboard/DashboardOverview";
import PatientSuggestionCard from "@/components/packages/PatientSuggestionCard";
import OnboardingTour from "@/components/patient/OnboardingTour";
import { StripProgress } from "@/components/dashboard/StatStrip";
import { loadPatientDashboard } from "@/lib/patientDashboardData";
import { formatSlotTime } from "@/lib/formatSlotTime";
import { BOOKING_FROM_DASHBOARD } from "@/components/BookingBackToSessions";

export const metadata: Metadata = {
  title: "Patient Dashboard | Dr. Pooja's Physio",
};

// The dashboard's landing screen. Everything else -- booking, sessions,
// home visits, the calendar, packages, receipts -- is its own route under
// /patient/dashboard/, so the sidebar navigates rather than scroll-spying
// its way down one very long page.
export default async function PatientDashboardPage() {
  const d = await loadPatientDashboard();
  const intakeAnswered = d.intakeAnswered;
  const conditionProfile = d.conditionProfile;

  return (
    <PatientDashboardShell
      data={d}
      title={`Welcome back, ${d.profile?.full_name ?? "there"}`}
      subtitle="Your virtual physical therapy dashboard"
    >
      {!d.onboardingRow?.onboarding_seen_at && <OnboardingTour intakeLocked={!d.intakeGate.canEdit} />}

      {/* The nudge is dropped entirely while the record is the
          therapist's to write. An amber banner is a to-do marker, and
          there is nothing here for the patient to do until their first
          session -- a warning-coloured card linking to a read-only page is
          the exact confusion this whole screen keeps correcting. It comes
          back once the profile is theirs and still incomplete. */}
      {d.intakeGate.canEdit &&
        (!conditionProfile ||
        conditionProfile.status === "not_started" ||
        conditionProfile.status === "draft") && (
        <Link
          href="/patient/dashboard/health-profile"
          className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 transition hover:bg-amber-100"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-amber-800">
              {intakeAnswered > 0
                ? `You're ${intakeAnswered} of ${d.intakeTotal} questions into your health profile.`
                : "Add to your health profile so your therapist has the full picture before your next session."}
            </span>
            <span className="mt-1 block text-xs text-amber-700">
              {intakeAnswered > 0
                ? "Your answers were saved — picking up where you left off takes about a minute."
                : `${d.intakeTotal} short questions, asked one at a time. About two minutes.`}
            </span>
            {intakeAnswered > 0 && (
              <span className="mt-2 block h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-amber-200">
                <span
                  className="block h-full rounded-full bg-amber-500"
                  style={{ width: `${d.intakeTotal === 0 ? 0 : (intakeAnswered / d.intakeTotal) * 100}%` }}
                />
              </span>
            )}
          </span>
          <span className="shrink-0 text-xs font-bold text-amber-700">
            {intakeAnswered > 0 ? "Finish it →" : "Fill it in →"}
          </span>
        </Link>
      )}

      {/* Above the overview: a therapist has proposed a time and it is
          waiting on an answer. Nothing is scheduled and no session is
          spent until the patient accepts, so this is the one thing on
          this screen that is genuinely blocked on them. */}
      {d.pendingSuggestions.length > 0 && (
        <div id="suggested-sessions" className="mb-6 space-y-3">
          {d.pendingSuggestions.map((suggestion) => (
            <PatientSuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              leadTimeHours={d.adminSettings.onlineBookingLeadTimeHours}
            />
          ))}
        </div>
      )}

      <DashboardOverview
        greeting="Your care at a glance"
        headline={
          d.nextSession?.slot_time
            ? `Your next session is ${formatSlotTime(d.nextSession.slot_time, d.nextSession.timezone)}.`
            : "Nothing booked yet — pick a time that suits you and your therapist takes it from there."
        }
        cells={d.overviewCells}
        stripFooter={
          d.intakeGate.canEdit ? (
            <StripProgress
              percent={d.intakeTotal === 0 ? 0 : Math.round((intakeAnswered / d.intakeTotal) * 100)}
              caption={`Health profile ${intakeAnswered}/${d.intakeTotal} answered`}
            />
          ) : undefined
        }
        feed={d.patientFeed}
        feedEmptyBody="Bookings, payments and health-profile updates show up here as they happen."
        actions={[
          {
            label: "Book a session",
            hint: "Video or home visit",
            icon: "fa-plus",
            href: BOOKING_FROM_DASHBOARD,
            primary: true,
          },
          {
            label: !d.intakeGate.canEdit
              ? "See your health profile"
              : intakeAnswered === d.intakeTotal
                ? "Review your health profile"
                : "Finish your health profile",
            hint: !d.intakeGate.canEdit
              ? "Your therapist fills this in at your first session"
              : intakeAnswered === d.intakeTotal
                ? "Keep it current before your next session"
                : `${d.intakeTotal - intakeAnswered} questions left, about 2 minutes`,
            icon: "fa-notes-medical",
            href: "/patient/dashboard/health-profile",
          },
          {
            label: "Your sessions",
            hint: "Join, reschedule or cancel",
            icon: "fa-calendar-check",
            href: "/patient/dashboard/sessions",
          },
          {
            label: "Your payments",
            hint: "Every payment and refund",
            icon: "fa-receipt",
            href: "/patient/dashboard/payments",
          },
        ]}
      />
    </PatientDashboardShell>
  );
}
