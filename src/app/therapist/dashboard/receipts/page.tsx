import type { Metadata } from "next";
import TherapistDashboardShell from "@/components/therapist/TherapistDashboardShell";
import { loadTherapistDashboard } from "@/lib/therapistDashboardData";
import TherapistPayoutReceiptsSection from "@/components/TherapistPayoutReceiptsSection";

export const metadata: Metadata = {
  title: "Payout Receipts | Dr. Pooja's Physio",
};

export default async function Page() {
  const d = await loadTherapistDashboard();

  return (
    <TherapistDashboardShell data={d} title="Payout Receipts" subtitle="Every payout the clinic has settled with you.">
      <div id="receipts">
        <TherapistPayoutReceiptsSection
          receipts={d.payoutReceipts}
          sessionCodeByAppointmentId={d.sessionCodeByAppointmentId}
        />
      </div>
    </TherapistDashboardShell>
  );
}
