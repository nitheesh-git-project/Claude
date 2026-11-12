"use client";

import { useMemo } from "react";
import { OxygenCard, SafetyLimitsRow, WalkTrackCard } from "@/components/profile/cardio/CardioPanels";
import { PictureCard, SampleProgress, type SampleProps } from "@/components/marketing/healthProfile/SampleParts";
import { sampleCardio } from "@/lib/healthProfileSamples";

/** The three lines the real graph draws. */
const GRAPH_KEYS = ["six_minute_walk", "breathlessness_nrs", "resting_heart_rate"];

/** The Heart and lung rehabilitation sample: the patient's own oxygen limit,
 *  the six-minute walk on its track and the oxygen bar, then the graph and
 *  the milestone cards. */
export default function CardioSample({ showPicture }: SampleProps) {
  const { view } = useMemo(() => sampleCardio(), []);
  return (
    <div className="space-y-4">
      {showPicture && (
        <PictureCard title="Your heart and lungs today" lede="From your six-minute walk and your readings at your latest reviews.">
          <div className="mb-4">
            <SafetyLimitsRow view={view} voice="patient" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <WalkTrackCard view={view} voice="patient" />
            <OxygenCard view={view} voice="patient" />
          </div>
        </PictureCard>
      )}
      <SampleProgress
        profileKind="cardiopulmonary"
        title="Is your fitness coming back?"
        series={view.graphSeries.filter((s) => GRAPH_KEYS.includes(s.measureKey))}
        goal={view.goal}
        views={view.views}
        points={view.points}
        initialMeasureKey="six_minute_walk"
        sideBySide
      />
    </div>
  );
}
