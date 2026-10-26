"use client";

import { useMemo } from "react";
import FallRiskDial from "@/components/profile/geriatric/FallRiskDial";
import { DailyLivingCard, SteadiTestCards } from "@/components/profile/geriatric/GeriatricPanels";
import { PictureCard, SampleProgress, type SampleProps } from "@/components/marketing/healthProfile/SampleParts";
import { chairStandNorm } from "@/lib/clinicalCalculators";
import { formatClinicDate } from "@/lib/formatDateTime";
import { sampleGeriatric } from "@/lib/healthProfileSamples";
import { steadiCards } from "@/lib/steadiCards";

/** The three lines the real graph draws: the tests with a number that moves. */
const GRAPH_KEYS = ["gait_speed_4m", "tug", "chair_stand_30s"];

/** The Strength and balance care sample: the fall-risk dial with the rule
 *  that decided it, the four test cards and daily living, then the graph and
 *  the milestone cards. */
export default function GeriatricSample({ showPicture }: SampleProps) {
  const { view } = useMemo(() => sampleGeriatric(), []);
  const cards = useMemo(
    () =>
      steadiCards({
        tests: view.fallRisk.tests,
        points: view.points,
        ageYears: view.person.ageYears,
        sex: view.person.sex,
        voice: "patient",
        formatDate: formatClinicDate,
      }),
    [view]
  );
  const norm = view.person.ageYears !== null && view.person.sex ? chairStandNorm(view.person.ageYears, view.person.sex) : null;
  const riskOverrides = norm
    ? { chair_stand_30s: { value: norm.belowAverageUnder, label: `Below average for age and sex: under ${norm.belowAverageUnder} stands (CDC STEADI)` } }
    : undefined;
  return (
    <div className="space-y-4">
      {showPicture && (
        <PictureCard title="How steady and strong you are" lede="Four short tests of balance, strength and walking, and the falls you have told us about.">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
            <FallRiskDial risk={view.fallRisk} text={view.fallRiskText} voice="patient" />
            <SteadiTestCards cards={cards} voice="patient" />
          </div>
          <div className="mt-4 max-w-md">
            <DailyLivingCard katz={view.katz} voice="patient" />
          </div>
        </PictureCard>
      )}
      <SampleProgress
        profileKind="geriatric"
        title="Are you getting steadier?"
        series={view.graphSeries.filter((s) => GRAPH_KEYS.includes(s.measureKey))}
        goal={view.goal}
        views={view.views}
        points={view.points}
        riskOverrides={riskOverrides}
        initialMeasureKey="tug"
        sideBySide
      />
    </div>
  );
}
