"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import TherapistPayoutButton from "@/components/admin/TherapistPayoutButton";
import { formatSlotTime } from "@/lib/formatSlotTime";
import {
  computeTherapistPayoutSummary,
  type PayoutAppointment,
} from "@/lib/therapistPayouts";

type Therapist = {
  id: string;
  full_name: string | null;
  revenue_share_percent: number | null;
  home_visit_revenue_share_percent?: number | null;
};
type Patient = { id: string; full_name: string | null };
type Category = { id: string; title: string };

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function RatingStars({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-slate-400">Not rated</span>;
  return (
    <span className="text-amber-500">
      {"★".repeat(rating)}
      <span className="text-slate-300">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

function TherapistSessionList({
  therapistId,
  appointments,
  patients,
  categories,
}: {
  therapistId: string;
  appointments: PayoutAppointment[];
  patients: Patient[];
  categories: Category[];
}) {
  const patientMap = new Map(patients.map((p) => [p.id, p]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const completed = appointments
    .filter((a) => a.therapist_id === therapistId && a.status === "completed")
    .sort((a, b) => new Date(b.slot_time ?? 0).getTime() - new Date(a.slot_time ?? 0).getTime());

  if (completed.length === 0) {
    return <p className="text-xs text-slate-500 py-4 text-center">No completed sessions yet.</p>;
  }

  return (
    <ul className="space-y-2.5">
      {completed.map((a) => {
        const patient = patientMap.get(a.patient_id);
        const category = a.category_id ? categoryMap.get(a.category_id) : null;
        const isPaidByPatient = a.payment_status === "paid";
        const isSettled = !!a.therapist_payout_paid_at;
        return (
          <li key={a.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-1.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              {a.patient_id ? (
                <Link
                  href={`/admin/dashboard/patients/${a.patient_id}`}
                  className="font-bold text-slate-900 hover:text-teal-700 hover:underline transition"
                >
                  {patient?.full_name ?? "Unknown patient"}
                </Link>
              ) : (
                <strong className="text-slate-900">Unknown patient</strong>
              )}
              {!isPaidByPatient ? (
                <span className="font-semibold text-slate-500 bg-slate-200 px-2.5 py-1 rounded-full">
                  Patient hasn&apos;t paid
                </span>
              ) : isSettled ? (
                <span className="font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                  Paid Out
                </span>
              ) : (
                <span className="font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                  Not Paid Yet
                </span>
              )}
            </div>
            <p className="text-slate-500">
              {category?.title ?? "Uncategorized"} — {formatSlotTime(a.slot_time, null)}
            </p>
            <div className="flex items-center gap-4 text-slate-500">
              <span>
                Patient rated: <RatingStars rating={a.patient_rating} />
              </span>
            </div>
            {a.patient_feedback && (
              <p className="text-slate-500 italic">&quot;{a.patient_feedback}&quot;</p>
            )}
            {isPaidByPatient && a.therapist_payout_amount_paise !== null && (
              <p className="text-slate-500">
                {isSettled ? "Paid to therapist: " : "Owed to therapist: "}
                <strong className="text-teal-700">{formatInr(a.therapist_payout_amount_paise)}</strong>
                {isSettled && a.therapist_payout_method && <> via {a.therapist_payout_method}</>}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function AdminPayoutsTab({
  therapists,
  appointments,
  patients,
  categories,
  nowMs,
}: {
  therapists: Therapist[];
  appointments: PayoutAppointment[];
  patients: Patient[];
  categories: Category[];
  nowMs: number;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = therapists
    .map((t) => {
      const theirAppointments = appointments.filter((a) => a.therapist_id === t.id);
      const summary = computeTherapistPayoutSummary(
        t.id,
        t.revenue_share_percent,
        theirAppointments,
        nowMs,
        t.home_visit_revenue_share_percent ?? null
      );
      return { therapist: t, summary };
    })
    // Therapists who actually need a transfer float to the top -- ranked by
    // net, not gross, since that's the whole point of this tab (find who
    // needs paying right now) and a therapist sitting on enough cash to
    // cover what they're owed doesn't need one.
    .sort((a, b) => b.summary.netOwedPaise - a.summary.netOwedPaise);

  const totalOwedPaise = rows.reduce((sum, r) => sum + r.summary.owedPaise, 0);
  const totalCashHeldPaise = rows.reduce((sum, r) => sum + r.summary.cashHeldPaise, 0);
  const totalNetPayablePaise = rows.reduce((sum, r) => sum + r.summary.netOwedPaise, 0);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h2 className="font-bold text-lg text-slate-800">Therapist Payouts</h2>
          <p className="text-xs text-slate-500">
            Owed: <strong className="text-slate-700">{formatInr(totalOwedPaise)}</strong>
            {totalCashHeldPaise > 0 && (
              <>
                {" "}
                · Cash held: <strong className="text-amber-700">{formatInr(totalCashHeldPaise)}</strong>
              </>
            )}
            {" "}
            · Net payable: <strong className="text-teal-700">{formatInr(totalNetPayablePaise)}</strong>
          </p>
        </div>
        <p className="text-[11px] text-slate-400 mb-4">
          All-time, not date-filtered — a payout balance can&apos;t depend on which dates happen
          to be in view. Revenue/cut count a session once it&apos;s paid; cut and profit only once
          it&apos;s completed too, matching how payouts are actually settled. Net payable is what
          owed subtracts any cash a therapist is currently holding from home-visit collections —
          that&apos;s the figure the Pay button actually transfers.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-200">
                <th className="pb-2 pr-3 font-semibold">Therapist</th>
                <th className="pb-2 pr-3 font-semibold text-right">Completed</th>
                <th className="pb-2 pr-3 font-semibold text-right">Upcoming</th>
                <th className="pb-2 pr-3 font-semibold text-right">Revenue</th>
                <th className="pb-2 pr-3 font-semibold text-right">Therapist&apos;s Cut</th>
                <th className="pb-2 pr-3 font-semibold text-right">Profit</th>
                <th className="pb-2 pr-3 font-semibold">Status</th>
                <th className="pb-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ therapist, summary }) => {
                const isExpanded = expandedId === therapist.id;
                const shareUnset = summary.sharePercent === null;
                return (
                  <Fragment key={therapist.id}>
                    <tr className="border-b border-slate-100">
                      <td className="py-2.5 pr-3">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : therapist.id)}
                          className="font-bold text-slate-900 hover:text-teal-700 hover:underline transition text-left"
                        >
                          {therapist.full_name ?? "Unknown"}
                        </button>
                      </td>
                      <td className="py-2.5 pr-3 text-right text-slate-700">{summary.completedCount}</td>
                      <td className="py-2.5 pr-3 text-right text-slate-700">{summary.upcomingCount}</td>
                      <td className="py-2.5 pr-3 text-right text-slate-700">{formatInr(summary.revenuePaise)}</td>
                      <td className="py-2.5 pr-3 text-right text-slate-700">
                        {shareUnset ? "—" : formatInr(summary.cutPaise)}
                      </td>
                      <td className="py-2.5 pr-3 text-right text-slate-700">
                        {shareUnset ? "—" : formatInr(summary.profitPaise)}
                      </td>
                      <td className="py-2.5 pr-3">
                        {shareUnset ? (
                          <span className="font-semibold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                            No share set
                          </span>
                        ) : summary.owedPaise <= 0 ? (
                          <span className="font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                            Paid
                          </span>
                        ) : summary.cashHeldPaise > 0 ? (
                          <span className="font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                            {formatInr(summary.netOwedPaise)} net
                            <span className="font-normal text-amber-600">
                              {" "}
                              ({formatInr(summary.owedPaise)} owed − {formatInr(summary.cashHeldPaise)}{" "}
                              held)
                            </span>
                          </span>
                        ) : (
                          <span className="font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                            {formatInr(summary.owedPaise)} owed
                          </span>
                        )}
                      </td>
                      <td className="py-2.5">
                        {shareUnset ? (
                          <Link
                            href={`/admin/dashboard/therapists/${therapist.id}`}
                            className="text-teal-700 font-semibold hover:underline"
                          >
                            Set % first
                          </Link>
                        ) : (
                          <TherapistPayoutButton
                            therapistId={therapist.id}
                            owedPaise={summary.owedPaise}
                            cashHeldPaise={summary.cashHeldPaise}
                          />
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${therapist.id}-detail`}>
                        <td colSpan={8} className="pb-4 pt-1">
                          <TherapistSessionList
                            therapistId={therapist.id}
                            appointments={appointments}
                            patients={patients}
                            categories={categories}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <p className="text-xs text-slate-500 py-6 text-center">No therapists yet.</p>
        )}
      </div>
    </div>
  );
}
