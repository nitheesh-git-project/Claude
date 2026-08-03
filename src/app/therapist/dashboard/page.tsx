import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/auth/SignOutButton";
import { formatSlotTime } from "@/lib/formatSlotTime";

export const metadata: Metadata = {
  title: "Therapist Dashboard | Dr. Pooja's Physio",
};

export default async function TherapistDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, credentials")
    .eq("id", user.id)
    .single();

  const { data: appointments } = await supabase
    .from("appointments")
    .select("id, slot_time, timezone, concern, status, duration_minutes")
    .eq("therapist_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <section className="py-8 max-w-5xl mx-auto px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome, {profile?.full_name ?? "there"}
          </h1>
          <p className="text-xs text-slate-500 mt-1">{profile?.credentials}</p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/therapist/dashboard/profile"
            className="text-xs font-semibold text-slate-500 hover:text-purple-700 transition"
          >
            Edit Profile
          </Link>
          <SignOutButton />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-bold text-lg text-slate-800 mb-4">
          Assigned Patient Sessions
        </h2>

        {!appointments || appointments.length === 0 ? (
          <p className="text-xs text-slate-500 py-8 text-center">
            No sessions have been assigned to you yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {appointments.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between p-4 rounded-xl border border-slate-200 text-xs"
              >
                <div>
                  <p className="font-bold text-slate-900">
                    {a.concern ?? "General Consultation"}
                  </p>
                  <p className="text-slate-500 mt-1">
                    {formatSlotTime(a.slot_time, a.timezone)}
                    {a.duration_minutes && ` • ${a.duration_minutes} min`}
                  </p>
                </div>
                <span className="capitalize font-semibold text-purple-700 bg-purple-50 px-3 py-1 rounded-full">
                  {a.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
