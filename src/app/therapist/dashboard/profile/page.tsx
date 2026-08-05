import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import AvatarUpload from "@/components/profile/AvatarUpload";
import InstantProfileFields from "@/components/profile/InstantProfileFields";
import GatedProfileFields from "@/components/profile/GatedProfileFields";
import AccountSecuritySection from "@/components/profile/AccountSecuritySection";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { computeFieldStatus } from "@/lib/computeFieldStatus";
import { THERAPIST_NAV_ITEMS } from "@/lib/dashboardNavItems";
import { parseAdminSettings } from "@/lib/adminSettings";

export const metadata: Metadata = {
  title: "Edit Profile | Dr. Pooja's Physio",
};

export default async function TherapistProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // Independent of each other -- run in parallel instead of one at a time.
  // See admin/dashboard/page.tsx's identical Promise.all for the reasoning.
  const [
    { data: profile },
    { data: changeRequests },
    { data: therapistCodeRow },
    { data: settingsRow },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "full_name, email, avatar_url, phone, credentials, specialization, years_experience, bio, languages"
      )
      .eq("id", user.id)
      .single(),

    supabase
      .from("profile_change_requests")
      .select("id, status, admin_notes, changes, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),

    // therapist_code is new/migration-dependent -- kept isolated (same
    // convention used throughout this codebase) so an unknown-column error
    // here only degrades this one badge.
    supabase.from("profiles").select("therapist_code").eq("id", user.id).maybeSingle(),

    // These site_settings columns are new/migration-dependent -- isolated
    // so a missing migration only disables Feature Control's effects, not
    // the whole page.
    supabase
      .from("site_settings")
      .select("session_packages_visible, session_timeout_minutes, google_meet_enabled, join_window_minutes, join_window_after_minutes")
      .maybeSingle(),
  ]);
  const fieldStatus = computeFieldStatus(changeRequests ?? []);
  const adminSettings = parseAdminSettings(settingsRow);

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
      brandLabel="Therapist Panel"
      brandIcon="fa-user-doctor"
      basePath="/therapist/dashboard"
      navItems={THERAPIST_NAV_ITEMS}
      userName={profile?.full_name ?? "Therapist"}
      userEmail={profile?.email ?? user.email ?? ""}
      userAvatarUrl={profile?.avatar_url ?? null}
      userCode={therapistCodeRow?.therapist_code ?? null}
      offsetTop={showDebugNav}
      sessionTimeoutMinutes={adminSettings.sessionTimeoutMinutes}
      realtimeTables={["appointments", "therapist_payout_requests", "profile_change_requests"]}
      headerTitle="Edit Profile"
      headerSubtitle="Update your public details, credentials, and account security."
    >
      <div className="max-w-2xl mx-auto">
      <div id="profile-photo" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <AvatarUpload
          userId={user.id}
          currentUrl={profile?.avatar_url ?? null}
          name={profile?.full_name ?? "T"}
        />
      </div>

      <div id="public-details" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <h2 className="font-bold text-lg text-slate-800 mb-4">Public Details</h2>
        <InstantProfileFields
          userId={user.id}
          fields={[
            { name: "languages", label: "Languages Spoken", type: "text" },
            { name: "bio", label: "Short Bio", type: "textarea" },
          ]}
          currentValues={{
            languages: profile?.languages ?? "",
            bio: profile?.bio ?? "",
          }}
        />
      </div>

      <div id="credentials" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-bold text-lg text-slate-800 mb-1">
          Credentials &amp; Specialization
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          These require admin approval before they take effect — patients
          rely on this information.
        </p>
        <GatedProfileFields
          userId={user.id}
          fields={[
            { name: "full_name", label: "Full Name", type: "text" },
            {
              name: "credentials",
              label: "Qualifications & License / Council Reg No.",
              type: "text",
            },
            { name: "specialization", label: "Specialist In", type: "text" },
            {
              name: "years_experience",
              label: "Years of Experience",
              type: "number",
              min: 0,
            },
            { name: "phone", label: "Phone Number", type: "phone" },
          ]}
          currentValues={{
            full_name: profile?.full_name ?? "",
            credentials: profile?.credentials ?? "",
            specialization: profile?.specialization ?? "",
            years_experience:
              profile?.years_experience !== null && profile?.years_experience !== undefined
                ? String(profile.years_experience)
                : "",
            phone: profile?.phone ?? "",
          }}
          fieldStatus={fieldStatus}
        />
      </div>

      <div id="account-security" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-6">
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
