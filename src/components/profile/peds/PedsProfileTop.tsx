import PedsPicture from "@/components/profile/peds/PedsPicture";
import KeyNumbers from "@/components/profile/progress/KeyNumbers";
import ProfileHeader from "@/components/profile/progress/ProfileHeader";
import ProfileProgressSection from "@/components/profile/progress/ProfileProgressSection";
import ProfileStatusControls from "@/components/profile/progress/ProfileStatusControls";
import type { PedsView } from "@/lib/pedsProfileView";
import { PEDS_PROFILE_KIND } from "@/lib/pedsProfile";
import type { Voice } from "@/lib/progressView";

/**
 * The paediatric Health Profile top to bottom, shared by the parent's page,
 * the therapist's chart and the admin's (the neurological page's
 * NeuroProfileTop, for the other condition type): header (the child's name,
 * the concern, the age line - chronological and corrected - the status pill,
 * the phase bar, who told us, the equipment chips) -> where things stand ->
 * four key numbers -> the milestone chart with the checklist -> the graph ->
 * the plan's steps -> the measures table.
 *
 * The page keeps everything else it already had (the condition record, test
 * reports, care plan history) and places it around this. What each viewer may
 * do is passed in as data and is null/false for a viewer whose route would
 * refuse, so a control is absent, not disabled.
 */
export default function PedsProfileTop({
  voice,
  patientId,
  patientName,
  chipLabel,
  view,
  equipmentChips,
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
  chipLabel: string;
  view: PedsView;
  /** What the intake says the child wears or uses, as short chips. */
  equipmentChips: string[];
  examRecord?: { endpoint: string; patientId: string; patientName?: string };
  canSetStatus: { endpoint: string } | null;
  record: { asAdmin: boolean } | null;
  planner: boolean;
  reopen: boolean;
  enabledLicensed: readonly string[];
  licenceUnreadable: boolean;
}) {
  const clinician = voice === "clinician";
  const ex = view.exam;
  const notes: string[] = [];
  if (view.examsFailed) {
    notes.push(
      clinician
        ? "We couldn't read the examinations, so the milestone figures are missing. The status is worked out without them."
        : "We couldn't read your child's examination just now, so this may not show everything.",
    );
  }
  const conditionLine =
    [view.conditionLine, ex.ageLine].filter(Boolean).join(" · ") || null;

  return (
    <div
      className="space-y-5"
      data-testid="peds-profile"
      data-profile-kind={PEDS_PROFILE_KIND}
    >
      <ProfileHeader
        voice={voice}
        subject="child"
        profileKind={PEDS_PROFILE_KIND}
        name={patientName}
        conditionLine={conditionLine}
        chipLabel={chipLabel}
        extraChips={equipmentChips}
        provenance={ex.provenance}
        notes={notes}
        computed={view.computed}
        override={view.override}
        phase={view.phase}
        phaseIsInferred={view.phaseIsInferred}
        statusFailed={view.statusFailed}
        stand={view.stand}
        lastReviewAt={view.lastReviewAt}
        controls={
          canSetStatus && (
            <ProfileStatusControls
              patientId={patientId}
              profileKind={PEDS_PROFILE_KIND}
              canSetStatus={canSetStatus}
              statusFailed={view.statusFailed}
              phase={view.phase}
              phaseIsInferred={view.phaseIsInferred}
              override={view.override}
              stand={view.stand}
            />
          )
        }
      />

      <KeyNumbers
        series={view.series}
        tiles={view.keyTiles}
        profileKind={PEDS_PROFILE_KIND}
        voice={voice}
        subject="child"
      />

      <PedsPicture
        voice={voice}
        exam={ex}
        checklist={view.checklist}
        dobImplausible={view.dobImplausible}
        record={examRecord}
      />

      <ProfileProgressSection
        profileKind={PEDS_PROFILE_KIND}
        survivingKeys={["peds_milestones_achieved"]}
        survivingName="the milestone line"
        graphSeries={view.series}
        notice={
          view.examsFailed
            ? clinician
              ? "We couldn't load the examinations just now, so the milestones line is missing. It is not empty - please try again in a moment."
              : "We couldn't load your child's examinations just now, so the milestones line is missing. Nothing is lost - please try again in a moment."
            : null
        }
        patientId={patientId}
        patientName={patientName}
        voice={voice}
        subject="child"
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
