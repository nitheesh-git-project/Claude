import type { Metadata } from "next";
import HospitalDashboardShell from "@/components/hospital/HospitalDashboardShell";
import { loadHospitalDashboard } from "@/lib/hospitalDashboardData";
import SurfaceCard, { EmptyState } from "@/components/dashboard/SurfaceCard";
import { formatSlotTime } from "@/lib/formatSlotTime";

export const metadata: Metadata = {
  title: "Earnings | MoveRestore",
};

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function Page() {
  const d = await loadHospitalDashboard("revenue");

  return (
    <HospitalDashboardShell data={d} title="Earnings" subtitle="What the patients you referred have paid, and your share of it.">
      <SurfaceCard
        id="revenue"
        title="Earnings"
        icon="fa-chart-line"
        subtitle="Completed sessions for the patients you referred, and your share of each. A session keeps the rate that applied on the day it was delivered."
        className="mt-6"
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-slate-500">Your current rate</p>
            <p className="text-lg font-bold text-slate-900">{d.sharePercent}%</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            {/*
              "Sessions delivered", not "Paid Sessions". The figure counts
              completed sessions, because that is what a commission is earned
              on -- and the old word was wrong twice over: it included
              sessions paid for and not yet held, and excluded every session
              delivered on pay-later terms, which is never `paid`.
            */}
            <p className="text-[11px] text-slate-500">Sessions delivered</p>
            <p className="text-lg font-bold text-slate-900">
              {d.deliveredSessions.length}
            </p>
          </div>
          <div className="bg-teal-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-slate-500">Your share</p>
            <p className="text-lg font-bold text-teal-700">
              {formatRupees(Math.round(d.hospitalCut * 100))}
            </p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-[11px] text-slate-500">Clinic&apos;s share</p>
            <p className="text-lg font-bold text-slate-900">
              {formatRupees(Math.round(d.companyCut * 100))}
            </p>
          </div>
        </div>

        {d.deliveredSessions.length === 0 ? (
          <EmptyState
            icon="fa-calendar-check"
            title="No sessions yet"
            body="Once a patient you referred completes a session, it appears here with your share of it."
          />
        ) : (
          // Completed sessions only, and never a way into the session
          // itself: a consultation is private to the patient and their
          // therapist, so a partner sees what was delivered and what it
          // earned them -- not the call link, not what is coming up.
          <ul className="space-y-2 text-xs">
            {d.deliveredSessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between flex-wrap gap-2 p-3 rounded-xl border border-slate-200"
              >
                <div>
                  <p className="font-bold text-slate-900">
                    {d.patientMap.get(s.patientId)?.full_name ?? "Patient"}
                  </p>
                  <p className="text-slate-500">
                    {s.slotTime ? formatSlotTime(s.slotTime, s.timezone) : "Date not recorded"}
                    {s.sessionCode && (
                      <span className="ml-2 font-mono text-slate-500">{s.sessionCode}</span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-teal-700">{formatRupees(s.partnerCutPaise)}</p>
                  <p className="text-slate-500">
                    {s.sharePercent === null
                      ? "Rate not recorded"
                      : `${s.sharePercent}% of ${formatRupees(s.netPaise)}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SurfaceCard>
    </HospitalDashboardShell>
  );
}
