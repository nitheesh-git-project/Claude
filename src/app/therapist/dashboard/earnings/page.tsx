import TabSummary, { JumpChips } from "@/components/dashboard/TabSummary";
import { formatInr } from "@/lib/formatMoney";
import type { Metadata } from "next";
import TherapistPayoutReceiptsSection from "@/components/TherapistPayoutReceiptsSection";
import TherapistDashboardShell from "@/components/therapist/TherapistDashboardShell";
import { loadTherapistDashboard } from "@/lib/therapistDashboardData";
import TherapistEarningsTab from "@/components/TherapistEarningsTab";
import SurfaceCard, { EmptyState } from "@/components/dashboard/SurfaceCard";

export const metadata: Metadata = {
  title: "Earnings | MoveRestore",
};

export default async function Page() {
  const d = await loadTherapistDashboard("earnings");

  return (
    <TherapistDashboardShell data={d} title="Earnings" subtitle="What you have earned, what is owed, and every payout the clinic has settled.">
      {d.earningsLoadFailed ? (
        // Money is shown whole or not at all. A failed home-visit read
        // priced visits at the online share, a failed payout read said "Not
        // yet requested" and an empty history -- figures a therapist would
        // reasonably act on, built from reads that never happened. The
        // banner above names what could not be read.
        <div id="earnings" className="mt-8">
          <SurfaceCard title="Earnings" info="card:earnings" icon="fa-chart-line">
            <EmptyState
              icon="fa-triangle-exclamation"
              title="We couldn't load all of your earnings"
              body="Nothing is shown rather than a figure that may be wrong. What you're owed and your payout history are unchanged. Refresh the page to try again."
            />
          </SurfaceCard>
        </div>
      ) : (
      <>
      {/* What is owed, said once at the top -- the same figure, to the paisa,
          as Home's "Owed to you" and the Pending Payout below (all three read
          pendingOwedPaise). Inside the loaded branch only: money is shown
          whole or not at all. */}
      <TabSummary
        testId="earnings-summary"
        eyebrow="Owed to you"
        tone="hero"
        title={formatInr(d.pendingOwedPaise)}
        detail={
          d.requestStatus === "none"
            ? "Not yet requested. Request a payout below when you're ready."
            : d.requestStatus === "reviewing"
              ? "Your payout request is under review."
              : "Your payout request has been sent."
        }
        facts={[
          ...(d.profile?.revenue_share_percent !== null && d.profile?.revenue_share_percent !== undefined
            ? [{ label: "Your share", value: `${d.profile.revenue_share_percent}%`, tone: "teal" as const }]
            : []),
          {
            label: "Rating",
            value: d.ownRating.average === null ? "None yet" : d.ownRating.average.toFixed(1),
            note:
              d.ownRating.average === null
                ? undefined
                : `${d.ownRating.count} ${d.ownRating.count === 1 ? "rating" : "ratings"}${d.profile?.rating_visible === false ? " · hidden from public pages" : ""}`,
            tone: "amber" as const,
          },
          { label: "Payouts settled", value: String(d.payoutReceipts.length), tone: "green" as const },
        ]}
      />
      <JumpChips
        className=""
        items={[
          { id: "earnings", label: "Earnings" },
          { id: "receipts", label: "Payouts" },
        ]}
      />
      <div id="earnings" className="mt-8">
        <TherapistEarningsTab
          rows={d.earningRows}
          pendingOwedPaise={d.pendingOwedPaise}
          requestStatus={d.requestStatus}
          latestCompletedRequest={
            d.latestCompletedRequest
              ? {
                  id: d.latestCompletedRequest.id,
                  requestedAmountPaise: d.latestCompletedRequest.requested_amount_paise,
                  requestedAt: d.latestCompletedRequest.requested_at,
                  completedAt: d.latestCompletedRequest.completed_at ?? null,
                }
              : null
          }
        />
      </div>
      <div id="receipts">
        <TherapistPayoutReceiptsSection
          receipts={d.payoutReceipts}
          sessionCodeByAppointmentId={d.sessionCodeByAppointmentId}
        />
      </div>
      </>
      )}
    </TherapistDashboardShell>
  );
}
