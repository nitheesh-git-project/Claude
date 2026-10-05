"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import PainMapView from "@/components/profile/PainMapView";
import PainTrendChart from "@/components/profile/PainTrendChart";
import IntakeTrendChart from "@/components/profile/IntakeTrendChart";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/primitives";
import { painTrendSeries } from "@/lib/healthProfileSummary";
import {
  PROGRESS_STEPS,
  SAMPLE_INDEPENDENCE,
  SAMPLE_MILESTONE_COUNTS,
  SAMPLE_NEURO_FALLS,
  SAMPLE_NEURO_MOBILITY,
  SAMPLE_PAIN_ASSESSMENTS,
  sampleMilestones,
  type ShowcaseProfile,
} from "@/lib/healthProfileShowcase";

/**
 * /how-it-works -> "Your health profile": one specialty at a time, what we
 * ask on the left and what we track on the right, drawn through the same
 * components a patient's own health profile uses -- with sample data, said
 * on the panel, never a real patient's. See src/lib/healthProfileShowcase.ts.
 */
export default function HealthProfileShowcase({ profiles }: { profiles: ShowcaseProfile[] }) {
  const baseId = useId();
  const [active, setActive] = useState(0);
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  // The home page's cards link here as ?profile=<specialty>#health-profile,
  // so the card somebody tapped is the tab they land on. Read after mount:
  // the page is static, so the server cannot know the query string.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("profile");
    const index = profiles.findIndex((p) => p.specialty === wanted);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (index > 0) setActive(index);
  }, [profiles]);

  if (profiles.length === 0) return null;
  const current = profiles[Math.min(active, profiles.length - 1)];

  function onTabKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (active + delta + profiles.length) % profiles.length;
    setActive(next);
    tabsRef.current[next]?.focus();
  }

  return (
    <div>
      {profiles.length > 1 && (
        <div
          role="tablist"
          aria-label="Health profile by specialty"
          aria-orientation="horizontal"
          onKeyDown={onTabKeyDown}
          className="mx-auto mb-8 flex w-fit max-w-full flex-wrap justify-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm"
        >
          {profiles.map((p, index) => {
            const selected = p.specialty === current.specialty;
            return (
              <button
                key={p.specialty}
                ref={(el) => {
                  tabsRef.current[index] = el;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${p.specialty}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(index)}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 ${
                  selected ? "bg-teal-700 text-white shadow-sm" : "text-slate-600 hover:bg-teal-50 hover:text-teal-800"
                }`}
              >
                <i
                  className={`fa-solid ${p.icon} text-xs ${selected ? "text-white/80" : "text-teal-600"}`}
                  aria-hidden="true"
                />
                {p.label}
              </button>
            );
          })}
        </div>
      )}

      <div
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${current.specialty}`}
        className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_48px_-32px_rgba(15,23,42,0.25)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-6 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-white">
              <i className={`fa-solid ${current.icon}`} aria-hidden="true" />
            </span>
            <div>
              <p className="font-display text-base font-bold text-slate-900">
                {current.label} health profile
              </p>
              <p className="text-xs text-slate-500">{current.forWho}</p>
            </div>
          </div>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-800">
            Example - sample data, not a real patient
          </span>
        </div>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="border-b border-slate-100 p-6 sm:p-8 lg:border-b-0 lg:border-r">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-700">What we ask</p>
            <ol className="mt-4 space-y-3">
              {current.asks.map((question, i) => (
                <li key={question} className="flex gap-3 text-sm text-slate-700">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[11px] font-bold text-teal-700">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{question}</span>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.2em] text-teal-700">What we track</p>
            <ul className="mt-3 space-y-2">
              {current.tracks.map((line) => (
                <li key={line} className="flex gap-2 text-sm text-slate-600">
                  <i className="fa-solid fa-check mt-1 text-[11px] text-emerald-600" aria-hidden="true" />
                  <span className="leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-6 sm:p-8">
            {current.specialty === "ortho" && <OrthoSample />}
            {current.specialty === "neuro" && <NeuroSample />}
            {current.specialty === "pediatrics" && <PaedsSample />}
          </div>
        </div>
      </div>

      <Reveal className="mt-12">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
          How progress is tracked
        </p>
      </Reveal>
      <Stagger className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {PROGRESS_STEPS.map((step, i) => (
          <StaggerItem key={step.title} className="h-full">
            <div className="relative h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-sm text-teal-700">
                  <i className={`fa-solid ${step.icon}`} aria-hidden="true" />
                </span>
                <span className="text-[11px] font-bold text-slate-400">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <p className="mt-3 font-display text-sm font-bold text-slate-900">{step.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{step.body}</p>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}

function SampleHeading({ children }: { children: string }) {
  return <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">{children}</p>;
}

function OrthoSample() {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div>
        <SampleHeading>Pain Map - tap a dot</SampleHeading>
        <PainMapView assessments={SAMPLE_PAIN_ASSESSMENTS} />
      </div>
      <div>
        <SampleHeading>Pain over four exams</SampleHeading>
        <PainTrendChart points={painTrendSeries(SAMPLE_PAIN_ASSESSMENTS)} />
      </div>
    </div>
  );
}

function NeuroSample() {
  return (
    <div className="space-y-8">
      <div>
        <SampleHeading>Independence over four reviews</SampleHeading>
        <IntakeTrendChart
          points={SAMPLE_INDEPENDENCE}
          max={10}
          unit="/ 10"
          caption="Day-to-day independence"
          emptyText=""
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <BeforeAfter title="How you move indoors" from={SAMPLE_NEURO_MOBILITY.from} to={SAMPLE_NEURO_MOBILITY.to} />
        <BeforeAfter title="Falls" from={SAMPLE_NEURO_FALLS.from} to={SAMPLE_NEURO_FALLS.to} />
      </div>
    </div>
  );
}

function PaedsSample() {
  return (
    <div className="space-y-8">
      <div>
        <SampleHeading>Milestones over four reviews</SampleHeading>
        <IntakeTrendChart
          points={SAMPLE_MILESTONE_COUNTS}
          max={sampleMilestones().length}
          unit="milestones"
          caption="Milestones done on their own"
          emptyText=""
        />
      </div>
      <div>
        <SampleHeading>This review</SampleHeading>
        <ul className="flex flex-wrap gap-2">
          {sampleMilestones().map((m) => (
            <li
              key={m.label}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                m.done
                  ? m.isNew
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-teal-200 bg-teal-50 text-teal-800"
                  : "border-slate-200 bg-white text-slate-400"
              }`}
            >
              <i
                className={`fa-solid ${m.done ? "fa-check" : "fa-circle"} text-[9px]`}
                aria-hidden="true"
              />
              {m.label}
              {m.isNew && <span className="sr-only"> (new since the first review)</span>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle" aria-hidden="true" />{" "}
          New since the first review
        </p>
      </div>
    </div>
  );
}

function BeforeAfter({ title, from, to }: { title: string; from: string; to: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-semibold text-slate-500">{title}</p>
      <p className="mt-2 text-sm text-slate-400 line-through decoration-slate-300">{from}</p>
      <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-emerald-700">
        <i className="fa-solid fa-arrow-trend-up text-xs" aria-hidden="true" />
        {to}
      </p>
    </div>
  );
}
