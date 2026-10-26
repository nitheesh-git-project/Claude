"use client";

import { useMemo } from "react";
import PedsPicture from "@/components/profile/peds/PedsPicture";
import { SampleProgress, type SampleProps } from "@/components/marketing/healthProfile/SampleParts";
import { samplePeds } from "@/lib/healthProfileSamples";

/** The paediatric sample: the milestone-window chart (each milestone against
 *  the ages when most children reach it, the child's age corrected for
 *  prematurity), then the graph and the milestone cards. */
export default function PedsSample({ showPicture }: SampleProps) {
  const { view } = useMemo(() => samplePeds(), []);
  return (
    <div className="space-y-4">
      {showPicture && <PedsPicture voice="patient" exam={view.exam} checklist={view.checklist} dobImplausible={view.dobImplausible} />}
      <SampleProgress
        profileKind="pediatrics"
        subject="child"
        series={view.series}
        goal={view.goal}
        views={view.views}
        points={view.points}
        initialMeasureKey="peds_milestones_achieved"
        sideBySide
      />
    </div>
  );
}
