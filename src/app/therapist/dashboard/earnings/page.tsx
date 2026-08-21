import type { Metadata } from "next";
import TherapistPayoutReceiptsSection from "@/components/TherapistPayoutReceiptsSection";
import TherapistDashboardShell from "@/components/therapist/TherapistDashboardShell";
import { loadTherapistDashboard } from "@/lib/therapistDashboardData";
import TherapistEarningsTab from "@/components/TherapistEarningsTab";

export const metadata: Metadata = {
  title: "Earnings | Dr. Pooja's Physio",
};

export default async function Page() {
  const d = await loadTherapistDashboard("earnings");

  return (
    <TherapistDashboardShell data={d} title="Earnings" subtitle="What you have earned, what is owed, and every payout the clinic has settled.">
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
    </TherapistDashboardShell>
  );
}
