import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/auth/SignOutButton";

export const metadata: Metadata = {
  title: "Patient Dashboard | Dr. Pooja's Physio",
};

export default async function PatientDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const { data: appointments } = await supabase
    .from("appointments")
    .select("id, slot_time, timezone, concern, status")
    .eq("patient_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <section className="py-8 max-w-5xl mx-auto px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome back, {profile?.full_name ?? "there"}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Your virtual physical therapy dashboard
          </p>
        </div>
        <SignOutButton />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg text-slate-800">Your Sessions</h2>
          <Link
            href="/book"
            className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
          >
            Book New Session
          </Link>
        </div>

        {!appointments || appointments.length === 0 ? (
          <p className="text-xs text-slate-500 py-8 text-center">
            You don&apos;t have any sessions yet. Book your first consultation
            to get started.
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
                    {a.slot_time
                      ? new Date(a.slot_time).toLocaleString()
                      : "Slot to be confirmed"}
                  </p>
                </div>
                <span className="capitalize font-semibold text-teal-700 bg-teal-50 px-3 py-1 rounded-full">
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
