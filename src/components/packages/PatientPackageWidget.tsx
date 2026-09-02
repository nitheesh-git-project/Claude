"use client";

import { useState } from "react";
import { computePackageCounts, daysUntilExpiry } from "@/lib/packageProgress";
import PackageDetailModal from "@/components/packages/PackageDetailModal";
import PackageBulkScheduler from "@/components/packages/PackageBulkScheduler";

export type PatientPackageCard = {
  id: string;
  purchaseCode: string | null;
  title: string;
  imageUrl: string | null;
  sessionCount: number;
  sessionsUsed: number;
  completedCount: number;
  scheduledCount: number;
  status: string;
  expiresAt: string | null;
  therapistName: string | null;
  /** What the clinician recommended, and the programme's own scheduling
   *  rules. The scheduler proposes a run of dates from these rather than
   *  opening on an empty calendar. */
  frequencyPerWeek: number | null;
  minGapHours: number | null;
  maxPerWeek: number | null;
};

// The widget the user asked for: a card per package showing how many
// sessions are left and a calendar to schedule more, replacing the old
// one-session-at-a-time BookWithPackageForm. Scheduling and the full
// completed/upcoming/pending history live in the two overlays this opens
// (PackageBulkScheduler, PackageDetailModal) rather than inline here, so
// the card itself stays scannable across several owned packages at once.
export default function PatientPackageWidget({
  purchases,
  bulkScheduleMax,
  expiryReminderDays,
}: {
  purchases: PatientPackageCard[];
  bulkScheduleMax: number;
  // Admin-configured (Session Manager → Settings) -- a purchase this close
  // to expires_at gets a highlighted warning instead of the plain "N days
  // left" line, so it's visible without opening the detail modal.
  expiryReminderDays: number;
}) {
  const [now] = useState(() => Date.now());
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const schedulingPurchase = purchases.find((p) => p.id === schedulingId) ?? null;
  const schedulingCounts = schedulingPurchase
    ? computePackageCounts({
        sessionCount: schedulingPurchase.sessionCount,
        sessionsUsed: schedulingPurchase.sessionsUsed,
        completedCount: schedulingPurchase.completedCount,
        scheduledCount: schedulingPurchase.scheduledCount,
      })
    : null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h2 className="font-display font-bold text-lg text-slate-800 mb-4">Your programmes</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {purchases.map((p) => {
          const counts = computePackageCounts({
            sessionCount: p.sessionCount,
            sessionsUsed: p.sessionsUsed,
            completedCount: p.completedCount,
            scheduledCount: p.scheduledCount,
          });
          const daysLeft = daysUntilExpiry(p.expiresAt, now);
          const progressPercent =
            p.sessionCount > 0 ? Math.round(((counts.completed + counts.scheduled) / p.sessionCount) * 100) : 0;

          return (
            <div key={p.id} className="overflow-hidden rounded-xl border border-slate-200">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt="" className="h-28 w-full object-cover" />
              ) : (
                <div className="flex h-28 w-full items-center justify-center bg-teal-50 text-teal-300">
                  <i className="fa-solid fa-layer-group text-3xl" />
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
                {daysLeft !== null && p.status === "active" && (
                  daysLeft <= expiryReminderDays && counts.pending > 0 ? (
                    <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 font-semibold text-amber-800">
                      <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                      {daysLeft <= 0
                        ? "Expires today — schedule your remaining sessions now"
                        : `Only ${daysLeft} day${daysLeft === 1 ? "" : "s"} left to use ${counts.pending} remaining session${counts.pending === 1 ? "" : "s"}`}
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
                      Schedule sessions
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
        <PackageBulkScheduler
          purchaseId={schedulingId}
          pendingCount={schedulingCounts.pending}
          bulkScheduleMax={bulkScheduleMax}
          frequencyPerWeek={schedulingPurchase?.frequencyPerWeek ?? null}
          minGapHours={schedulingPurchase?.minGapHours ?? null}
          maxPerWeek={schedulingPurchase?.maxPerWeek ?? null}
          expiresAt={schedulingPurchase?.expiresAt ?? null}
          onClose={() => setSchedulingId(null)}
        />
      )}
      {detailId && <PackageDetailModal purchaseId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
