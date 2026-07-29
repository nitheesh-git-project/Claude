import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import SignOutButton from "@/components/auth/SignOutButton";
import ApproveTherapistButton from "@/components/admin/ApproveTherapistButton";
import AssignTherapistForm from "@/components/admin/AssignTherapistForm";
import { formatSlotTime } from "@/lib/formatSlotTime";

export const metadata: Metadata = {
  title: "Admin Dashboard | Dr. Pooja's Physio",
};

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const admin = createAdminClient();

  const { data: pendingTherapists } = await admin
    .from("profiles")
    .select("id, full_name, email, credentials, created_at")
    .eq("role", "therapist")
    .eq("approved", false)
    .order("created_at", { ascending: false });

  const { data: approvedTherapists } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("role", "therapist")
    .eq("approved", true)
    .order("full_name");

  const { data: appointments } = await admin
    .from("appointments")
    .select(
      "id, slot_time, timezone, concern, status, payment_status, patient_id, therapist_id, created_at"
    )
    .order("created_at", { ascending: false });

  const { data: allProfiles } = await admin
    .from("profiles")
    .select("id, full_name, email");
  const profileMap = new Map((allProfiles ?? []).map((p) => [p.id, p]));

  return (
    <section className="py-8 max-w-6xl mx-auto px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage therapist approvals and bookings
          </p>
        </div>
        <SignOutButton />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
        <h2 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
          Pending Therapist Approvals
          {pendingTherapists && pendingTherapists.length > 0 && (
            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
              {pendingTherapists.length}
            </span>
          )}
        </h2>
        {!pendingTherapists || pendingTherapists.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No pending applications.
          </p>
        ) : (
          <ul className="space-y-3">
            {pendingTherapists.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 text-xs"
              >
                <div>
                  <p className="font-bold text-slate-900">{t.full_name}</p>
                  <p className="text-slate-500 mt-1">{t.email}</p>
                  <p className="text-slate-500 mt-1">{t.credentials}</p>
                </div>
                <ApproveTherapistButton therapistId={t.id} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-bold text-lg text-slate-800 mb-4">All Bookings</h2>
        {!appointments || appointments.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No bookings yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {appointments.map((a) => {
              const patient = profileMap.get(a.patient_id);
              const therapist = a.therapist_id
                ? profileMap.get(a.therapist_id)
                : null;
              return (
                <li
                  key={a.id}
                  className="p-4 rounded-xl border border-slate-200 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="font-bold text-slate-900">
                        {patient?.full_name ?? "Unknown patient"}
                      </p>
                      <p className="text-slate-500">{patient?.email}</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="capitalize font-semibold text-teal-700 bg-teal-50 px-3 py-1 rounded-full">
                        {a.status}
                      </span>
                      <span
                        className={`capitalize font-semibold px-3 py-1 rounded-full ${
                          a.payment_status === "paid"
                            ? "text-green-700 bg-green-50"
                            : "text-slate-500 bg-slate-100"
                        }`}
                      >
                        {a.payment_status}
                      </span>
                    </div>
                  </div>
                  <p className="text-slate-600">
                    <strong>{a.concern}</strong> —{" "}
                    {formatSlotTime(a.slot_time, a.timezone)}
                  </p>
                  {therapist ? (
                    <p className="text-slate-500">
                      Assigned to: <strong>{therapist.full_name}</strong>
                    </p>
                  ) : (
                    <AssignTherapistForm
                      appointmentId={a.id}
                      therapists={approvedTherapists ?? []}
                    />
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
