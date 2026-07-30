import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/auth/SignOutButton";
import AvatarUpload from "@/components/profile/AvatarUpload";
import InstantProfileFields from "@/components/profile/InstantProfileFields";
import GatedProfileFields from "@/components/profile/GatedProfileFields";

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
      "full_name, avatar_url, phone, date_of_birth, gender, emergency_contact_name, emergency_contact_phone, preferred_language"
    )
    .eq("id", user.id)
    .single();

  const { data: latestRequest } = await supabase
    .from("profile_change_requests")
    .select("id, status, admin_notes, changes")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const initials = String(profile?.full_name ?? "P")
    .split(" ")
    .filter(Boolean)
    .map((s: string) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <section className="py-8 max-w-2xl mx-auto px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Edit Profile</h1>
          <Link
            href="/patient/dashboard"
            className="text-xs text-teal-700 font-semibold mt-1 inline-block"
          >
            ← Back to Dashboard
          </Link>
        </div>
        <SignOutButton />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <AvatarUpload
          userId={user.id}
          currentUrl={profile?.avatar_url ?? null}
          fallbackInitials={initials}
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <h2 className="font-bold text-lg text-slate-800 mb-4">Contact Details</h2>
        <InstantProfileFields
          userId={user.id}
          fields={[
            { name: "phone", label: "WhatsApp / Phone", type: "tel" },
            { name: "preferred_language", label: "Preferred Language", type: "text" },
            { name: "emergency_contact_name", label: "Emergency Contact Name", type: "text" },
            { name: "emergency_contact_phone", label: "Emergency Contact Phone", type: "tel" },
          ]}
          currentValues={{
            phone: profile?.phone ?? "",
            preferred_language: profile?.preferred_language ?? "",
            emergency_contact_name: profile?.emergency_contact_name ?? "",
            emergency_contact_phone: profile?.emergency_contact_phone ?? "",
          }}
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-bold text-lg text-slate-800 mb-1">Personal Details</h2>
        <p className="text-xs text-slate-500 mb-4">
          These require admin approval before they take effect.
        </p>
        <GatedProfileFields
          userId={user.id}
          fields={[
            { name: "full_name", label: "Full Name", type: "text" },
            { name: "date_of_birth", label: "Date of Birth", type: "date" },
            {
              name: "gender",
              label: "Gender",
              type: "select",
              options: ["Female", "Male", "Other", "Prefer not to say"],
            },
          ]}
          currentValues={{
            full_name: profile?.full_name ?? "",
            date_of_birth: profile?.date_of_birth ?? "",
            gender: profile?.gender ?? "",
          }}
          latestRequest={latestRequest ?? null}
        />
      </div>
    </section>
  );
}
