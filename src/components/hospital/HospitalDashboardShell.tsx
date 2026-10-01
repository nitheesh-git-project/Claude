import type { ReactNode } from "react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { JoinWindowProvider } from "@/lib/joinWindowContext";
import type { HospitalDashboardData } from "@/lib/hospitalDashboardData";
import { isDebugNavVisible } from "@/lib/debugNavVisible";
import AdminDataLoadBanner from "@/components/admin/AdminDataLoadBanner";

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
  const showDebugNav = isDebugNavVisible();

  return (
    <JoinWindowProvider
      beforeMinutes={data.adminSettings.joinWindowMinutes}
      afterMinutes={data.adminSettings.joinWindowAfterMinutes}
      completedAfterMinutes={data.adminSettings.sessionCompletedAfterMinutes}
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
        {/* A failed read is said out loud rather than rendered as "no
            referrals" or "₹0 earned" -- see AdminDataLoadBanner. */}
        {(data.loadIssues.missing.length > 0 || data.loadIssues.truncated.length > 0) && (
          <div className="mb-6">
            <AdminDataLoadBanner
              missing={data.loadIssues.missing}
              truncated={data.loadIssues.truncated}
            />
          </div>
        )}
        {children}
      </DashboardShell>
    </JoinWindowProvider>
  );
}
