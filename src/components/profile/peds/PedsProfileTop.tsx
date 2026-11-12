import PedsPicture from "@/components/profile/peds/PedsPicture";
import KeyNumbers from "@/components/profile/progress/KeyNumbers";
import ProfileHeader from "@/components/profile/progress/ProfileHeader";
import ProfileProgressSection from "@/components/profile/progress/ProfileProgressSection";
import ProfileStatusControls from "@/components/profile/progress/ProfileStatusControls";
import type { PedsView } from "@/lib/pedsProfileView";
import { PEDS_PROFILE_KIND } from "@/lib/pedsProfile";
import type { Voice } from "@/lib/progressView";
import { picks, type WidgetPick } from "@/lib/profileWidgets";
import type { ReactNode } from "react";
import type { ClinicPhoneRead } from "@/components/profile/CallClinicLine";

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
  only,
  liveSession,
  testId,
  hiddenGraphKeys,
  headerExtra,
  clinicPhone,
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
  /** The widgets this rendering draws (profileWidgets.ts); every one when
   *  left out. A page draws the profile in slices, or whole. */
  only?: WidgetPick;
  /** The assigned therapist's started video session (B11), for "Record a test". */
  liveSession?: { href: string; patientName: string } | null;
  /** The root's test id; null for none (a page that wraps its slices in its
   *  own root). Left out: the kind's id on the slice with the status. */
  testId?: string | null;
  /** Graph lines the clinic hides from the patient's page. */
  hiddenGraphKeys?: readonly string[];
  /** Inside the status card (the patient's page). */
  headerExtra?: ReactNode;
  /** The patient's page: the clinic's phone for the calm next step. */
  clinicPhone?: ClinicPhoneRead | null;
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
  const show = (key: string) => picks(only, key);
  const progressParts = { graph: show("progress_graph"), steps: show("steps"), measures: show("measures_table") };

  return (
    <div
      className="space-y-5"
      data-testid={testId !== undefined ? (testId ?? undefined) : show("status_header") ? "peds-profile" : undefined}
      data-profile-kind={PEDS_PROFILE_KIND}
    >
      {show("status_header") && (
      <ProfileHeader
        extra={headerExtra}
        clinicPhone={clinicPhone}
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
      )}

      {show("key_numbers") && (
      <KeyNumbers
        series={view.series}
        tiles={view.keyTiles}
        profileKind={PEDS_PROFILE_KIND}
        voice={voice}
        subject="child"
      />
      )}

      {show("milestone_chart") && (
      <PedsPicture
        voice={voice}
        exam={ex}
        checklist={view.checklist}
        dobImplausible={view.dobImplausible}
        record={examRecord}
      />
      )}

      {(progressParts.graph || progressParts.steps || progressParts.measures) && (
      <ProfileProgressSection
        parts={progressParts}
        liveSession={liveSession}
        hiddenGraphKeys={hiddenGraphKeys}
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
      )}
    </div>
  );
}
