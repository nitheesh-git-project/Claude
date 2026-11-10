"use client";

import { useMemo, useState } from "react";
import AffectedSideFigure from "@/components/profile/neuro/AffectedSideFigure";
import NeuroPicture from "@/components/profile/neuro/NeuroPicture";
import { StageCard, SymptomProfilePanel } from "@/components/profile/neuro/ParkinsonsPanels";
import WalkingSpeedBar from "@/components/profile/neuro/WalkingSpeedBar";
import { PictureCard, SampleProgress, type SampleProps } from "@/components/marketing/healthProfile/SampleParts";
import { sampleNeuroParkinsons, sampleNeuroStroke } from "@/lib/healthProfileSamples";

type Example = "stroke" | "parkinsons";

const EXAMPLES: { key: Example; label: string }[] = [
  { key: "stroke", label: "After a stroke" },
  { key: "parkinsons", label: "Including Parkinson's" },
];

/**
 * The neurological sample, with a second example for Parkinson's: the
 * profile is the same page with its own parts switched on (the symptom
 * profile, the stage, every timed test taken in ON time). The switch is a
 * pair of buttons inside the panel, not another tab, so the tour still has
 * one stop per kind of care; picking one stops the tour like any other pick.
 */
export default function NeuroSample({ showPicture, compact, onPick }: SampleProps) {
  const [example, setExample] = useState<Example>("stroke");
  const stroke = useMemo(() => sampleNeuroStroke(), []);
  const pd = useMemo(() => sampleNeuroParkinsons(), []);
  const current = example === "stroke" ? stroke : pd;
  const view = current.view;
  const parkinsons = view.parkinsons;

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Neurological example" className={`flex flex-wrap items-center gap-2 ${compact ? "max-md:hidden" : ""}`}>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Example</span>
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          {EXAMPLES.map((e) => (
            <button
              key={e.key}
              type="button"
              aria-pressed={example === e.key}
              onClick={() => {
                setExample(e.key);
                onPick?.();
              }}
              className={`min-h-[44px] rounded-lg px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                example === e.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-700 hover:text-slate-900"
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>
        <span className="text-sm text-slate-700">
          {current.person.name}: {current.person.conditionLine.toLowerCase()}
        </span>
      </div>

      {showPicture &&
        (example === "stroke" ? (
          <NeuroPicture
            voice="patient"
            assessments={stroke.assessments}
            examsFailed={false}
            affected={view.affected}
            affectedLabel={view.affectedLabel}
            ladder={view.ladder}
            speed={view.speed}
          />
        ) : (
          <PictureCard
            title="How your body is working now"
            lede={`${parkinsons?.onTimeChip ?? "Tested in ON time"}, so each test can be compared with the one before.`}
          >
            <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
              {parkinsons?.symptoms && <SymptomProfilePanel profile={parkinsons.symptoms} voice="patient" />}
              {parkinsons?.stage && <StageCard stage={parkinsons.stage} voice="patient" />}
              {view.speed && <WalkingSpeedBar zones={view.speed} voice="patient" />}
              {view.affected && view.affectedLabel && (
                <div className="flex min-w-0 items-center justify-center rounded-xl border border-slate-200 bg-white p-3.5">
                  <AffectedSideFigure parts={view.affected} label={view.affectedLabel} voice="patient" />
                </div>
              )}
            </div>
          </PictureCard>
        ))}

      <SampleProgress
        key={example}
        profileKind={view.kind}
        series={view.graphSeries}
        goal={view.goal}
        views={view.views}
        points={view.points}
        initialMeasureKey={example === "stroke" ? "fac" : "tug"}
        sideBySide
      />
    </div>
  );
}
