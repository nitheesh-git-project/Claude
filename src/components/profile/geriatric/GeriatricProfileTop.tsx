import FallRiskDial from "@/components/profile/geriatric/FallRiskDial";
import FallsCheckFlow from "@/components/profile/geriatric/FallsCheckFlow";
import { DailyLivingCard, HomeSafetyCard, OrthostaticCard, SteadiTestCards } from "@/components/profile/geriatric/GeriatricPanels";
import DiaryPanel from "@/components/profile/neuro/DiaryPanel";
import KeyNumbers from "@/components/profile/progress/KeyNumbers";
import ProfileHeader from "@/components/profile/progress/ProfileHeader";
import ProfileProgressSection from "@/components/profile/progress/ProfileProgressSection";
import RecordTestButton, { type RecordSetup } from "@/components/profile/progress/RecordTestButton";
import ProfileStatusControls from "@/components/profile/progress/ProfileStatusControls";
import { chairStandNorm } from "@/lib/clinicalCalculators";
import { formatClinicDate } from "@/lib/formatDateTime";
import type { GeriatricView } from "@/lib/geriatricProfile";
import { steadiCards } from "@/lib/steadiCards";
import type { Voice } from "@/lib/progressView";

/** The three lines the graph draws: the tests with a number that moves. */
const GRAPH_KEYS = ["gait_speed_4m", "tug", "chair_stand_30s"] as const;

/**
 * The Strength and balance care Health Profile ("Geriatric" to the
 * clinician) top to bottom, shared by the patient's page, the therapist's
 * chart and the admin's (the neurological page's NeuroProfileTop, for this
 * condition type): header (name, age and condition line, the carer line, the
 * status pill, the phase bar) -> where things stand -> four key numbers ->
 * the condition picture (the fall-risk dial with the rule that decided it,
 * the four STEADI test cards, daily living, the home safety check, the
 * standing blood pressure) -> the fall diary -> the graph, the plan's steps
 * and the measures table.
 *
 * There is no examination layer: every figure is a recorded measurement, the
 * intake or the diary. Controls the viewer's route would refuse are absent:
 * `canSetStatus`, `record` (the falls check, height and weight, the home
 * safety check, any test), `planner`, `reopen`, `canLogDiary` (the patient),
 * `canConfirmDiary` (the assigned therapist; an admin reads the diary only).
 */
export default function GeriatricProfileTop({
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
  view: GeriatricView;
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
    ? { patientId, patientName, profileKind: view.kind, series: view.series, enabledLicensed, licenceUnreadable, asAdmin: record.asAdmin }
    : null;
  const cards = steadiCards({ tests: view.fallRisk.tests, points: view.points, ageYears: view.person.ageYears, sex: view.person.sex, voice, formatDate: formatClinicDate });
  const norm = view.person.ageYears !== null && view.person.sex ? chairStandNorm(view.person.ageYears, view.person.sex) : null;
  const riskOverrides = norm
    ? { chair_stand_30s: { value: norm.belowAverageUnder, label: `Below average for age and sex: under ${norm.belowAverageUnder} stands (CDC STEADI)` } }
    : undefined;
  const graphSeries = view.graphSeries.filter((s) => (GRAPH_KEYS as readonly string[]).includes(s.measureKey));
  const conditionLine = [view.conditionLine, view.ageLine].filter(Boolean).join(" · ") || null;

  return (
    <div className="space-y-5" data-testid="geriatric-profile" data-profile-kind={view.kind}>
      <ProfileHeader
        voice={voice}
        profileKind={view.kind}
        name={patientName}
        conditionLine={conditionLine}
        chipLabel={chipLabel}
        provenance={provenance}
        carerLine={view.carerLine}
        notes={view.notes}
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

      <section aria-label="Condition picture" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" data-testid="geriatric-picture">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-slate-900">{clinician ? "Fall risk and the four STEADI tests" : "How steady and strong you are"}</h2>
            <p className="mt-0.5 text-sm text-slate-700">
              {clinician
                ? "The level is STEADI's, with the rule that decided it. The tests are measured by you; the falls are from the intake and the confirmed diary."
                : "Four short tests of balance, strength and walking, and the falls you have told us about."}
            </p>
          </div>
          {setup && (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <FallsCheckFlow setup={setup} walkingAid={view.walkingAid} />
              <RecordTestButton setup={setup} measureKey="height_cm" label="Height or weight" icon="fa-ruler" locked={false} />
            </div>
          )}
        </div>

        {view.measuresFailed && (
          <p role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {clinician ? "We couldn't load the recorded tests just now, so the cards below may be missing readings." : "We couldn't load your test results just now, so some may be missing below."} They are not empty - please try again in a moment.
          </p>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
          <FallRiskDial
            risk={view.fallRisk}
            text={view.fallRiskText}
            voice={voice}
            unreadableNote={
              view.fallRisk.diaryUnreadable
                ? clinician
                  ? "The diary could not be read, so this level is worked out without it."
                  : "We couldn't read your diary just now, so this was worked out without it."
                : null
            }
          />
          <SteadiTestCards cards={cards} voice={voice} />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <DailyLivingCard katz={view.katz} voice={voice} />
          <HomeSafetyCard view={view.homeSafety} voice={voice} record={setup} />
          <OrthostaticCard flag={view.orthostatic} voice={voice} record={setup} />
        </div>
      </section>

      <DiaryPanel
        voice={voice}
        profileKind={view.kind}
        diary={view.diary}
        bars={[]}
        triggers={[]}
        canLog={canLogDiary}
        canConfirm={canConfirmDiary}
        heading={{ clinician: "Falls and near misses", patient: "Your falls diary" }}
      />

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
        riskOverrides={riskOverrides}
        title={{ patient: "Are you getting steadier?", clinician: "Progress" }}
      />
    </div>
  );
}
