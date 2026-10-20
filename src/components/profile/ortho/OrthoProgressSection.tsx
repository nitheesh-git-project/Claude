"use client";

import { useState } from "react";
import ProgressGraph from "@/components/profile/progress/ProgressGraph";
import MilestoneCards from "@/components/profile/progress/MilestoneCards";
import MeasuresTable from "@/components/profile/progress/MeasuresTable";
import RecordTestDialog from "@/components/profile/progress/RecordTestDialog";
import GoalMilestonePlanner from "@/components/profile/progress/GoalMilestonePlanner";
import TutorialInfoButton from "@/components/tutorial/TutorialInfoButton";
import type { CareGoal, MilestoneView } from "@/lib/careGoals";
import type { MeasureSeries, MeasureTableRow, MeasurementPoint } from "@/lib/outcomeSeries";
import type { Voice } from "@/lib/progressView";

const CARD = "min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6";
const ACTION =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2";

/**
 * The progress half of the orthopaedic profile: the graph ("Are you getting
 * better?"), the plan's steps, and the first / now / goal table.
 *
 * Who may do what is decided by the page and passed in, so a control the
 * viewer's route would refuse is absent rather than disabled:
 *  - `record`   - "Record a test" (the assigned therapist, or an admin whose
 *                 scope reaches People, `asAdmin`); a patient has none.
 *  - `planner`  - the goal and steps editor (the assigned therapist only).
 *  - `reopen`   - the admin's reopen of a milestone marked reached by mistake.
 *
 * Each read degrades its own card: unreadable measurements draw a notice
 * (keeping the Pain Map line if there is one), unreadable goals draw the
 * steps card's own notice. Neither is worded as "nothing recorded".
 */
export default function OrthoProgressSection({
  patientId,
  patientName,
  voice,
  series,
  recordedSeries,
  tableRows,
  goal,
  views,
  points,
  measuresFailed,
  goalsFailed,
  enabledLicensed,
  licenceUnreadable,
  record,
  planner,
  reopen,
}: {
  patientId: string;
  patientName?: string;
  voice: Voice;
  series: MeasureSeries[];
  recordedSeries: MeasureSeries[];
  tableRows: MeasureTableRow[];
  goal: CareGoal | null;
  views: MilestoneView[];
  points: MeasurementPoint[];
  measuresFailed: boolean;
  goalsFailed: boolean;
  enabledLicensed: readonly string[];
  licenceUnreadable: boolean;
  record: { asAdmin: boolean } | null;
  planner: boolean;
  reopen: boolean;
}) {
  const clinician = voice === "clinician";
  const [recording, setRecording] = useState(false);
  const [planning, setPlanning] = useState(false);
  const targets = views.map((v) => v.milestone);
  // The Pain Map line is not a measurement: it survives a failed measurement read.
  const painOnly = series.filter((s) => s.measureKey === "pain_nprs");
  const graphSeries = measuresFailed ? painOnly : series;

  return (
    <>
      <section aria-label="Progress" className={CARD}>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
              {clinician ? "Progress" : "Are you getting better?"}
              <TutorialInfoButton section="card:health-profile" label="your progress" size="sm" />
            </h2>
            <p className="mt-0.5 text-sm text-slate-700">One dot per review. The green band is where we are aiming.</p>
          </div>
          {(record || planner) && (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row print:hidden">
              {record && (
                <button type="button" onClick={() => setRecording(true)} className={`${ACTION} bg-teal-700 text-white hover:bg-teal-800`}>
                  <i aria-hidden className="fa-solid fa-ruler text-xs" />
                  Record a test
                </button>
              )}
              {planner && (
                <button
                  type="button"
                  onClick={() => setPlanning(true)}
                  className={`${ACTION} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}
                >
                  <i aria-hidden className="fa-solid fa-bullseye text-xs" />
                  Goal and steps
                </button>
              )}
            </div>
          )}
        </div>
        {measuresFailed && painOnly.length > 0 && (
          <p role="status" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {"We couldn't load the movement, strength and score readings just now."} Only the Pain Map line is drawn. They are not missing - please try again in a moment.
          </p>
        )}
        <ProgressGraph
          series={graphSeries}
          milestones={targets}
          profileKind="ortho"
          voice={voice}
          loadFailed={measuresFailed && painOnly.length === 0}
        />
      </section>

      <section aria-label="Steps" className={CARD}>
        <MilestoneCards
          goal={goal}
          views={views}
          voice={voice}
          measurements={points}
          loadFailed={goalsFailed}
          reopen={reopen ? { patientId } : undefined}
        />
      </section>

      <section aria-label="Measures" className={CARD}>
        <div className="mb-3">
          <h2 className="font-display text-lg font-bold text-slate-900">{clinician ? "Measures" : "Your measures"}</h2>
          <p className="mt-0.5 text-sm text-slate-700">First reading, latest reading and goal for each.</p>
        </div>
        {measuresFailed && tableRows.length === 0 ? (
          <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {"We couldn't load the measures just now."} They are not missing - please try again in a moment.
          </p>
        ) : (
          <MeasuresTable rows={tableRows} voice={voice} />
        )}
      </section>

      {recording && record && (
        <RecordTestDialog
          patientId={patientId}
          patientName={patientName}
          profileKind="ortho"
          series={recordedSeries}
          enabledLicensed={enabledLicensed}
          licenceUnreadable={licenceUnreadable}
          asAdmin={record.asAdmin}
          onClose={() => setRecording(false)}
        />
      )}
      {planning && planner && (
        <GoalMilestonePlanner
          patientId={patientId}
          patientName={patientName}
          profileKind="ortho"
          goal={goal}
          views={views}
          measurements={points}
          enabledLicensed={enabledLicensed}
          licenceUnreadable={licenceUnreadable}
          onClose={() => setPlanning(false)}
        />
      )}
    </>
  );
}
