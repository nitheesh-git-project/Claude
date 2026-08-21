import type { Metadata } from "next";
import PatientDashboardShell from "@/components/patient/PatientDashboardShell";
import { loadPatientDashboard } from "@/lib/patientDashboardData";
import ReceiptsSection from "@/components/ReceiptsSection";
import { buildPatientReceipts } from "@/lib/receipts";

export const metadata: Metadata = {
  title: "Payments | Dr. Pooja's Physio",
};

export default async function Page() {
  const d = await loadPatientDashboard("receipts");

  return (
    <PatientDashboardShell data={d} title="Payments" subtitle="Every payment, refund and failed attempt on your account.">
      <div id="receipts" className="mt-8">
        <ReceiptsSection
          receipts={buildPatientReceipts(
            d.appointments ?? [],
            d.allPackagePurchases ?? [],
            d.paymentFailures ?? [],
            d.categoryTitleMap
          )}
          sessionCodeByAppointmentId={Object.fromEntries(
            d.appointments.map((a) => [a.id, a.session_code])
          )}
        />
      </div>
    </PatientDashboardShell>
  );
}
