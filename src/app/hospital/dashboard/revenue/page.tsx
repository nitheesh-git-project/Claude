import type { Metadata } from "next";
import HospitalDashboardShell from "@/components/hospital/HospitalDashboardShell";
import { loadHospitalDashboard } from "@/lib/hospitalDashboardData";
import SurfaceCard, { EmptyState } from "@/components/dashboard/SurfaceCard";
import JoinSessionButton from "@/components/JoinSessionButton";
import { formatSlotTime } from "@/lib/formatSlotTime";

export const metadata: Metadata = {
  title: "Earnings | Dr. Pooja's Physio",
};

const STATUS_STYLES: Record<string, string> = {
  requested: "text-amber-700 bg-amber-50",
  confirmed: "text-teal-700 bg-teal-50",
  completed: "text-slate-600 bg-slate-100",
  cancelled: "text-red-700 bg-red-50",
};

export default async function Page() {
  const d = await loadHospitalDashboard("revenue");

  return (
    <HospitalDashboardShell data={d} title="Earnings" subtitle="What the patients you referred have paid, and your share of it.">
      <SurfaceCard
        id="revenue"
        title="Earnings"
        icon="fa-chart-line"
        subtitle="What the patients you referred have paid, and your share of it."
        className="mt-6"
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-slate-500">Revenue Share</p>
            <p className="text-lg font-bold text-slate-900">{d.sharePercent}%</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-slate-500">Paid Sessions</p>
            <p className="text-lg font-bold text-slate-900">
              {d.paidSessions.length}
            </p>
          </div>
          <div className="bg-teal-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-slate-500">Your Cut</p>
            <p className="text-lg font-bold text-teal-700">
              ₹{d.hospitalCut.toFixed(2)}
            </p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-slate-500">Company&apos;s Cut</p>
            <p className="text-lg font-bold text-slate-900">
              ₹{d.companyCut.toFixed(2)}
            </p>
          </div>
        </div>

        {!d.referredSessions || d.referredSessions.length === 0 ? (
          <EmptyState
            icon="fa-calendar-check"
            title="No sessions yet"
            body="Once a patient you referred completes a paid session, it appears here with your share of it."
          />
        ) : (
          <ul className="space-y-2 text-xs">
            {d.referredSessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between flex-wrap gap-2 p-3 rounded-xl border border-slate-200"
              >
                <div>
                  <p className="font-bold text-slate-900">
                    {d.patientMap.get(s.patient_id)?.full_name ?? "Patient"}
                  </p>
                  <p className="text-slate-500">
                    {s.concern} — {formatSlotTime(s.slot_time, s.timezone)}
                    {s.session_code && (
                      <span className="ml-2 font-mono text-slate-400">{s.session_code}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`capitalize font-semibold px-3 py-1 rounded-full ${
                      STATUS_STYLES[s.status] ?? "text-slate-600 bg-slate-100"
                    }`}
                  >
                    {s.status}
                  </span>
                  <span
                    className={`font-semibold px-3 py-1 rounded-full ${
                      s.payment_status === "paid"
                        ? "text-green-700 bg-green-50"
                        : "text-slate-500 bg-slate-100"
                    }`}
                  >
                    {s.payment_status}
                  </span>
                  <JoinSessionButton
                    meetLink={s.meet_link}
                    slotTime={s.slot_time}
                    status={s.status}
                    durationMinutes={null}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SurfaceCard>
    </HospitalDashboardShell>
  );
}
