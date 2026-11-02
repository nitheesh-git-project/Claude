import DiaryPanel from "@/components/profile/neuro/DiaryPanel";
import NeuroPicture from "@/components/profile/neuro/NeuroPicture";
import { StageCard, SymptomProfilePanel } from "@/components/profile/neuro/ParkinsonsPanels";
import KeyNumbers from "@/components/profile/progress/KeyNumbers";
import ProfileHeader from "@/components/profile/progress/ProfileHeader";
import ProfileProgressSection from "@/components/profile/progress/ProfileProgressSection";
import ProfileStatusControls from "@/components/profile/progress/ProfileStatusControls";
import { examOwnedKeys } from "@/lib/neuroProfile";
import type { NeuroView } from "@/lib/neuroProfileView";
import type { NeuroAssessmentRow } from "@/lib/neuroExam";
import type { Voice } from "@/lib/progressView";
import { picks, type WidgetPick } from "@/lib/profileWidgets";
import type { ReactNode } from "react";
import type { ClinicPhoneRead } from "@/components/profile/CallClinicLine";

/**
 * The neurological Health Profile - and the Parkinson's sub-profile, which is
 * the same page with its own parts switched on - top to bottom, shared by the
 * patient's page, the therapist's chart and the admin's (the orthopaedic page's
 * OrthoProfileTop, for the other condition type): header (name, condition
 * line, condition group, "Tested in ON time", status pill, phase bar, "filled
 * in with ...") -> where things stand -> four key numbers -> the condition
 * picture (the neurological examination with a First exam / Latest switch,
 * the affected side, the walking ladder and speed zones) -> [Parkinson's: the
 * symptom profile and the stage] -> the diary (with the freezing chart on
 * Parkinson's) -> the graph -> the plan's steps -> the measures table.
 *
 * The page keeps everything else it already had (the condition record, test
 * reports, care plan history, banners, the "Record a neurological
 * examination" button and the Done gate) and places it around this. What each
 * viewer may do is passed in as data and is null/false for a viewer whose
 * route would refuse, so the control is absent, not disabled: `canSetStatus`,
 * `record`, `planner`, `reopen`, `canLogDiary` (the patient), `canConfirmDiary`
 * (the assigned therapist - an admin reads the diary and nothing more).
 */
export default function NeuroProfileTop({
  voice,
  patientId,
  patientName,
  chipLabel,
  provenance,
  view,
  neuroAssessments,
  examRecord,
  canSetStatus,
  record,
  planner,
  reopen,
  canLogDiary,
  canConfirmDiary,
  canCorrectDiary = false,
  enabledLicensed,
  licenceUnreadable,
  only,
  testId,
  hiddenGraphKeys,
  headerExtra,
  clinicPhone,
}: {
  voice: Voice;
  patientId: string;
  patientName: string;
  chipLabel: string;
  /** "Filled in with your physiotherapist", or null when not known. */
  provenance: string | null;
  view: NeuroView;
  neuroAssessments: NeuroAssessmentRow[];
  examRecord?: { endpoint: string; patientId: string; patientName?: string };
  canSetStatus: { endpoint: string } | null;
  record: { asAdmin: boolean } | null;
  planner: boolean;
  reopen: boolean;
  canLogDiary: boolean;
  canConfirmDiary: boolean;
  /** The patient's own page: "I saved this by mistake" on their diary entries. */
  canCorrectDiary?: boolean;
  enabledLicensed: readonly string[];
  licenceUnreadable: boolean;
  /** The widgets this rendering draws (profileWidgets.ts); every one when
   *  left out. A page draws the profile in slices, or whole. */
  only?: WidgetPick;
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
  const pd = view.parkinsons;
  const clinician = voice === "clinician";
  const extraChips = [view.subtype && pd ? view.subtype : null, pd?.onTimeChip ?? null].filter((c): c is string => !!c);
  const notes: string[] = [];
  if (view.diary.status === "unreadable") {
    notes.push(
      clinician
        ? "We couldn't read the diary, so a new fall could not be checked and the status is worked out without it."
        : "We couldn't read your diary just now, so a new fall could not be checked. Your physiotherapist's view still stands."
    );
  }
  if (view.examsFailed) {
    notes.push(
      clinician
        ? "We couldn't read the examinations, so the status is worked out without them."
        : "We couldn't read your examination just now, so this may not show everything."
    );
  }
  const surviving = [...examOwnedKeys(view.kind), ...(pd ? ["freezing_episodes"] : [])];
  const show = (key: string) => picks(only, key);
  const progressParts = { graph: show("progress_graph"), steps: show("steps"), measures: show("measures_table") };
  const showSymptoms = !!pd && show("parkinsons_symptoms") && !!(pd.symptoms || pd.stage);

  return (
    <div className="space-y-5" data-testid={testId !== undefined ? (testId ?? undefined) : show("status_header") ? "neuro-profile" : undefined} data-profile-kind={view.kind}>
      {show("status_header") && (
      <ProfileHeader
        extra={headerExtra}
        clinicPhone={clinicPhone}
        voice={voice}
        profileKind={view.kind}
        name={patientName}
        conditionLine={view.conditionLine}
        chipLabel={chipLabel}
        extraChips={extraChips}
        provenance={provenance}
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
              profileKind={view.kind}
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

      {show("key_numbers") && <KeyNumbers series={view.series} tiles={view.keyTiles} profileKind={view.kind} voice={voice} />}

      {show("exam_picture") && (
      <NeuroPicture
        voice={voice}
        assessments={neuroAssessments}
        examsFailed={view.examsFailed}
        affected={view.affected}
        affectedLabel={view.affectedLabel}
        ladder={view.ladder}
        speed={view.speed}
        record={examRecord}
      />
      )}

      {pd && showSymptoms && (
        <div className={`grid gap-5 ${pd.symptoms && pd.stage ? "md:grid-cols-2 md:items-start" : ""}`}>
          {pd.symptoms && <SymptomProfilePanel profile={pd.symptoms} voice={voice} />}
          {pd.stage && <StageCard stage={pd.stage} voice={voice} />}
        </div>
      )}

      {(show("diary") || (pd && show("freezing_chart"))) && (
      <DiaryPanel
        list={show("diary")}
        showFreezing={!!pd && show("freezing_chart")}
        voice={voice}
        profileKind={view.kind}
        diary={view.diary}
        bars={pd?.bars ?? []}
        triggers={pd?.triggers ?? []}
        canLog={canLogDiary}
        canConfirm={canConfirmDiary}
        canCorrect={canCorrectDiary}
      />
      )}

      {(progressParts.graph || progressParts.steps || progressParts.measures) && (
      <ProfileProgressSection
        parts={progressParts}
        hiddenGraphKeys={hiddenGraphKeys}
        profileKind={view.kind}
        survivingKeys={surviving}
        survivingName="the examination and diary lines"
        graphSeries={view.graphSeries}
        notice={
          view.examsFailed
            ? clinician
              ? "We couldn't load the examinations just now, so the balance, walking-speed and Up-and-Go lines taken from them are missing. They are not empty - please try again in a moment."
              : "We couldn't load your examinations just now, so some lines are missing. Nothing is lost - please try again in a moment."
            : null
        }
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
      )}
    </div>
  );
}
