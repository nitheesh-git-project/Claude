import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import AvatarUpload from "@/components/profile/AvatarUpload";
import InstantProfileFields from "@/components/profile/InstantProfileFields";
import GatedProfileFields from "@/components/profile/GatedProfileFields";
import AccountSecuritySection from "@/components/profile/AccountSecuritySection";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { computeFieldStatus } from "@/lib/computeFieldStatus";
import { LANGUAGE_OPTIONS } from "@/lib/languageOptions";
import { buildPatientNavItems } from "@/lib/dashboardNavItems";
import { parseAdminSettings } from "@/lib/adminSettings";

export const metadata: Metadata = {
  title: "Edit Profile | Dr. Pooja's Physio",
};

export default async function PatientProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "full_name, email, avatar_url, phone, date_of_birth, gender, emergency_contact_name, emergency_contact_phone, preferred_language"
    )
    .eq("id", user.id)
    .single();

  // patient_code is new/migration-dependent -- kept isolated (see
  // sessionCode.ts's comment / this codebase's established convention) so
  // an unknown-column error here only degrades this one badge.
  const { data: patientCodeRow } = await supabase
    .from("profiles")
    .select("patient_code")
    .eq("id", user.id)
    .maybeSingle();

  const { data: changeRequests } = await supabase
    .from("profile_change_requests")
    .select("id, status, admin_notes, changes, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const fieldStatus = computeFieldStatus(changeRequests ?? []);

  // Cheap existence-only checks, not the full rows the dashboard page
  // itself fetches -- this page only needs to know whether to show these
  // two sidebar nav items, so the dashboard page and this one always agree
  // on what's in the sidebar (see buildPatientNavItems).
  const { count: ownedPackagesCount } = await supabase
    .from("patient_package_purchases")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", user.id)
    .eq("payment_status", "paid");
  const { count: availablePackagesCount } = await supabase
    .from("treatment_category_packages")
    .select("id", { count: "exact", head: true })
    .eq("active", true);

  // These site_settings columns are new/migration-dependent -- isolated so
  // a missing migration only disables Feature Control's effects, not the
  // whole page.
  const { data: settingsRow } = await supabase
    .from("site_settings")
    .select("session_packages_visible, session_timeout_minutes, google_meet_enabled, join_window_minutes")
    .maybeSingle();
  const adminSettings = parseAdminSettings(settingsRow);

  const navItems = buildPatientNavItems({
    hasOwnedPackages: !!ownedPackagesCount && ownedPackagesCount > 0,
    hasAvailablePackages:
      adminSettings.sessionPackagesVisible && !!availablePackagesCount && availablePackagesCount > 0,
  });

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
      brandLabel="Patient Panel"
      brandIcon="fa-user-injured"
      basePath="/patient/dashboard"
      navItems={navItems}
      userName={profile?.full_name ?? "Patient"}
      userEmail={profile?.email ?? user.email ?? ""}
      userAvatarUrl={profile?.avatar_url ?? null}
      userCode={patientCodeRow?.patient_code ?? null}
      offsetTop={showDebugNav}
      sessionTimeoutMinutes={adminSettings.sessionTimeoutMinutes}
      headerTitle="Edit Profile"
      headerSubtitle="Update your personal details, contact info, and account security."
    >
      <div className="max-w-2xl mx-auto">
      <div id="profile-photo" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <AvatarUpload
          userId={user.id}
          currentUrl={profile?.avatar_url ?? null}
          name={profile?.full_name ?? "P"}
        />
      </div>

      <div id="personal-details" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <h2 className="font-bold text-lg text-slate-800 mb-1">Personal Details</h2>
        <p className="text-xs text-slate-500 mb-4">
          These require admin approval before they take effect.
        </p>
        <GatedProfileFields
          userId={user.id}
          fields={[
            { name: "full_name", label: "Full Name", type: "text" },
            {
              name: "date_of_birth",
              label: "Date of Birth",
              type: "date",
              max: new Date().toISOString().slice(0, 10),
            },
            {
              name: "gender",
              label: "Gender",
              type: "select",
              options: ["Female", "Male", "Other", "Prefer not to say"],
            },
            { name: "phone", label: "Phone Number", type: "phone" },
          ]}
          currentValues={{
            full_name: profile?.full_name ?? "",
            date_of_birth: profile?.date_of_birth ?? "",
            gender: profile?.gender ?? "",
            phone: profile?.phone ?? "",
          }}
          fieldStatus={fieldStatus}
        />
      </div>

      <div id="contact-details" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <h2 className="font-bold text-lg text-slate-800 mb-4">Contact Details</h2>
        <InstantProfileFields
          userId={user.id}
          fields={[
            {
              name: "preferred_language",
              label: "Preferred Language",
              type: "select",
              options: LANGUAGE_OPTIONS,
            },
            { name: "emergency_contact_name", label: "Emergency Contact Name", type: "text" },
            { name: "emergency_contact_phone", label: "Emergency Contact Phone", type: "phone" },
          ]}
          currentValues={{
            preferred_language: profile?.preferred_language ?? "",
            emergency_contact_name: profile?.emergency_contact_name ?? "",
            emergency_contact_phone: profile?.emergency_contact_phone ?? "",
          }}
        />
      </div>

      <div id="account-security" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
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
