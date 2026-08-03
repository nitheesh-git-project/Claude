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

export default async function TherapistProfilePage() {
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
      "full_name, avatar_url, phone, credentials, specialization, years_experience, bio, languages"
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

  const initials = String(profile?.full_name ?? "T")
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
            href="/therapist/dashboard"
            className="text-xs text-purple-700 font-semibold mt-1 inline-block"
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
        <h2 className="font-bold text-lg text-slate-800 mb-4">Public Details</h2>
        <InstantProfileFields
          userId={user.id}
          fields={[
            { name: "phone", label: "WhatsApp / Phone", type: "tel" },
            { name: "languages", label: "Languages Spoken", type: "text" },
            { name: "bio", label: "Short Bio", type: "textarea" },
          ]}
          currentValues={{
            phone: profile?.phone ?? "",
            languages: profile?.languages ?? "",
            bio: profile?.bio ?? "",
          }}
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
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
            { name: "years_experience", label: "Years of Experience", type: "number" },
          ]}
          currentValues={{
            full_name: profile?.full_name ?? "",
            credentials: profile?.credentials ?? "",
            specialization: profile?.specialization ?? "",
            years_experience:
              profile?.years_experience !== null && profile?.years_experience !== undefined
                ? String(profile.years_experience)
                : "",
          }}
          latestRequest={latestRequest ?? null}
        />
      </div>
    </section>
  );
}
