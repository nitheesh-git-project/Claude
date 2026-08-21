import type { ReactNode } from "react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { JoinWindowProvider } from "@/lib/joinWindowContext";
import type { HospitalDashboardData } from "@/lib/hospitalDashboardData";

/** The chrome every hospital (B2B) dashboard screen shares. */
export default function HospitalDashboardShell({
  data,
  title,
  subtitle,
  children,
}: {
  data: HospitalDashboardData;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  const showDebugNav =
    process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV === "true" ||
    (process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV !== "false" && process.env.NODE_ENV !== "production");

  return (
    <JoinWindowProvider
      beforeMinutes={data.adminSettings.joinWindowMinutes}
      afterMinutes={data.adminSettings.joinWindowAfterMinutes}
    >
      <DashboardShell
        brandLabel="Partner Panel"
        brandIcon="fa-hospital"
        basePath="/hospital/dashboard"
        navItems={data.navItems}
        userName={data.profile?.organization_name ?? data.profile?.full_name ?? "Partner"}
        userEmail={data.user.email ?? ""}
        userAvatarUrl={data.profile?.avatar_url ?? null}
        userCode={data.hospitalCodeRow?.hospital_code ?? null}
        offsetTop={showDebugNav}
        sessionTimeoutMinutes={data.adminSettings.sessionTimeoutMinutes}
        realtimeTables={["patient_referrals", "appointments", "site_settings"]}
        headerTitle={title}
        headerSubtitle={subtitle}
      >
        {children}
      </DashboardShell>
    </JoinWindowProvider>
  );
}
