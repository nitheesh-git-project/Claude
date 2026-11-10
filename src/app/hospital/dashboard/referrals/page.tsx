import Link from "next/link";
import ReferralsList from "@/components/hospital/ReferralsList";
import type { Metadata } from "next";
import HospitalDashboardShell from "@/components/hospital/HospitalDashboardShell";
import { loadHospitalDashboard } from "@/lib/hospitalDashboardData";
import SurfaceCard, { EmptyState } from "@/components/dashboard/SurfaceCard";
import WithdrawReferralButton from "@/components/hospital/WithdrawReferralButton";
import { formatSlotTime } from "@/lib/formatSlotTime";
import { formatClinicDateShort } from "@/lib/formatDateTime";
import {
  formatReferralStatus,
  isReferralAccepted,
  isReferralWithClinic,
} from "@/lib/referralStatus";

// A link from the Overview ("Accepted") opens the list already narrowed.
const SHOW_VIEWS: Record<string, { label: string; match: (status: string) => boolean }> = {
  accepted: { label: "Accepted", match: isReferralAccepted },
  with_clinic: { label: "Waiting on the clinic", match: isReferralWithClinic },
};

export const metadata: Metadata = {
  title: "Your Referrals | MoveRestore",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ show?: string | string[] }>;
}) {
  const d = await loadHospitalDashboard("referrals");
  const { show } = await searchParams;
  const view = typeof show === "string" ? SHOW_VIEWS[show] : undefined;
  const referrals = (d.referrals ?? []).filter((r) => (view ? view.match(r.status) : true));

  return (
    <HospitalDashboardShell data={d} title="Your Referrals" subtitle="Everyone you've sent, and where each one stands.">
        <SurfaceCard
          id="referrals"
          title="Referral status"
          info="card:referral-status"
          icon="fa-list-check"
        >
          {!d.referrals || d.referrals.length === 0 ? (
            <EmptyState
              icon="fa-hospital-user"
              title="No referrals yet"
              body="Send your first patient across and it appears here with its status."
            />
          ) : (
            <>
            {view && (
              <p className="mb-4 text-sm text-slate-600">
                Showing: <strong>{view.label}</strong> ({referrals.length}).{" "}
                <Link href="/hospital/dashboard/referrals" className="font-semibold text-blue-700 underline">
                  Show all referrals
                </Link>
              </p>
            )}
            <ReferralsList
              showChips={!view}
              filters={[
                { key: "pending_review", label: "Waiting on the clinic" },
                { key: "therapist_assigned", label: "Therapist assigned" },
                { key: "invite_sent", label: "Registration link sent" },
                { key: "converted", label: "Registered" },
                { key: "declined", label: "Declined" },
                { key: "withdrawn", label: "Withdrawn" },
              ]}
              items={referrals.map((r) => ({
                id: r.id,
                name: r.patient_name,
                group: r.status,
                node: (
                <div className="p-4 rounded-xl border border-slate-200 text-xs space-y-1">
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
                  <p className="text-slate-500">
                    Sent {formatClinicDateShort(r.created_at)}
                    {d.closedAtMap.get(r.id) &&
                      ` · updated ${formatClinicDateShort(d.closedAtMap.get(r.id))}`}
                  </p>
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
                  {/*
                    A declined referral used to be one word and nothing else,
                    so the partner who sent the patient could not tell a
                    wrong-specialty referral from a capacity problem that
                    would pass -- and kept sending the same ones. The reason
                    is now required of the admin who declines, and this is
                    where it is read. Rendered only when there is one:
                    referrals declined before the reason existed carry none,
                    and a heading over an empty box is a label on an absence.
                  */}
                  {r.status === "declined" && d.declineReasonMap.get(r.id) && (
                    <div className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-rose-800">
                      <span className="block font-semibold">Why this was declined</span>
                      <span className="block">{d.declineReasonMap.get(r.id)}</span>
                    </div>
                  )}
                  {(r.status === "pending_review" || r.status === "therapist_assigned") && (
                    <div className="pt-1">
                      <WithdrawReferralButton referralId={r.id} />
                    </div>
                  )}
                </div>
                ),
              }))}
            />
            </>
          )}
        </SurfaceCard>
    </HospitalDashboardShell>
  );
}
