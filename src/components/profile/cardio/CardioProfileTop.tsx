import ActiveMinutesPanel from "@/components/profile/cardio/ActiveMinutesPanel";
import {
  BreathlessnessGradeCard,
  EffortCard,
  OxygenCard,
  PrecautionsStep,
  SafetyLimitsRow,
  StopBox,
  VitalsStrip,
  WalkTrackCard,
} from "@/components/profile/cardio/CardioPanels";
import PreSessionCheckCard from "@/components/profile/cardio/PreSessionCheckCard";
import KeyNumbers from "@/components/profile/progress/KeyNumbers";
import ProfileHeader from "@/components/profile/progress/ProfileHeader";
import ProfileProgressSection from "@/components/profile/progress/ProfileProgressSection";
import ProfileStatusControls from "@/components/profile/progress/ProfileStatusControls";
import RecordTestButton, { type RecordSetup } from "@/components/profile/progress/RecordTestButton";
import type { CardioView } from "@/lib/cardioProfile";
import type { Voice } from "@/lib/progressView";

/** The three lines the graph draws. */
const GRAPH_KEYS = ["six_minute_walk", "breathlessness_nrs", "resting_heart_rate"] as const;

/**
 * The Heart and lung rehabilitation Health Profile ("Cardiopulmonary" to the
 * clinician) top to bottom, shared by the patient's page, the therapist's
 * chart and the admin's: header (name, condition and age line, the safety
 * limits row, the status pill, the phase bar) -> where things stand -> four
 * key numbers -> the condition picture (the six-minute walk, the oxygen bar
 * with the patient's own limit, how hard to work, the vitals strip, the
 * breathlessness grade, the stop-and-tell box; for the physiotherapist the
 * pre-session safety check) -> active minutes from the diary -> the graph,
 * the plan's steps and the measures table.
 *
 * No examination layer: every figure is a recorded measurement, the intake
 * or the diary. Nothing here is a diagnosis. Controls the viewer's route
 * would refuse are absent: `canSetStatus`, `record` (the guided walk, the
 * safety check, any test), `planner`, `reopen`, `canLogDiary` (the
 * patient), `canConfirmDiary` (the assigned therapist).
 */
export default function CardioProfileTop({
  voice,
  patientId,
  patientName,
  chipLabel,
  provenance,
  view,
  canSetStatus,
  record,
  planner,
  reopen,
  canLogDiary,
  canConfirmDiary,
  enabledLicensed,
  licenceUnreadable,
}: {
  voice: Voice;
  patientId: string;
  patientName: string;
  chipLabel: string;
  provenance: string | null;
  view: CardioView;
  canSetStatus: { endpoint: string } | null;
  record: { asAdmin: boolean } | null;
  planner: boolean;
  reopen: boolean;
  canLogDiary: boolean;
  canConfirmDiary: boolean;
  enabledLicensed: readonly string[];
  licenceUnreadable: boolean;
}) {
  const clinician = voice === "clinician";
  const setup: RecordSetup | null = record
    ? {
        patientId,
        patientName,
        profileKind: view.kind,
        series: view.series,
        enabledLicensed,
        licenceUnreadable,
        asAdmin: record.asAdmin,
        patient: view.patientFacts,
        walkEquation: view.equation,
        oxygenLimit: view.limit,
      }
    : null;
  const graphSeries = view.graphSeries.filter((s) => (GRAPH_KEYS as readonly string[]).includes(s.measureKey));
  const conditionLine = [view.conditionLine, view.ageLine].filter(Boolean).join(" · ") || null;
  // A flagged reading at the latest review, said to the patient gently.
  const flaggedAtReview = view.statusInput.redFlag === true && view.vitalsCheck.status === "stop";

  return (
    <div className="space-y-5" data-testid="cardio-profile" data-profile-kind={view.kind}>
      <ProfileHeader
        voice={voice}
        profileKind={view.kind}
        name={patientName}
        conditionLine={conditionLine}
        chipLabel={chipLabel}
        provenance={provenance}
        notes={view.notes}
        safetyRow={<SafetyLimitsRow view={view} voice={voice} />}
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

      <KeyNumbers series={view.series} tiles={view.keyTiles} profileKind={view.kind} voice={voice} />

      <section aria-label="Condition picture" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" data-testid="cardio-picture">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-slate-900">{clinician ? "Heart and lungs" : "Your heart and lungs today"}</h2>
            <p className="mt-0.5 text-sm text-slate-700">
              {clinician
                ? "From the six-minute walk and the vitals at the latest reviews. Limits are this patient's own."
                : "From your six-minute walk and your readings at your latest reviews."}
            </p>
          </div>
          {setup && (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
              <RecordTestButton setup={setup} measureKey="height_cm" label="Height or weight" icon="fa-ruler" locked={false} />
              <RecordTestButton setup={setup} measureKey="max_hr_bpm" label="Highest heart rate" icon="fa-heart-pulse" />
            </div>
          )}
        </div>

        {view.measuresFailed && (
          <p role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {clinician ? "We couldn't load the recorded tests just now, so the cards below may be missing readings." : "We couldn't load your results just now, so some may be missing below."} They are not empty - please try again in a moment.
          </p>
        )}

        {flaggedAtReview && (
          <p role="status" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950" data-testid="flagged-at-review">
            {clinician
              ? `A reading at the latest review was outside the limits for exercise. ${view.vitalsCheck.refusal?.clinician ?? ""}`
              : `${view.vitalsCheck.refusal?.patient ?? ""} ${view.vitalsCheck.flags.map((f) => f.patientText).join(" ")}`.trim()}
          </p>
        )}

        {clinician && (
          <div className="mb-4">
            <PreSessionCheckCard view={view} setup={setup} />
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <WalkTrackCard view={view} voice={voice} />
          <OxygenCard view={view} voice={voice} />
          <EffortCard view={view} voice={voice} />
          <VitalsStrip view={view} voice={voice} />
          <BreathlessnessGradeCard view={view} voice={voice} />
          <StopBox view={view} voice={voice} />
        </div>
      </section>

      <ActiveMinutesPanel voice={voice} view={view} canLog={canLogDiary} canConfirm={canConfirmDiary} />

      <ProfileProgressSection
        profileKind={view.kind}
        survivingKeys={[]}
        graphSeries={graphSeries}
        patientId={patientId}
        patientName={patientName}
        voice={voice}
        series={view.series}
        recordedSeries={view.series}
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
        title={{ patient: "Is your fitness coming back?", clinician: "Progress" }}
        recordExtras={{ patient: view.patientFacts, walkEquation: view.equation, oxygenLimit: view.limit }}
        stepsExtra={<PrecautionsStep view={view} voice={voice} />}
      />
    </div>
  );
}
