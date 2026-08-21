"use client";

import { useState } from "react";
import PainMapView from "@/components/profile/PainMapView";
import PainExamDialog from "@/components/profile/PainExamDialog";
import PainComparisonView from "@/components/profile/PainComparisonView";
import RegionStandingsList from "@/components/profile/RegionStandingsList";
import type { AreaPainEntry } from "@/lib/conditionIntake";
import type { PainAssessmentRow, QuestionOverrideRow } from "@/lib/painMap";

/**
 * One body-map surface instead of the two stacked ones this used to be.
 * The exam view and the you-vs-exam comparison were separate cards
 * showing the same figure twice, which read as two different body maps
 * with no way to tell what distinguished them; they're one card with a
 * switch, and the comparison only offers itself once the patient has
 * actually marked areas of their own to compare against.
 *
 * Shared by the patient's Health Profile, the therapist's patient view,
 * and the admin's condition detail, so all three read the same map.
 *
 * When the viewer may record exams (`record` present) this is also where
 * that starts. It used to be a second body map stacked under this one with
 * twenty form fields between them — the exact "two stacked cards showing the
 * same figure twice" this component exists to prevent, reintroduced inside a
 * single card. Recording now happens in a dialog over this one map.
 */
export default function PainMapExplorer({
  assessments,
  areaPain,
  showStandings = true,
  record,
}: {
  assessments: PainAssessmentRow[];
  areaPain: AreaPainEntry[];
  /** The ranked exam list under the figure. Off where the surrounding
   *  page already lists the same numbers (the admin's condition detail). */
  showStandings?: boolean;
  /** Present only for a viewer allowed to write exam findings. Absent for
   *  the patient, and for a therapist whose edit access hasn't been
   *  approved yet — in both cases this stays a read-only chart. */
  record?: {
    endpoint: string;
    patientId: string;
    overridesByRegion: Record<string, QuestionOverrideRow[]>;
  };
}) {
  const canCompare = areaPain.length > 0;
  const [mode, setMode] = useState<"exam" | "compare">("exam");
  const [recording, setRecording] = useState(false);
  const active = canCompare ? mode : "exam";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      {canCompare ? (
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          {(
            [
              ["exam", "Therapist's exam"],
              ["compare", "Yours vs the exam"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={active === key}
              onClick={() => setMode(key)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                active === key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : (
        <span />
      )}

      {record && (
        <button
          type="button"
          onClick={() => setRecording(true)}
          className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-800"
        >
          <i className="fa-solid fa-notes-medical mr-1.5" />
          Record an exam
        </button>
      )}
      </div>

      {active === "compare" ? (
        <PainComparisonView assessments={assessments} areaPain={areaPain} />
      ) : (
        <PainMapView assessments={assessments} />
      )}

      {showStandings && active === "exam" && (
        <div className="mt-6 border-t border-slate-100 pt-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Every area examined, worst first
          </p>
          <RegionStandingsList assessments={assessments} />
        </div>
      )}

      {recording && record && (
        <PainExamDialog
          endpoint={record.endpoint}
          patientId={record.patientId}
          assessments={assessments}
          overridesByRegion={record.overridesByRegion}
          onClose={() => setRecording(false)}
        />
      )}
    </div>
  );
}
