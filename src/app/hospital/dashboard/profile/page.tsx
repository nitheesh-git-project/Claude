import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import AccountSecuritySection from "@/components/profile/AccountSecuritySection";
import DashboardShell, { type ShellNavItem } from "@/components/dashboard/DashboardShell";
import { parseAdminSettings } from "@/lib/adminSettings";

export const metadata: Metadata = {
  title: "Account Security | Dr. Pooja's Physio",
};

export default async function HospitalProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, organization_name, email, avatar_url")
    .eq("id", user.id)
    .single();

  // hospital_code is new/migration-dependent -- kept isolated, same
  // convention as the main hospital dashboard page.
  const { data: hospitalCodeRow } = await supabase
    .from("profiles")
    .select("hospital_code")
    .eq("id", user.id)
    .maybeSingle();

  // These site_settings columns are new/migration-dependent -- isolated so
  // a missing migration only disables Feature Control's effects, not the
  // whole page.
  const { data: settingsRow } = await supabase
    .from("site_settings")
    .select("session_packages_visible, session_timeout_minutes, google_meet_enabled, join_window_minutes")
    .maybeSingle();
  const adminSettings = parseAdminSettings(settingsRow);

  // Same array as the main hospital dashboard page's navItems, plus this
  // page's own entry -- basePath stays "/hospital/dashboard" (not
  // "/hospital/dashboard/profile") so the anchor items above still resolve
  // to "/hospital/dashboard#id" and land back on the right section, same
  // pattern as buildPatientNavItems/THERAPIST_NAV_ITEMS.
  const navItems: ShellNavItem[] = [
    { id: "refer", label: "Refer a Patient", icon: "fa-user-plus" },
    { id: "referrals", label: "Your Referrals", icon: "fa-list-check" },
    { id: "revenue", label: "Revenue & Payouts", icon: "fa-chart-line" },
    { id: "profile", label: "Account Security", icon: "fa-lock", href: "/hospital/dashboard/profile" },
  ];

  // Same computation as the root layout's own showDebugNav -- duplicated
  // here (rather than threaded through props from a layout) because this
  // page hides the shared Navbar entirely and needs the same dev-only-bar
  // offset for its own fixed sidebar. See DashboardShell's offsetTop prop.
  const showDebugNav =
    process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV === "true" ||
    (process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV !== "false" &&
      process.env.NODE_ENV !== "production");

  return (
    <DashboardShell
      brandLabel="Partner Panel"
      brandIcon="fa-hospital"
      basePath="/hospital/dashboard"
      navItems={navItems}
      userName={profile?.full_name ?? "Partner"}
      userEmail={profile?.email ?? user.email ?? ""}
      userAvatarUrl={profile?.avatar_url ?? null}
      userCode={hospitalCodeRow?.hospital_code ?? null}
      offsetTop={showDebugNav}
      sessionTimeoutMinutes={adminSettings.sessionTimeoutMinutes}
      headerTitle="Account Security"
      headerSubtitle="Change your password by email — this keeps your account secure."
    >
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-lg text-slate-800 mb-1">Account Security</h2>
          <p className="text-xs text-slate-500 mb-4">
            Change your password by email — this keeps your account secure.
          </p>
          <AccountSecuritySection email={profile?.email ?? user.email ?? ""} />
        </div>
      </div>
    </DashboardShell>
  );
}
