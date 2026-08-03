import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/auth/SignOutButton";
import SubmitReferralForm from "@/components/hospital/SubmitReferralForm";
import { formatSlotTime } from "@/lib/formatSlotTime";

export const metadata: Metadata = {
  title: "Partner Dashboard | Dr. Pooja's Physio",
};

const STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending Review",
  therapist_assigned: "Therapist Assigned",
  invite_sent: "Invite Sent",
  converted: "Registered",
  declined: "Declined",
};

export default async function HospitalDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, organization_name, referral_code")
    .eq("id", user.id)
    .single();

  const { data: referrals } = await supabase
    .from("patient_referrals")
    .select(
      "id, patient_name, medical_issue, status, assigned_slot_time, created_at"
    )
    .eq("hospital_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <section className="py-8 max-w-5xl mx-auto px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {profile?.organization_name ?? "Partner"} Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Welcome, {profile?.full_name}
          </p>
        </div>
        <SignOutButton />
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-8 text-xs text-blue-900 flex items-center justify-between flex-wrap gap-2">
        <span>
          Your referral code — share it with patients who book directly:
        </span>
        <span className="font-mono font-bold text-sm bg-white border border-blue-200 px-3 py-1 rounded-lg">
          {profile?.referral_code}
        </span>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-lg text-slate-800 mb-4">
            Refer a Patient
          </h2>
          <SubmitReferralForm hospitalId={user.id} />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-lg text-slate-800 mb-4">
            Your Referrals
          </h2>
          {!referrals || referrals.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              You haven&apos;t submitted any referrals yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {referrals.map((r) => (
                <li
                  key={r.id}
                  className="p-4 rounded-xl border border-slate-200 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-slate-900">
                      {r.patient_name}
                    </p>
                    <span className="font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </div>
                  <p className="text-slate-500">{r.medical_issue}</p>
                  {r.assigned_slot_time && (
                    <p className="text-slate-500">
                      Slot: {formatSlotTime(r.assigned_slot_time, null)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
