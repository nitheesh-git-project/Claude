import type { Metadata } from "next";
import Link from "next/link";
import PatientDashboardShell from "@/components/patient/PatientDashboardShell";
import DashboardOverview from "@/components/dashboard/DashboardOverview";
import InviteCard from "@/components/patient/InviteCard";
import PayLaterWidget from "@/components/patient/PayLaterWidget";
import GetReadyCard from "@/components/patient/GetReadyCard";
import SessionRecapCard from "@/components/patient/SessionRecapCard";
import { StripProgress } from "@/components/dashboard/StatStrip";
import { loadPatientDashboard } from "@/lib/patientDashboardData";
import { formatSlotTime } from "@/lib/formatSlotTime";
import PatientHomeLead from "@/components/patient/PatientHomeLead";
import { noNextSessionHeadline } from "@/lib/patientOverviewCopy";
import JoinSessionButton from "@/components/JoinSessionButton";
import { formatSessionWhen } from "@/lib/sessionWhenLabel";
import CancelSessionButton from "@/components/CancelSessionButton";
import { sessionActionRowOf } from "@/components/patient/PatientSessionCard";
import { joinHeldForPayment, needsPaymentOnHome } from "@/lib/sessionPatientActions";
import { resumeCheckoutHref } from "@/lib/resumeCheckout";

export const metadata: Metadata = {
  title: "Patient Dashboard | MoveRestore",
};

// The dashboard's landing screen. Everything else -- booking, sessions,
// home visits, the calendar, packages, receipts -- is its own route under
// /patient/dashboard/, so the sidebar navigates rather than scroll-spying
// its way down one very long page.
export default async function PatientDashboardPage() {
  const d = await loadPatientDashboard();
  const intakeAnswered = d.intakeAnswered;
  const conditionProfile = d.conditionProfile;
  // Sessions still waiting for the patient to pay, by the same rule as the
  // session card's Pay button (sessionPatientActions.ts): live, ahead, and
  // one the clinic can still run. Each stays on Home until it is paid or
  // cancelled; cancelled, it leaves here and shows as Cancelled in Past.
  const awaitingPayment = d.appointments
    .filter((a) => needsPaymentOnHome(sessionActionRowOf(d, a), d.nowMs, d.unassignedRescueHours))
    .sort((x, y) => Date.parse(x.slot_time ?? "") - Date.parse(y.slot_time ?? ""));
  const joinHeld = d.joinSession
    ? joinHeldForPayment(sessionActionRowOf(d, d.appointments.find((a) => a.id === d.joinSession!.id) ?? (d.joinSession as (typeof d.appointments)[number])))
    : false;

  return (
    <PatientDashboardShell
      data={d}
      title={`Welcome back, ${d.profile?.full_name ?? "there"}`}
      subtitle="Your physiotherapy dashboard"
    >

      {/* Above everything else on the screen, because it is the one thing
          here that involves money the clinic is waiting for -- and because
          the patient it belongs to has no other way to see it. Absent when
          nothing is owed and nothing is being checked. */}
      {d.payLater && (
        <PayLaterWidget
          owedPaise={d.payLater.owedPaise}
          sessions={d.payLater.sessions}
          unallocatedPaise={d.payLater.unallocatedPaise}
          pendingDeclaration={d.payLater.pendingDeclaration}
          lastRejection={d.payLater.lastRejection}
          razorpayKeyId={process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? null}
        />
      )}

      {awaitingPayment.length > 0 && (
        <section
          data-testid="home-awaiting-payment"
          aria-labelledby="home-awaiting-payment-title"
          className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5"
        >
          <h2 id="home-awaiting-payment-title" className="text-base font-bold text-amber-900">
            {awaitingPayment.length === 1 ? "A session is waiting for payment" : `${awaitingPayment.length} sessions are waiting for payment`}
          </h2>
          <p className="mt-1 text-sm text-amber-900">
            Pay to keep your time. The video link opens once it&apos;s paid. Not going ahead? Cancel it and nothing is charged.
          </p>
          <ul className="mt-3 space-y-2">
            {awaitingPayment.map((a) => (
              <li
                key={a.id}
                data-testid="home-awaiting-payment-row"
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-3"
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-900">{a.concern ?? "General Consultation"}</span>
                  <span className="block text-sm text-slate-700">
                    {formatSlotTime(a.slot_time, a.timezone)}
                    {a.therapist_id ? ` · ${d.therapistMap.get(a.therapist_id) ?? "your physiotherapist"}` : ""}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Link
                    href={resumeCheckoutHref(a.id)}
                    data-testid="home-pay-now"
                    className="inline-flex min-h-11 items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800"
                  >
                    Pay now
                  </Link>
                  <CancelSessionButton
                    appointmentId={a.id}
                    paid={false}
                    slotTime={a.slot_time}
                    refundWindowHours={d.adminSettings.onlineCancellationRefundHours}
                    cutoffMinutes={d.adminSettings.patientCancelCutoffMinutes}
                    serverNowMs={d.nowMs}
                  />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Before a video session: the few things to have to hand, and "I'm
          ready" (guided check, phase 2). Absent outside the two days before. */}
      {d.sessionPrep.status === "ok" && (
        <GetReadyCard
          appointmentId={d.sessionPrep.appointmentId}
          slotTime={d.sessionPrep.slotTime}
          items={d.sessionPrep.list.items}
          readyAt={d.sessionPrep.readyAt}
        />
      )}

      {/* The week after a session: what was done and what comes next (P6). */}
      {d.recap && <SessionRecapCard recap={d.recap} />}

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
                : "Add to your health profile so your physiotherapist has the full picture before your next session."}
            </span>
            <span className="mt-1 block text-xs text-amber-700">
              {intakeAnswered > 0
                ? "Your answers were saved - picking up where you left off takes about a minute."
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

      {/* Something waiting on the patient's answer is named by the shell's
          "Suggested for you" bar (SuggestedTeaserBar), on this screen and
          every other -- this page used to carry a second, plainer copy. */}

      <DashboardOverview
        greeting="Your care at a glance"
        headline={
          <>
            <span className="block">
              {d.nextSession?.slot_time
                ? `Your next session is ${formatSlotTime(d.nextSession.slot_time, d.nextSession.timezone)}.`
                : d.joinSession?.slot_time
                  ? `Your session is ${formatSlotTime(d.joinSession.slot_time, d.joinSession.timezone)}.`
                  : d.unbookedSessionCount > 0
                    ? `You have ${d.unbookedSessionCount} paid session${d.unbookedSessionCount === 1 ? "" : "s"} still to book - pick times that suit you.`
                    : noNextSessionHeadline(d.bookingHistory)}
            </span>
            {/* The one thing a patient opens Home for when a call is due:
                while the join window is open, one full-width button with
                the physiotherapist and the time; before it, when the button
                will appear. When the link becomes available is the server's
                rule and is not decided here. */}
            {d.joinSession && (
              <span className="mt-4 block">
                <JoinSessionButton
                  size="hero"
                  meetLink={joinHeld ? null : d.joinSession.meet_link}
                  paymentHold={joinHeld}
                  slotTime={d.joinSession.slot_time}
                  status={d.joinSession.status}
                  durationMinutes={d.joinSession.duration_minutes}
                  heroDetail={
                    d.joinSession.slot_time
                      ? formatSessionWhen(
                          d.joinSession.slot_time,
                          d.joinSession.duration_minutes ?? 60,
                          d.joinSession.therapist_id
                            ? `with ${d.therapistMap.get(d.joinSession.therapist_id) ?? "your physiotherapist"}`
                            : "with a physiotherapist"
                        )
                      : undefined
                  }
                />
              </span>
            )}
          </>
        }
        lead={<PatientHomeLead programme={d.homeProgramme} sameAgain={d.homeSameAgain} />}
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
          // Booking itself is the lead above (programme, "Same again?",
          // Something new, Chat to book); repeating it here was a second
          // copy of the same button. These are the next places a patient goes.
          {
            label: !d.intakeGate.canEdit
              ? "See your health profile"
              : intakeAnswered === d.intakeTotal
                ? "Review your health profile"
                : "Finish your health profile",
            hint: !d.intakeGate.canEdit
              ? "Your physiotherapist fills this in at your first session"
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

      {/* Below the overview, deliberately. Somebody's next session and what
          is waiting on them come first; telling a friend is the last thing
          on this screen, not a banner over the top of it. */}
      {d.invite && (
        <div className="mt-8">
          <InviteCard
            code={d.invite.code}
            settings={d.invite.settings}
            invited={d.invite.invited}
            qualified={d.invite.qualified}
            rewardWaitingPaise={d.invite.rewardWaitingPaise}
            claimedSomeoneElses={d.invite.claimedSomeoneElses}
            // You are new exactly once, so the entry field is gone the
            // moment a session has been paid for -- the same test the
            // server applies, said on screen rather than only refused.
            canClaim={!d.appointments.some((a) => a.payment_status === "paid")}
          />
        </div>
      )}
    </PatientDashboardShell>
  );
}
