import type { Metadata } from "next";
import PatientDashboardShell from "@/components/patient/PatientDashboardShell";
import { loadPatientDashboard } from "@/lib/patientDashboardData";
import ReceiptsSection from "@/components/ReceiptsSection";
import { buildPatientReceipts } from "@/lib/receipts";
import RedeemTrustedCodeCard from "@/components/patient/RedeemTrustedCodeCard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readPayLaterEnabled } from "@/lib/payLaterSettingsServer";

export const metadata: Metadata = {
  title: "Payments | MoveRestore",
};

export default async function Page() {
  const d = await loadPatientDashboard("receipts");

  // A trusted-patient code is offered only while the clinic offers pay later
  // and this account is not on it already. Either read failing hides it.
  const showTrustedCode = await (async () => {
    try {
      const {
        data: { user },
      } = await (await createClient()).auth.getUser();
      if (!user) return false;
      const admin = createAdminClient();
      const [enabled, { data: me }] = await Promise.all([
        readPayLaterEnabled(admin),
        admin.from("profiles").select("pay_later_enabled, referred_by_hospital_id").eq("id", user.id).maybeSingle(),
      ]);
      return enabled && !!me && me.pay_later_enabled === false && !me.referred_by_hospital_id;
    } catch {
      return false;
    }
  })();

  return (
    <PatientDashboardShell data={d} title="Payments" subtitle="Every payment, refund and failed attempt on your account.">
      {showTrustedCode && (
        <div className="mt-8">
          <RedeemTrustedCodeCard />
        </div>
      )}
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
