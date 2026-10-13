"use client";

import { useState } from "react";
import { computePackageCounts, patientExpiryNotice } from "@/lib/packageProgress";
import PackageDetailModal from "@/components/packages/PackageDetailModal";
import PackageBulkScheduler from "@/components/packages/PackageBulkScheduler";
import ProgrammeCover from "@/components/packages/ProgrammeCover";
import type { ProgrammeCoverImage } from "@/lib/programmeDisplay";

export type PatientPackageCard = {
  id: string;
  purchaseCode: string | null;
  title: string;
  /** The programme's photo (its condition's, for a recommended course) -
   *  src/lib/programmeDisplay.ts. */
  cover: ProgrammeCoverImage | null;
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
  // Admin-configured (Settings -> Programmes) -- the programme's expiry is
  // said only inside this many days of it, and only while something is left
  // to book (patientExpiryNotice). Before that the card shows no clock at
  // all: the owner's call, since "N days left" from the day of payment reads
  // as a race the patient never agreed to.
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
          const expiryNotice =
            p.status === "active"
              ? patientExpiryNotice(p.expiresAt, counts.pending, now, expiryReminderDays)
              : null;
          const progressPercent =
            p.sessionCount > 0 ? Math.round(((counts.completed + counts.scheduled) / p.sessionCount) * 100) : 0;

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
