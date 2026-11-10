import type { Metadata } from "next";
import ProfileLoadFailed from "@/components/profile/ProfileLoadFailed";
import { createClient } from "@/lib/supabase/server";
import AvatarUpload from "@/components/profile/AvatarUpload";
import AccountCreatedNote from "@/components/profile/AccountCreatedNote";
import InstantProfileFields from "@/components/profile/InstantProfileFields";
import GatedProfileFields from "@/components/profile/GatedProfileFields";
import AccountSecuritySection from "@/components/profile/AccountSecuritySection";
import PatientDashboardShell from "@/components/patient/PatientDashboardShell";
import { loadPatientDashboard } from "@/lib/patientDashboardData";
import { computeFieldStatus } from "@/lib/computeFieldStatus";
import { LANGUAGE_OPTIONS } from "@/lib/languageOptions";
import MyAddresses from "@/components/profile/MyAddresses";

export const metadata: Metadata = {
  title: "Edit Profile | MoveRestore",
};

export default async function PatientProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }
  // The shared patient shell (A9): the same sidebar, load banner, guided-check
  // bar and "Suggested for you" bar as every sibling screen. The core only.
  const d = await loadPatientDashboard("profile");

  // Independent of each other -- run in parallel instead of one at a time.
  // See admin/dashboard/page.tsx's identical Promise.all for the reasoning.
  const [
    { data: profile, error: profileError },
    { data: changeRequests, error: changeRequestsError },
    { data: savedAddresses, error: savedAddressesError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "full_name, email, avatar_url, phone, date_of_birth, gender, emergency_contact_name, emergency_contact_phone, preferred_language, created_at"
      )
      .eq("id", user.id)
      .single(),

    supabase
      .from("profile_change_requests")
      .select("id, status, admin_notes, changes, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),


    // The My Addresses sub-tab. RLS scopes this to the caller's own rows,
    // so no ownership filter beyond patient_id is needed.
    supabase
      .from("patient_addresses")
      .select(
        "id, label, line1, line2, landmark, city, state, pincode, contact_phone, access_notes, is_default"
      )
      .eq("patient_id", user.id)
      .eq("active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  const fieldStatus = computeFieldStatus(changeRequests ?? []);
  // A failed read is not a blank profile -- see ProfileLoadFailed. Each
  // section withholds only what it could not read: the addresses card can
  // fail on its own and leave the details editable, and Account Security
  // depends on neither.
  const profileUnreadable = !!profileError || !!changeRequestsError;

  return (
    <PatientDashboardShell
      data={d}
      title="Edit Profile"
      subtitle="Update your personal details, contact info, and account security."
      extraRealtimeTables={["profile_change_requests"]}
    >
      <div className="max-w-2xl mx-auto">
      {profileUnreadable ? (
        <ProfileLoadFailed
          title="We couldn't load your details"
          anchorIds={["profile-photo", "personal-details", "contact-details"]}
          body="Your details and any change you've asked for are safe - they just didn't load this time. Nothing can be edited or sent from here until they do."
        />
      ) : (
      <>
      <div id="profile-photo" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <AvatarUpload
          userId={user.id}
          currentUrl={profile?.avatar_url ?? null}
          name={profile?.full_name ?? "P"}
        />
        <div className="mt-4 pt-4 border-t border-slate-100">
          <AccountCreatedNote createdAt={profile?.created_at} />
        </div>
      </div>

      <div id="personal-details" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Personal Details</h2>
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
        <h2 className="font-display font-bold text-lg text-slate-800 mb-4">Contact Details</h2>
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

      </>
      )}

      <div id="my-addresses" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        {/* An empty list here offers "Add address" -- which, after a failed
            read, is an invitation to save one the patient already has. */}
        {savedAddressesError ? (
          <ProfileLoadFailed
            compact
            title="We couldn't load your saved addresses"
            body="Your addresses are safe - they just didn't load this time. Adding one now could save it twice, so this waits until they do."
          />
        ) : (
          <MyAddresses addresses={savedAddresses ?? []} />
        )}
      </div>

      <div id="account-security" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Account Security</h2>
        <p className="text-xs text-slate-500 mb-4">
          Change your password by email - this keeps your account secure.
        </p>
        <AccountSecuritySection email={profile?.email ?? user.email ?? ""} />
      </div>
      </div>
    </PatientDashboardShell>
  );
}
