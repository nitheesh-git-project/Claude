"use client";

import type { ReactNode } from "react";
import MilestoneCards from "@/components/profile/progress/MilestoneCards";
import ProgressGraph from "@/components/profile/progress/ProgressGraph";
import type { CareGoal, MilestoneView } from "@/lib/careGoals";
import type { ProfileSubject } from "@/lib/childVoice";
import type { ProfileKind } from "@/lib/outcomeMeasures";
import type { MeasurementPoint, MeasureSeries } from "@/lib/outcomeSeries";

/** What every sample panel takes: whether to draw the condition picture (the
 *  full page does, the home teaser shows the graph and milestones only), and
 *  a way to say a visitor chose something, which stops the tour. */
export type SampleProps = { showPicture: boolean; compact?: boolean; onPick?: () => void };

const CARD = "min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6";

/** The card the real profile wraps its condition picture in: a heading, one
 *  plain sentence, then the picture itself. */
export function PictureCard({ title, lede, children }: { title: string; lede: string; children: ReactNode }) {
  return (
    <section aria-label={title} className={CARD}>
      <h3 className="font-display text-lg font-bold text-slate-900">{title}</h3>
      <p className="mt-0.5 mb-4 text-sm text-slate-700">{lede}</p>
      {children}
    </section>
  );
}

/**
 * The progress half of a profile, drawn by the same two components a
 * patient's dashboard uses: the graph ("Are you getting better?", one dot per
 * review, the goal as a green band) and the milestone cards (reached, working
 * on, planned). Nothing here can be changed - the sample has no buttons that
 * record or edit.
 */
export function SampleProgress({
  profileKind,
  series,
  goal,
  views,
  points,
  subject = "self",
  title,
  riskOverrides,
  initialMeasureKey,
  sideBySide,
}: {
  profileKind: ProfileKind;
  series: MeasureSeries[];
  goal: CareGoal | null;
  views: MilestoneView[];
  points: MeasurementPoint[];
  subject?: ProfileSubject;
  title?: string;
  riskOverrides?: Record<string, { value: number; label: string }>;
  /** The line the graph opens on: the one the headline quotes. */
  initialMeasureKey?: string;
  /** Graph and milestone cards in two columns once the frame is wide. */
  sideBySide?: boolean;
}) {
  const heading =
    title ??
    (profileKind === "neuro_parkinsons"
      ? "Is it holding, or getting better?"
      : subject === "child"
        ? "Is your child getting better?"
        : "Are you getting better?");
  const initial = initialMeasureKey ? series.find((s) => s.measureKey === initialMeasureKey)?.key : undefined;
  return (
    <div className={`grid gap-4 ${sideBySide ? "xl:grid-cols-2 xl:items-start" : ""}`}>
      <section aria-label="Progress" className={CARD}>
        <h3 className="font-display text-lg font-bold text-slate-900">{heading}</h3>
        <p className="mb-3 mt-0.5 text-sm text-slate-700">One dot per review. The green band is where we are aiming.</p>
        <ProgressGraph
          series={series}
          milestones={views.map((v) => v.milestone)}
          profileKind={profileKind}
          voice="patient"
          subject={subject}
          initialSeriesKey={initial}
          riskOverrides={riskOverrides}
        />
      </section>
      <section aria-label="Steps" className={CARD}>
        <MilestoneCards goal={goal} views={views} voice="patient" subject={subject} measurements={points} />
      </section>
    </div>
  );
}
