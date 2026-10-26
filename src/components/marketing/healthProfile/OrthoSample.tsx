"use client";

import { useMemo } from "react";
import OrthoBodyMap from "@/components/profile/ortho/OrthoBodyMap";
import { SampleProgress, type SampleProps } from "@/components/marketing/healthProfile/SampleParts";
import { SAMPLE_PAIN_ASSESSMENTS, sampleOrtho } from "@/lib/healthProfileSamples";

/** The orthopaedic sample: the body map with the knee-bend dial and the leg
 *  strength bar, then the graph and the milestone cards. */
export default function OrthoSample({ showPicture }: SampleProps) {
  const { view } = useMemo(() => sampleOrtho(), []);
  return (
    <div className="space-y-4">
      {showPicture && (
        <OrthoBodyMap
          voice="patient"
          assessments={SAMPLE_PAIN_ASSESSMENTS}
          areaPain={[]}
          areas={view.areas}
          kneeBend={view.kneeBend}
          legStrength={view.legStrength}
          straightening={view.straightening}
          measuresFailed={false}
        />
      )}
      <SampleProgress
        profileKind="ortho"
        series={view.series}
        goal={view.goal}
        views={view.views}
        points={view.points}
        initialMeasureKey="pain_nprs"
        sideBySide
      />
    </div>
  );
}
