import type { ReactNode } from "react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { JoinWindowProvider } from "@/lib/joinWindowContext";
import type { TherapistDashboardData } from "@/lib/therapistDashboardData";

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
  const showDebugNav =
    process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV === "true" ||
    (process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV !== "false" && process.env.NODE_ENV !== "production");

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
        ]}
        headerTitle={title}
        headerSubtitle={subtitle}
      >
        {children}
      </DashboardShell>
    </JoinWindowProvider>
  );
}
