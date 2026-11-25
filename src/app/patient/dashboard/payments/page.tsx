import type { Metadata } from "next";
import PatientDashboardShell from "@/components/patient/PatientDashboardShell";
import { loadPatientDashboard } from "@/lib/patientDashboardData";
import ReceiptsSection from "@/components/ReceiptsSection";
import { buildPatientReceipts } from "@/lib/receipts";
import RedeemTrustedCodeCard from "@/components/patient/RedeemTrustedCodeCard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readPayLaterEnabled } from "@/lib/payLaterSettingsServer";
import TabSummary from "@/components/dashboard/TabSummary";
import { paymentsSummary } from "@/lib/tabSummaries";
import { formatInr } from "@/lib/formatMoney";
import { formatClinicDate } from "@/lib/formatDateTime";

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

  const receipts = buildPatientReceipts(
    d.appointments ?? [],
    d.allPackagePurchases ?? [],
    d.paymentFailures ?? [],
    d.categoryTitleMap
  );
  const summary = paymentsSummary(receipts);

  return (
    <PatientDashboardShell data={d} title="Payments" subtitle="Every payment, refund and failed attempt on your account.">
      <TabSummary
        testId="payments-summary"
        eyebrow="Last payment"
        title={summary.latest ? formatInr(summary.latest.amountPaise) : "No payments yet"}
        detail={
          summary.latest
            ? `${summary.latest.title} · ${formatClinicDate(summary.latest.date)}`
            : "Receipts appear here once you make a payment."
        }
        facts={[
          { label: "Payments", value: String(summary.payments), tone: "teal" },
          { label: "Refunds", value: String(summary.refunds), tone: "green" },
          { label: "Didn't go through", value: String(summary.failed), tone: summary.failed > 0 ? "rose" : "slate" },
        ]}
      >
        <p className="mt-3 flex items-center gap-2 text-[13px] text-slate-500">
          <i aria-hidden className="fa-solid fa-lock text-[11px]" />
          Card and UPI details are entered with Razorpay, never stored by the clinic.
        </p>
      </TabSummary>
      {showTrustedCode && (
        <div className="mt-8">
          <RedeemTrustedCodeCard />
        </div>
      )}
      <div id="receipts" className="mt-8">
        <ReceiptsSection
          receipts={receipts}
          sessionCodeByAppointmentId={Object.fromEntries(
            d.appointments.map((a) => [a.id, a.session_code])
          )}
        />
      </div>
    </PatientDashboardShell>
  );
}
