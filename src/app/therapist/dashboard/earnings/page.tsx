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
          <SurfaceCard title="Earnings" icon="fa-chart-line">
            <EmptyState
              icon="fa-triangle-exclamation"
              title="We couldn't load all of your earnings"
              body="Nothing is shown rather than a figure that may be wrong. What you're owed and your payout history are unchanged. Refresh the page to try again."
            />
          </SurfaceCard>
        </div>
      ) : (
      <>
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
