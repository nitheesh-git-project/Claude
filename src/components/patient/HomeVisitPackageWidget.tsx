"use client";

import { useState } from "react";
import { computeHomeVisitCounts, daysUntilHomeVisitExpiry } from "@/lib/homeVisitProgress";
import HomeVisitDetailModal from "@/components/HomeVisitDetailModal";
import HomeVisitBulkScheduler from "@/components/HomeVisitBulkScheduler";

export type PatientHomeVisitCard = {
  id: string;
  purchaseCode: string | null;
  title: string;
  imageUrl: string | null;
  visitCount: number;
  visitsUsed: number;
  completedCount: number;
  scheduledCount: number;
  status: string;
  expiresAt: string | null;
  therapistName: string | null;
  paymentMode: string;
};

// The home-visit twin of PatientPackageWidget -- a card per programme
// showing visits remaining and a calendar to schedule more. Scheduling and
// the full history live in the two overlays this opens
// (HomeVisitBulkScheduler, HomeVisitDetailModal), same split as the online
// version.
export default function HomeVisitPackageWidget({
  purchases,
  bulkScheduleMax,
  expiryReminderDays,
}: {
  purchases: PatientHomeVisitCard[];
  bulkScheduleMax: number;
  expiryReminderDays: number;
}) {
  const [now] = useState(() => Date.now());
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const schedulingPurchase = purchases.find((p) => p.id === schedulingId) ?? null;
  const schedulingCounts = schedulingPurchase
    ? computeHomeVisitCounts({
        visitCount: schedulingPurchase.visitCount,
        visitsUsed: schedulingPurchase.visitsUsed,
        completedCount: schedulingPurchase.completedCount,
        scheduledCount: schedulingPurchase.scheduledCount,
      })
    : null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h2 className="font-bold text-lg text-slate-800 mb-4">Your Home Visit Packages</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {purchases.map((p) => {
          const counts = computeHomeVisitCounts({
            visitCount: p.visitCount,
            visitsUsed: p.visitsUsed,
            completedCount: p.completedCount,
            scheduledCount: p.scheduledCount,
          });
          const daysLeft = daysUntilHomeVisitExpiry(p.expiresAt, now);
          const progressPercent =
            p.visitCount > 0 ? Math.round(((counts.completed + counts.scheduled) / p.visitCount) * 100) : 0;

          return (
            <div key={p.id} className="overflow-hidden rounded-xl border border-slate-200">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt="" className="h-28 w-full object-cover" />
              ) : (
                <div className="flex h-28 w-full items-center justify-center bg-teal-50 text-teal-300">
                  <i className="fa-solid fa-house-medical text-3xl" />
                </div>
              )}
              <div className="space-y-2 p-4 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900">{p.title}</p>
                  <span className="shrink-0 capitalize text-[11px] font-semibold text-slate-400">{p.status}</span>
                </div>
                {p.purchaseCode && <p className="font-mono text-slate-400">{p.purchaseCode}</p>}

                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-teal-600" style={{ width: `${progressPercent}%` }} />
                </div>
                <p className="text-slate-500">
                  {counts.completed} completed · {counts.scheduled} scheduled · {counts.pending} pending
                </p>

                {p.therapistName && (
                  <p className="text-slate-500">
                    <i className="fa-solid fa-user-doctor mr-1.5 text-teal-600" />
                    {p.therapistName}
                  </p>
                )}
                {p.paymentMode === "cash_on_visit" && (
                  <p className="flex items-center gap-1.5 text-slate-500">
                    <i className="fa-solid fa-money-bill-wave text-teal-600" aria-hidden="true" />
                    Pay at the door
                  </p>
                )}
                {daysLeft !== null && p.status === "active" && (
                  daysLeft <= expiryReminderDays && counts.pending > 0 ? (
                    <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 font-semibold text-amber-800">
                      <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                      {daysLeft <= 0
                        ? "Expires today — schedule your remaining visits now"
                        : `Only ${daysLeft} day${daysLeft === 1 ? "" : "s"} left to use ${counts.pending} remaining visit${counts.pending === 1 ? "" : "s"}`}
                    </p>
                  ) : (
                    <p className="text-slate-400">{daysLeft} day{daysLeft === 1 ? "" : "s"} left</p>
                  )
                )}

                <div className="flex items-center gap-3 pt-2">
                  {counts.pending > 0 && p.status === "active" && (
                    <button
                      onClick={() => setSchedulingId(p.id)}
                      className="rounded-lg bg-teal-700 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-teal-800"
                    >
                      Schedule visits
                    </button>
                  )}
                  <button
                    onClick={() => setDetailId(p.id)}
                    className="text-[11px] font-semibold text-teal-700 hover:underline"
                  >
                    Manage
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {schedulingId && schedulingCounts && (
        <HomeVisitBulkScheduler
          purchaseId={schedulingId}
          pendingCount={schedulingCounts.pending}
          bulkScheduleMax={bulkScheduleMax}
          onClose={() => setSchedulingId(null)}
        />
      )}
      {detailId && <HomeVisitDetailModal purchaseId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
