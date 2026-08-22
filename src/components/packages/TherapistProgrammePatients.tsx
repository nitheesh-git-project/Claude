"use client";

import { useState } from "react";
import { computePackageCounts } from "@/lib/packageProgress";
import PackageDetailModal from "@/components/packages/PackageDetailModal";
import SuggestSessionControl, {
  type PendingSuggestion,
} from "@/components/packages/SuggestSessionControl";

export type ProgrammePatientRow = {
  id: string;
  purchaseCode: string | null;
  patientName: string;
  patientCode: string | null;
  packageTitle: string;
  sessionCount: number;
  sessionsUsed: number;
  completedCount: number;
  scheduledCount: number;
  status: string;
  /** The one suggestion still waiting on this patient, if any. */
  pendingSuggestion?: PendingSuggestion | null;
};

// The arc-of-care view the plan asked for: a therapist locked to a
// package sees the whole programme for that patient in one place, not a
// pile of disconnected session cards they have to mentally group
// themselves. Tapping a row opens the same PackageDetailModal every other
// package surface uses, in therapist mode (no money shown -- see
// /api/packages/purchase-detail).
export default function TherapistProgrammePatients({
  purchases,
  suggestionsEnabled = false,
  leadTimeHours = 12,
}: {
  purchases: ProgrammePatientRow[];
  // Off unless the admin has switched suggestions on. Presentation only --
  // /api/therapist/suggest-session refuses regardless of what renders here.
  suggestionsEnabled?: boolean;
  leadTimeHours?: number;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (purchases.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-slate-500">
        No programme patients locked to you yet — this fills in once you&apos;re assigned the first
        session of a package purchase.
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-3">
        {purchases.map((p) => {
          const counts = computePackageCounts({
            sessionCount: p.sessionCount,
            sessionsUsed: p.sessionsUsed,
            completedCount: p.completedCount,
            scheduledCount: p.scheduledCount,
          });
          return (
            <li key={p.id}>
              <button
                onClick={() => setOpenId(p.id)}
                className="w-full rounded-xl border border-slate-200 p-4 text-left text-xs transition hover:border-teal-300"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="font-bold text-slate-900">
                      {p.patientName}
                      {p.patientCode && <span className="ml-1.5 font-mono font-normal text-slate-400">{p.patientCode}</span>}
                    </p>
                    <p className="mt-1 text-slate-500">
                      {p.packageTitle} {p.purchaseCode && <span className="font-mono text-slate-400">· {p.purchaseCode}</span>}
                    </p>
                  </div>
                  <span className="shrink-0 capitalize font-semibold text-slate-400">{p.status}</span>
                </div>
                <p className="mt-2 text-slate-500">
                  {counts.completed} completed · {counts.scheduled} scheduled · {counts.pending} pending
                </p>
              </button>
              {suggestionsEnabled && p.status === "active" && (
                <SuggestSessionControl
                  purchaseId={p.id}
                  patientName={p.patientName}
                  sessionsRemaining={Math.max(0, p.sessionCount - p.sessionsUsed)}
                  leadTimeHours={leadTimeHours}
                  pending={p.pendingSuggestion ?? null}
                />
              )}
            </li>
          );
        })}
      </ul>
      {openId && <PackageDetailModal purchaseId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
