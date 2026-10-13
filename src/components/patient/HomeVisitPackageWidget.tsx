"use client";

import { useState } from "react";
import { computeHomeVisitCounts } from "@/lib/homeVisitProgress";
import { patientExpiryNotice } from "@/lib/packageProgress";
import HomeVisitDetailModal from "@/components/HomeVisitDetailModal";
import HomeVisitBulkScheduler from "@/components/HomeVisitBulkScheduler";
import ProgrammeCover from "@/components/packages/ProgrammeCover";
import type { ProgrammeCoverImage } from "@/lib/programmeDisplay";

export type PatientHomeVisitCard = {
  id: string;
  purchaseCode: string | null;
  title: string;
  /** The programme's photo (its condition's, for a recommended course) -
   *  src/lib/programmeDisplay.ts. */
  cover: ProgrammeCoverImage | null;
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
  leadTimeHours,
}: {
  purchases: PatientHomeVisitCard[];
  bulkScheduleMax: number;
  expiryReminderDays: number;
  leadTimeHours: number;
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
      <h2 className="font-display font-bold text-lg text-slate-800 mb-4">Your Home Visit Packages</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {purchases.map((p) => {
          const counts = computeHomeVisitCounts({
            visitCount: p.visitCount,
            visitsUsed: p.visitsUsed,
            completedCount: p.completedCount,
            scheduledCount: p.scheduledCount,
          });
          // Said only near the end, as a date -- see PatientPackageWidget.
          const expiryNotice =
            p.status === "active"
              ? patientExpiryNotice(p.expiresAt, counts.pending, now, expiryReminderDays, "visit")
              : null;
          const progressPercent =
            p.visitCount > 0 ? Math.round(((counts.completed + counts.scheduled) / p.visitCount) * 100) : 0;

          return (
            <div key={p.id} className="overflow-hidden rounded-xl border border-slate-200">
              {/* Shown whole rather than cropped into a strip (ProgrammeCover),
                  and the same photo the recommendation carried. */}
              <ProgrammeCover
                src={p.cover?.src}
                focalX={p.cover?.focalX}
                focalY={p.cover?.focalY}
                className="h-40"
                testId="programme-cover"
              />
              <div className="space-y-2 p-4 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900">{p.title}</p>
                  <span className="shrink-0 capitalize text-[11px] font-semibold text-slate-500">{p.status}</span>
                </div>
                {p.purchaseCode && <p className="font-mono text-slate-500">{p.purchaseCode}</p>}

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
                {expiryNotice && (
                  <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 font-semibold text-amber-800">
                    <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                    {expiryNotice}
                  </p>
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
          leadTimeHours={leadTimeHours}
          onClose={() => setSchedulingId(null)}
        />
      )}
      {detailId && <HomeVisitDetailModal purchaseId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
