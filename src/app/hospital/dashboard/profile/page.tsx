import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import AccountSecuritySection from "@/components/profile/AccountSecuritySection";
import AvatarUpload from "@/components/profile/AvatarUpload";
import GatedProfileFields from "@/components/profile/GatedProfileFields";
import InstantProfileFields from "@/components/profile/InstantProfileFields";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { HOSPITAL_NAV_ITEMS } from "@/lib/dashboardNavItems";
import { computeFieldStatus } from "@/lib/computeFieldStatus";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { isDebugNavVisible } from "@/lib/debugNavVisible";

export const metadata: Metadata = {
  title: "Edit Profile | Dr. Pooja's Physio",
};

export default async function HospitalProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // Independent of each other -- run in parallel instead of one at a time.
  // See admin/dashboard/page.tsx's identical Promise.all for the reasoning.
  const [{ data: profile }, { data: hospitalCodeRow }, { data: settingsRow }, { data: changeRequests }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, organization_name, email, phone, avatar_url, preferred_language")
        .eq("id", user.id)
        .single(),

      // hospital_code is new/migration-dependent -- kept isolated, same
      // convention as the main hospital dashboard page.
      supabase.from("profiles").select("hospital_code").eq("id", user.id).maybeSingle(),

      // These site_settings columns are new/migration-dependent -- isolated
      // so a missing migration only disables Feature Control's effects, not
      // the whole page.
      supabase.from("site_settings").select(SITE_SETTINGS_SELECT).maybeSingle(),

      supabase
        .from("profile_change_requests")
        .select("id, status, admin_notes, changes, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);
  const adminSettings = parseAdminSettings(settingsRow);
  const fieldStatus = computeFieldStatus(changeRequests ?? []);

  // This page hides the shared Navbar entirely, so it needs the debug
  // bar's own top offset for its fixed sidebar. See DashboardShell's offsetTop prop.
  const showDebugNav = isDebugNavVisible();

  return (
    <DashboardShell
      brandLabel="Partner Panel"
      brandIcon="fa-hospital"
      basePath="/hospital/dashboard"
      navItems={HOSPITAL_NAV_ITEMS}
      userName={profile?.organization_name ?? profile?.full_name ?? "Partner"}
      userEmail={profile?.email ?? user.email ?? ""}
      userAvatarUrl={profile?.avatar_url ?? null}
      userCode={hospitalCodeRow?.hospital_code ?? null}
      offsetTop={showDebugNav}
      sessionTimeoutMinutes={adminSettings.sessionTimeoutMinutes}
      realtimeTables={["patient_referrals", "profile_change_requests"]}
      headerTitle="Edit Profile"
      headerSubtitle="Your organisation's details, your contact preferences, and account security."
    >
      <div className="max-w-2xl mx-auto">
        <div id="profile-photo" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
          <AvatarUpload
            userId={user.id}
            currentUrl={profile?.avatar_url ?? null}
            name={profile?.organization_name ?? profile?.full_name ?? "H"}
          />
        </div>

        <div
          id="organisation-details"
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6"
        >
          <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Organisation Details</h2>
          {/* Gated rather than instant-save, for the same reason a
              therapist's credentials are: patients are told which hospital
              referred them, so the organisation's name is a trust claim a
              partner should not be able to rewrite unilaterally. */}
          <p className="text-xs text-slate-500 mb-4">
            Patients see your organisation&apos;s name on their referral, so these require admin
            approval before they take effect.
          </p>
          <GatedProfileFields
            userId={user.id}
            fields={[
              { name: "organization_name", label: "Organisation Name", type: "text" },
              { name: "full_name", label: "Primary Contact Name", type: "text" },
              { name: "phone", label: "Contact Phone", type: "phone" },
            ]}
            currentValues={{
              organization_name: profile?.organization_name ?? "",
              full_name: profile?.full_name ?? "",
              phone: profile?.phone ?? "",
            }}
            fieldStatus={fieldStatus}
          />
        </div>

        <div
          id="contact-details"
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6"
        >
          <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Contact Preferences</h2>
          <p className="text-xs text-slate-500 mb-4">Saved as soon as you change them.</p>
          <InstantProfileFields
            userId={user.id}
            fields={[
              {
                name: "preferred_language",
                label: "Preferred Language",
                type: "select",
                options: adminSettings.bookingLanguages,
              },
            ]}
            currentValues={{ preferred_language: profile?.preferred_language ?? "" }}
          />
        </div>

        <div id="account-security" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Account Security</h2>
          <p className="text-xs text-slate-500 mb-4">
            Change your password by email — this keeps your account secure.
          </p>
          <AccountSecuritySection email={profile?.email ?? user.email ?? ""} />
        </div>
      </div>
    </DashboardShell>
  );
}
