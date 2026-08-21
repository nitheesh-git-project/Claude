import type { Metadata } from "next";
import HospitalDashboardShell from "@/components/hospital/HospitalDashboardShell";
import { loadHospitalDashboard } from "@/lib/hospitalDashboardData";
import SurfaceCard, { EmptyState } from "@/components/dashboard/SurfaceCard";
import WithdrawReferralButton from "@/components/hospital/WithdrawReferralButton";
import { formatSlotTime } from "@/lib/formatSlotTime";
import { formatReferralStatus } from "@/lib/referralStatus";

export const metadata: Metadata = {
  title: "Your Referrals | Dr. Pooja's Physio",
};

export default async function Page() {
  const d = await loadHospitalDashboard();

  return (
    <HospitalDashboardShell data={d} title="Your Referrals" subtitle="Everyone you've sent, and where each one stands.">
        <SurfaceCard
          id="referrals"
          title="Your Referrals"
          icon="fa-list-check"
          subtitle="Everyone you've sent, and where each one stands."
        >
          {!d.referrals || d.referrals.length === 0 ? (
            <EmptyState
              icon="fa-hospital-user"
              title="No d.referrals yet"
              body="Send your first patient across and it appears here with its status."
            />
          ) : (
            <ul className="space-y-3">
              {d.referrals.map((r) => (
                <li
                  key={r.id}
                  className="p-4 rounded-xl border border-slate-200 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-slate-900">
                      {r.patient_name}
                    </p>
                    <div className="flex items-center gap-2">
                      {r.visit_mode === "home_visit" && (
                        <span className="font-semibold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full">
                          Home Visit
                        </span>
                      )}
                      <span className="font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
                        {formatReferralStatus(r.status)}
                      </span>
                    </div>
                  </div>
                  <p className="text-slate-500">{r.medical_issue}</p>
                  {r.assigned_slot_time && (
                    <p className="text-slate-500">
                      Slot: {formatSlotTime(r.assigned_slot_time, "Asia/Kolkata")}
                    </p>
                  )}
                  {r.status === "pending_review" && d.capacityNoteMap.get(r.id) && (
                    <p className="text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
                      {d.capacityNoteMap.get(r.id)}
                    </p>
                  )}
                  {(r.status === "pending_review" || r.status === "therapist_assigned") && (
                    <div className="pt-1">
                      <WithdrawReferralButton referralId={r.id} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>
    </HospitalDashboardShell>
  );
}
