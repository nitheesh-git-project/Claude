import type { ReactNode } from "react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { JoinWindowProvider } from "@/lib/joinWindowContext";
import type { PatientDashboardData } from "@/lib/patientDashboardData";
import { isDebugNavVisible } from "@/lib/debugNavVisible";

/**
 * The chrome every patient dashboard screen shares: sidebar, header,
 * realtime subscriptions, idle timeout.
 *
 * Each screen is its own route now (/book, /sessions, /calendar, ...)
 * rather than an anchor on one long scroll, so this exists to stop seven
 * routes each assembling their own shell props and drifting apart.
 */
export default function PatientDashboardShell({
  data,
  title,
  subtitle,
  children,
}: {
  data: PatientDashboardData;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  const showDebugNav = isDebugNavVisible();

  return (
    // Every JoinSessionButton under this shell reads its window from here
    // rather than being prop-drilled through the session cards, the
    // calendar and the packages widget.
    <JoinWindowProvider
      beforeMinutes={data.adminSettings.joinWindowMinutes}
      afterMinutes={data.adminSettings.joinWindowAfterMinutes}
      completedAfterMinutes={data.adminSettings.sessionCompletedAfterMinutes}
    >
    <DashboardShell
      brandLabel="Patient Panel"
      brandIcon="fa-user-injured"
      basePath="/patient/dashboard"
      navItems={data.navItems}
      userName={data.profile?.full_name ?? "Patient"}
      userEmail={data.profile?.email ?? data.user.email ?? ""}
      userAvatarUrl={data.profile?.avatar_url ?? null}
      userCode={data.patientCodeRow?.patient_code ?? null}
      offsetTop={showDebugNav}
      sessionTimeoutMinutes={data.adminSettings.sessionTimeoutMinutes}
      realtimeTables={[
        "appointments",
        "site_settings",
        "patient_package_purchases",
        "payment_failure_log",
        "treatment_categories",
        "treatment_category_packages",
        "patient_condition_profiles",
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
