import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import SignOutButton from "@/components/auth/SignOutButton";
import SubmitReferralForm from "@/components/hospital/SubmitReferralForm";
import { formatSlotTime } from "@/lib/formatSlotTime";
import { formatReferralStatus } from "@/lib/referralStatus";
import { SESSION_FEE_INR } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Partner Dashboard | Dr. Pooja's Physio",
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
    .select("full_name, organization_name, referral_code, revenue_share_percent")
    .eq("id", user.id)
    .single();

  const { data: referrals } = await supabase
    .from("patient_referrals")
    .select(
      "id, patient_name, medical_issue, status, assigned_slot_time, created_at"
    )
    .eq("hospital_id", user.id)
    .order("created_at", { ascending: false });

  // Revenue transparency: which sessions (across both referral channels)
  // are attributed to this hospital and paid. RLS wouldn't normally let a
  // hospital see other people's appointments, so this uses the
  // service-role client — but strictly scoped to rows referencing this
  // hospital's own id, never anything broader.
  const admin = createAdminClient();
  const { data: referredPatients } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .eq("referred_by_hospital_id", user.id);
  const referredPatientIds = (referredPatients ?? []).map((p) => p.id);

  const { data: referredSessions } =
    referredPatientIds.length > 0
      ? await admin
          .from("appointments")
          .select("id, concern, slot_time, timezone, status, payment_status, patient_id, created_at")
          .in("patient_id", referredPatientIds)
          .order("created_at", { ascending: false })
      : { data: [] as never[] };

  const patientMap = new Map((referredPatients ?? []).map((p) => [p.id, p]));
  const paidSessions = (referredSessions ?? []).filter(
    (s) => s.payment_status === "paid"
  );
  const totalRevenue = paidSessions.length * SESSION_FEE_INR;
  const sharePercent = profile?.revenue_share_percent ?? 0;
  const hospitalCut = (totalRevenue * sharePercent) / 100;
  const companyCut = totalRevenue - hospitalCut;

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
                      {formatReferralStatus(r.status)}
                    </span>
                  </div>
                  <p className="text-slate-500">{r.medical_issue}</p>
                  {r.assigned_slot_time && (
                    <p className="text-slate-500">
                      Slot: {formatSlotTime(r.assigned_slot_time, "Asia/Kolkata")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-6">
        <h2 className="font-bold text-lg text-slate-800 mb-4">
          Revenue & Payouts
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-slate-500">Revenue Share</p>
            <p className="text-lg font-bold text-slate-900">{sharePercent}%</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-slate-500">Paid Sessions</p>
            <p className="text-lg font-bold text-slate-900">
              {paidSessions.length}
            </p>
          </div>
          <div className="bg-teal-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-slate-500">Your Cut</p>
            <p className="text-lg font-bold text-teal-700">
              ₹{hospitalCut.toFixed(2)}
            </p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-slate-500">Company&apos;s Cut</p>
            <p className="text-lg font-bold text-slate-900">
              ₹{companyCut.toFixed(2)}
            </p>
          </div>
        </div>

        {!referredSessions || referredSessions.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No sessions from your referred patients yet.
          </p>
        ) : (
          <ul className="space-y-2 text-xs">
            {referredSessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between p-3 rounded-xl border border-slate-200"
              >
                <div>
                  <p className="font-bold text-slate-900">
                    {patientMap.get(s.patient_id)?.full_name ?? "Patient"}
                  </p>
                  <p className="text-slate-500">
                    {s.concern} — {formatSlotTime(s.slot_time, s.timezone)}
                  </p>
                </div>
                <span
                  className={`font-semibold px-3 py-1 rounded-full ${
                    s.payment_status === "paid"
                      ? "text-green-700 bg-green-50"
                      : "text-slate-500 bg-slate-100"
                  }`}
                >
                  {s.payment_status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
