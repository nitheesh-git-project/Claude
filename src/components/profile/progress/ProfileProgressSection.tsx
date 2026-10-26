"use client";

import type { ProfileSubject } from "@/lib/childVoice";
import { useState } from "react";
import ProgressGraph from "@/components/profile/progress/ProgressGraph";
import MilestoneCards from "@/components/profile/progress/MilestoneCards";
import MeasuresTable from "@/components/profile/progress/MeasuresTable";
import RecordTestDialog from "@/components/profile/progress/RecordTestDialog";
import GoalMilestonePlanner from "@/components/profile/progress/GoalMilestonePlanner";
import TutorialInfoButton from "@/components/tutorial/TutorialInfoButton";
import type { CareGoal, MilestoneView } from "@/lib/careGoals";
import type { MeasureSeries, MeasureTableRow, MeasurementPoint } from "@/lib/outcomeSeries";
import type { ProfileKind } from "@/lib/outcomeMeasures";
import type { Voice } from "@/lib/progressView";
import type { ReactNode } from "react";
import type { OxygenStopLimit } from "@/lib/cardioSafety";
import type { SixMinuteWalkEquationRead } from "@/lib/sixMinuteWalkEquation";

const CARD = "min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6";
const ACTION =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2";

/**
 * The progress half of a Health Profile (orthopaedic or neurological): the
 * graph ("Are you getting better?"), the plan's steps, and the first / now /
 * goal table.
 *
 * Who may do what is decided by the page and passed in, so a control the
 * viewer's route would refuse is absent rather than disabled:
 *  - `record`   - "Record a test" (the assigned therapist, or an admin whose
 *                 scope reaches People, `asAdmin`); a patient has none.
 *  - `planner`  - the goal and steps editor (the assigned therapist only).
 *  - `reopen`   - the admin's reopen of a milestone marked reached by mistake.
 *
 * Each read degrades its own card: unreadable measurements draw a notice
 * (keeping the lines that come from another store - the Pain Map's, or the
 * examination's and the diary's - `survivingKeys`), unreadable goals draw the
 * steps card's own notice. Neither is worded as "nothing recorded".
 */
export default function ProfileProgressSection({
  profileKind,
  survivingKeys,
  survivingName,
  graphSeries,
  notice,
  patientId,
  patientName,
  voice,
  subject = "self",
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
  riskOverrides,
  title,
  recordExtras,
  stepsExtra,
}: {
  profileKind: ProfileKind;
  /** Measure keys whose lines come from a store other than the recorded
   *  measurements, so they survive that read failing. */
  survivingKeys?: readonly string[];
  /** What those lines are called in the failure note ("the Pain Map line"). */
  survivingName?: string;
  /** The lines the graph draws, when they are fewer than `series` (the stage
   *  is a card, not a line); the table and the key numbers use all of them. */
  graphSeries?: MeasureSeries[];
  /** A read behind the graph that failed apart from the measurements (the
   *  examination), said above it so a missing line is not read as none yet. */
  notice?: string | null;
  patientId: string;
  patientName?: string;
  voice: Voice;
  /** Who the patient-voice sentences are about (childVoice.ts): "child" speaks to a parent ("your child's ..."). */
  subject?: ProfileSubject;
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
  /** A person-specific risk line for a measure, by key (ProgressGraph). */
  riskOverrides?: Record<string, { value: number; label: string }>;
  /** The patient's heading for the graph ("Are you getting steadier?"). */
  title?: { patient: string; clinician?: string };
  /** A card that sits with the plan's steps but is not one of them (the
   *  surgeon's precautions end date, on the heart and lung page). */
  stepsExtra?: ReactNode;
  /** What the six-minute walk in Record a test needs (heart and lung). */
  recordExtras?: {
    patient: { sex?: "female" | "male" | null; ageYears?: number | null; heightCm?: number | null; weightKg?: number | null };
    walkEquation: SixMinuteWalkEquationRead;
    oxygenLimit: OxygenStopLimit;
  };
}) {
  const clinician = voice === "clinician";
  const [recording, setRecording] = useState(false);
  const [planning, setPlanning] = useState(false);
  const targets = views.map((v) => v.milestone);
  // A line from another store (the Pain Map, the examination, the diary) is not
  // a measurement: it survives a failed measurement read.
  const surviving = survivingKeys ?? ["pain_nprs"];
  const painOnly = (graphSeries ?? series).filter((s) => surviving.includes(s.measureKey));
  const drawn = measuresFailed ? painOnly : (graphSeries ?? series);

  return (
    <>
      <section aria-label="Progress" className={CARD}>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
              {clinician ? (title?.clinician ?? "Progress") : title ? title.patient : profileKind === "neuro_parkinsons" ? "Is it holding, or getting better?" : subject === "child"
                  ? "Is your child getting better?"
                  : "Are you getting better?"}
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
        {notice && (
          <p role="status" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {notice}
          </p>
        )}
        {measuresFailed && painOnly.length > 0 && (
          <p role="status" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {profileKind === "ortho" ? "We couldn't load the movement, strength and score readings just now." : "We couldn't load the recorded test readings just now."} Only {survivingName ?? "the Pain Map line"} {survivingName ? "are" : "is"} drawn. They are not missing - please try again in a moment.
          </p>
        )}
        <ProgressGraph
          series={drawn}
          milestones={targets}
          profileKind={profileKind}
          voice={voice}
          subject={subject}
          loadFailed={measuresFailed && painOnly.length === 0}
          riskOverrides={riskOverrides}
        />
      </section>

      <section aria-label="Steps" className={CARD}>
        <MilestoneCards
          goal={goal}
          views={views}
          voice={voice}
          subject={subject}
          measurements={points}
          loadFailed={goalsFailed}
          reopen={reopen ? { patientId } : undefined}
          onSetGoal={planner ? () => setPlanning(true) : undefined}
        />
        {stepsExtra}
      </section>

      <section aria-label="Measures" className={CARD}>
        <div className="mb-3">
          <h2 className="font-display text-lg font-bold text-slate-900">{clinician ? "Measures" : subject === "child" ? "Your child's measures" : "Your measures"}</h2>
          <p className="mt-0.5 text-sm text-slate-700">First reading, latest reading and goal for each.</p>
        </div>
        {measuresFailed && tableRows.length === 0 ? (
          <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {"We couldn't load the measures just now."} They are not missing - please try again in a moment.
          </p>
        ) : (
          <MeasuresTable rows={tableRows} voice={voice} subject={subject} />
        )}
      </section>

      {recording && record && (
        <RecordTestDialog
          patientId={patientId}
          patientName={patientName}
          profileKind={profileKind}
          series={recordedSeries}
          enabledLicensed={enabledLicensed}
          licenceUnreadable={licenceUnreadable}
          asAdmin={record.asAdmin}
          patient={recordExtras?.patient}
          walkEquation={recordExtras?.walkEquation}
          oxygenLimit={recordExtras?.oxygenLimit}
          onClose={() => setRecording(false)}
        />
      )}
      {planning && planner && (
        <GoalMilestonePlanner
          patientId={patientId}
          patientName={patientName}
          profileKind={profileKind}
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
