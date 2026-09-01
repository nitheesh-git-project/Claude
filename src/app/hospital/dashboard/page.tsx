import type { Metadata } from "next";
import HospitalDashboardShell from "@/components/hospital/HospitalDashboardShell";
import DashboardOverview from "@/components/dashboard/DashboardOverview";
import { loadHospitalDashboard } from "@/lib/hospitalDashboardData";

export const metadata: Metadata = {
  title: "Partner Dashboard | Dr. Pooja's Physio",
};

// The landing screen. Refer a Patient, Your Referrals and Revenue are
// each their own route now rather than anchors on one scroll.
export default async function HospitalDashboardPage() {
  const d = await loadHospitalDashboard();

  return (
    <HospitalDashboardShell
      data={d}
      title={`Welcome, ${d.profile?.organization_name ?? d.profile?.full_name ?? "Partner"}`}
      subtitle={`Referral code: ${d.profile?.referral_code ?? "—"}`}
    >
        <DashboardOverview
          greeting="Your partnership at a glance"
          headline={
            d.pendingReferrals > 0
              ? `${d.pendingReferrals} referral${d.pendingReferrals === 1 ? "" : "s"} with the clinic right now.`
              : "Everything you've sent has been actioned — refer another patient whenever you're ready."
          }
          cells={d.overviewCells}
          feed={d.hospitalFeed}
          feedEmptyBody="Referrals you send, and what the clinic does with them, show up here."
          actions={[
            { label: "Refer a patient", hint: "Video consultation or home visit", icon: "fa-user-plus", href: "/hospital/dashboard/refer", primary: true },
            { label: "Your referrals", hint: "Status of everyone you've sent", icon: "fa-list-check", href: "/hospital/dashboard/referrals" },
            { label: "Revenue and payouts", hint: "Sessions delivered and your share", icon: "fa-chart-line", href: "/hospital/dashboard/revenue" },
            // Named for the page it opens, matching the sidebar. It said
            // "Account security", which is one section of that page -- a
            // partner correcting their organisation's name had no reason
            // to open something with that name.
            { label: "Edit profile", hint: "Organisation details, contact and password", icon: "fa-user-pen", href: "/hospital/dashboard/profile" },
          ]}
        />
    </HospitalDashboardShell>
  );
}
