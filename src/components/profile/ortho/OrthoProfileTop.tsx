import OrthoHeader from "@/components/profile/ortho/OrthoHeader";
import OrthoBodyMap from "@/components/profile/ortho/OrthoBodyMap";
import OrthoProgressSection from "@/components/profile/ortho/OrthoProgressSection";
import CareStatusControls from "@/components/profile/ortho/CareStatusControls";
import KeyNumbers from "@/components/profile/progress/KeyNumbers";
import type { AreaPainEntry } from "@/lib/conditionIntake";
import type { OrthoView } from "@/lib/orthoProfileView";
import type { PainAssessmentRow, QuestionOverrideRow } from "@/lib/painMap";
import type { Voice } from "@/lib/progressView";

/**
 * The orthopaedic Health Profile, top to bottom, shared by the patient's
 * page, the therapist's chart and the admin's: header (name, condition, status
 * pill, phase bar) -> where things stand -> four key numbers -> body map with
 * the per-area cards and the knee and strength visuals -> the graph -> the
 * plan's steps -> the measures table.
 *
 * The page keeps everything else it already had (the condition record, test
 * reports, care plan history, banners and gates) and places it around this.
 * What each viewer may do is passed in as data: `canSetStatus`, `record`,
 * `planner` and `reopen` are null/false for a viewer whose route would refuse,
 * so the control is absent, not disabled. `examRecord` is the Pain Map's own
 * "Record an exam" door and is untouched by any of this.
 */
export default function OrthoProfileTop({
  voice,
  patientId,
  patientName,
  conditionLine,
  chipLabel,
  view,
  assessments,
  areaPain,
  examRecord,
  canSetStatus,
  record,
  planner,
  reopen,
  enabledLicensed,
  licenceUnreadable,
}: {
  voice: Voice;
  patientId: string;
  patientName: string;
  conditionLine: string | null;
  chipLabel: string;
  view: OrthoView;
  assessments: PainAssessmentRow[];
  areaPain: AreaPainEntry[];
  examRecord?: { endpoint: string; patientId: string; overridesByRegion: Record<string, QuestionOverrideRow[]> };
  /** The phase and status controls: the endpoint to post to, or null for a viewer who has none. */
  canSetStatus: { endpoint: string } | null;
  record: { asAdmin: boolean } | null;
  planner: boolean;
  reopen: boolean;
  enabledLicensed: readonly string[];
  licenceUnreadable: boolean;
}) {
  return (
    <div className="space-y-5" data-testid="ortho-profile">
      <OrthoHeader
        voice={voice}
        name={patientName}
        conditionLine={conditionLine}
        chipLabel={chipLabel}
        computed={view.computed}
        override={view.override}
        phase={view.phase}
        phaseIsInferred={view.phaseIsInferred}
        statusFailed={view.statusFailed}
        stand={view.stand}
        lastReviewAt={view.lastReviewAt}
        controls={
          canSetStatus && !view.statusFailed ? (
            <CareStatusControls
              patientId={patientId}
              profileKind="ortho"
              currentPhase={view.phase}
              phaseIsInferred={view.phaseIsInferred}
              override={view.override ? { status: view.override.status, reason: view.override.reason, setAt: view.override.setAt } : null}
              overrideStale={view.override?.stale ?? false}
              summary={view.stand.source === "written" ? { text: view.stand.text, setAt: view.stand.setAt } : null}
              summaryDraft={view.stand.draft}
              endpoint={canSetStatus.endpoint}
            />
          ) : canSetStatus ? (
            <p role="status" className="text-xs text-amber-900">
              {"We couldn't read the phase and status history just now, so they can't be changed from here. Reload to try again."}
            </p>
          ) : undefined
        }
      />

      {view.measuresFailed && view.series.length === 0 ? null : (
        <KeyNumbers series={view.series} milestones={view.views.map((v) => v.milestone)} profileKind="ortho" voice={voice} />
      )}

      <OrthoBodyMap
        voice={voice}
        assessments={assessments}
        areaPain={areaPain}
        areas={view.areas}
        kneeBend={view.kneeBend}
        legStrength={view.legStrength}
        straightening={view.straightening}
        measuresFailed={view.measuresFailed}
        record={examRecord}
      />

      <OrthoProgressSection
        patientId={patientId}
        patientName={patientName}
        voice={voice}
        series={view.series}
        recordedSeries={view.recordedSeries}
        tableRows={view.tableRows}
        goal={view.goal}
        views={view.views}
        points={view.points}
        measuresFailed={view.measuresFailed}
        goalsFailed={view.goalsFailed}
        enabledLicensed={enabledLicensed}
        licenceUnreadable={licenceUnreadable}
        record={record}
        planner={planner}
        reopen={reopen}
      />
    </div>
  );
}
