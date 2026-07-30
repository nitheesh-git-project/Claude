import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import SignOutButton from "@/components/auth/SignOutButton";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";
import CompleteSessionButton from "@/components/CompleteSessionButton";
import { formatSlotTime } from "@/lib/formatSlotTime";

const STATUS_BADGE_STYLES: Record<string, string> = {
  requested: "text-amber-700 bg-amber-50",
  confirmed: "text-purple-700 bg-purple-50",
  completed: "text-teal-700 bg-teal-50",
  cancelled: "text-red-700 bg-red-50",
};

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
    .select("full_name, credentials, avatar_url, revenue_share_percent")
    .eq("id", user.id)
    .single();

  const { data: appointments } = await supabase
    .from("appointments")
    .select("id, slot_time, timezone, concern, status, duration_minutes, notes, patient_id")
    .eq("therapist_id", user.id)
    .order("created_at", { ascending: false });

  // A therapist can read their own appointment rows via RLS, but not the
  // linked patients' profiles (that policy only allows a user to read
  // their own row) — so their patients' names/contact info have to be
  // looked up here via the admin client, scoped to just the columns
  // needed to actually run the session.
  const patientIds = [...new Set((appointments ?? []).map((a) => a.patient_id))];
  const admin = createAdminClient();
  const { data: patients } =
    patientIds.length > 0
      ? await admin
          .from("profiles")
          .select("id, full_name, phone, email")
          .in("id", patientIds)
      : { data: [] as { id: string; full_name: string; phone: string | null; email: string }[] };
  const patientMap = new Map((patients ?? []).map((p) => [p.id, p]));

  return (
    <section className="py-8 max-w-5xl mx-auto px-4">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <AvatarThumbnail
            url={profile?.avatar_url}
            name={profile?.full_name ?? "T"}
            size={48}
          />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Welcome, {profile?.full_name ?? "there"}
            </h1>
            <p className="text-xs text-slate-500 mt-1">{profile?.credentials}</p>
            {profile?.revenue_share_percent !== null &&
              profile?.revenue_share_percent !== undefined && (
                <p className="text-[11px] text-slate-400 mt-1">
                  Your Revenue Share:{" "}
                  <strong className="text-slate-600">{profile.revenue_share_percent}%</strong>
                </p>
              )}
          </div>
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
            {appointments.map((a) => {
              const patient = patientMap.get(a.patient_id);
              return (
                <li
                  key={a.id}
                  className="p-4 rounded-xl border border-slate-200 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-bold text-slate-900">
                        {patient?.full_name ?? "Unknown patient"}
                      </p>
                      <p className="text-slate-500">
                        {patient?.phone || patient?.email || "No contact on file"}
                      </p>
                    </div>
                    <span
                      className={`capitalize font-semibold px-3 py-1 rounded-full ${
                        STATUS_BADGE_STYLES[a.status] ?? "text-slate-600 bg-slate-100"
                      }`}
                    >
                      {a.status}
                    </span>
                  </div>
                  <p className="text-slate-600">
                    <strong>{a.concern ?? "General Consultation"}</strong> —{" "}
                    {formatSlotTime(a.slot_time, a.timezone)}
                    {a.duration_minutes && ` • ${a.duration_minutes} min`}
                  </p>
                  {a.notes && (
                    <p className="text-slate-500">
                      <span className="font-semibold text-slate-400">Notes:</span> {a.notes}
                    </p>
                  )}
                  {a.status === "confirmed" && (
                    <CompleteSessionButton appointmentId={a.id} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
