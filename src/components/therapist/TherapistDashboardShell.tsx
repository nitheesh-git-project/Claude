import type { ReactNode } from "react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { JoinWindowProvider } from "@/lib/joinWindowContext";
import type { TherapistDashboardData } from "@/lib/therapistDashboardData";
import { isDebugNavVisible } from "@/lib/debugNavVisible";
import AdminDataLoadBanner from "@/components/admin/AdminDataLoadBanner";

/**
 * The chrome every therapist dashboard screen shares. Same role as
 * PatientDashboardShell: each section is its own route now, so the shell
 * props live in one place instead of being reassembled per route.
 */
export default function TherapistDashboardShell({
  data,
  title,
  subtitle,
  children,
}: {
  data: TherapistDashboardData;
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
        brandLabel="Therapist Panel"
        brandIcon="fa-user-doctor"
        basePath="/therapist/dashboard"
        navItems={data.navItems}
        userName={data.profile?.full_name ?? "Therapist"}
        userEmail={data.user.email ?? ""}
        userAvatarUrl={data.profile?.avatar_url ?? null}
        userCode={data.therapistCodeRow?.therapist_code ?? null}
        offsetTop={showDebugNav}
        sessionTimeoutMinutes={data.adminSettings.sessionTimeoutMinutes}
        realtimeTables={[
          "appointments",
          "therapist_availability_template",
          "therapist_availability_override",
          "therapist_payout_batches",
          "therapist_payout_requests",
          "site_settings",
          "session_notes",
          "session_suggestions",
          // The therapist needs the patient's answer to a recommendation
          // without reloading, same as they do for a proposed time.
          "care_plans",
        ]}
        headerTitle={title}
        headerSubtitle={subtitle}
      >
        {data.loadIssues.missing.length > 0 && (
          <div className="mb-6">
            <AdminDataLoadBanner missing={data.loadIssues.missing} />
          </div>
        )}
        {children}
      </DashboardShell>
    </JoinWindowProvider>
  );
}
