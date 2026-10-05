"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "@/components/system/ProgressLink";
import PainMapView from "@/components/profile/PainMapView";
import PainTrendChart from "@/components/profile/PainTrendChart";
import IntakeTrendChart from "@/components/profile/IntakeTrendChart";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import { formatClinicDateShort } from "@/lib/formatDateTime";
import { painTrendSeries } from "@/lib/healthProfileSummary";
import {
  PROGRESS_STEPS,
  SAMPLE_DASHBOARDS,
  SAMPLE_INDEPENDENCE,
  SAMPLE_MILESTONE_COUNTS,
  SAMPLE_PAIN_ASSESSMENTS,
  sampleMilestones,
  type ShowcaseProfile,
} from "@/lib/healthProfileShowcase";

const ROTATE_MS = 5000;

/**
 * A patient's health-profile dashboard, per specialty, with sample data --
 * the real charts and Pain Map inside a dashboard frame, with the stats, the
 * care plan and the timeline of everything recorded. See
 * src/lib/healthProfileShowcase.ts.
 *
 * It advances every five seconds, which the public pages otherwise avoid
 * ("a carousel that moves on its own is a carousel nobody can read",
 * public-site.md), so the movement is held to the reader: only while at
 * least half of it is on screen (so it never moves at the same time as
 * JourneySteps above it), never while hovered, focused or touched, never
 * again once somebody picks a tab, never under reduced motion, and always
 * with a pause button.
 *
 * `variant="home"` sets it beside a short pitch and a booking button;
 * `"full"` (/how-it-works) adds the five-step strip underneath.
 */
export default function HealthProfileShowcase({
  profiles,
  variant = "full",
}: {
  profiles: ShowcaseProfile[];
  variant?: "full" | "home";
}) {
  const baseId = useId();
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState(false); // a person picked a tab
  const [paused, setPaused] = useState(false); // the pause button
  const [held, setHeld] = useState(false); // hover / focus / touch
  const [inView, setInView] = useState(false);
  // Watched for visibility: the dashboard frame itself, not the whole band,
  // which on the home page is taller than half a screen and never counted.
  const frameRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  // The home page's cards used to deep-link a tab; keep honouring
  // ?profile=<specialty> so an old link still opens the right one.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("profile");
    const index = profiles.findIndex((p) => p.specialty === wanted);
    if (index > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActive(index);
      setChosen(true);
    }
  }, [profiles]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.5,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rotating = profiles.length > 1 && !reduceMotion && !chosen && !paused && !held && inView;

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setTimeout(() => setActive((i) => (i + 1) % profiles.length), ROTATE_MS);
    return () => window.clearTimeout(timer);
  }, [rotating, active, profiles.length]);

  if (profiles.length === 0) return null;
  const current = profiles[Math.min(active, profiles.length - 1)];

  function pick(index: number) {
    setActive(index);
    setChosen(true);
  }

  function onTabKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (active + delta + profiles.length) % profiles.length;
    pick(next);
    tabsRef.current[next]?.focus();
  }

  const tabs = profiles.length > 1 && (
    <div className="flex items-center justify-center gap-2">
      <div
        role="tablist"
        aria-label="Sample dashboard by specialty"
        aria-orientation="horizontal"
        onKeyDown={onTabKeyDown}
        className="flex max-w-full flex-wrap justify-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm"
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
              onClick={() => pick(index)}
              className={`relative flex items-center gap-2 overflow-hidden rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 ${
                selected ? "bg-teal-700 text-white shadow-sm" : "text-slate-600 hover:bg-teal-50 hover:text-teal-800"
              }`}
            >
              <i
                className={`fa-solid ${p.icon} text-xs ${selected ? "text-white/80" : "text-teal-600"}`}
                aria-hidden="true"
              />
              {p.label}
              {/* How long until it moves on: a line filling under the tab. */}
              {selected && rotating && (
                <span
                  key={`${active}-${p.specialty}`}
                  aria-hidden="true"
                  className="absolute inset-x-3 bottom-1 h-0.5 origin-left rounded-full bg-white/70"
                  style={{ animation: `hp-fill ${ROTATE_MS}ms linear forwards` }}
                />
              )}
            </button>
          );
        })}
      </div>
      {profiles.length > 1 && !reduceMotion && !chosen && (
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Play the dashboard tour" : "Pause the dashboard tour"}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-xs text-slate-600 shadow-sm transition hover:border-teal-300 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        >
          <i className={`fa-solid ${paused ? "fa-play" : "fa-pause"}`} aria-hidden="true" />
        </button>
      )}
      <style>{`@keyframes hp-fill { from { transform: scaleX(0) } to { transform: scaleX(1) } }`}</style>
    </div>
  );

  const frame = (
    <div
      ref={frameRef}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
      onTouchStart={() => setHeld(true)}
    >
      <DashboardFrame
        panelId={`${baseId}-panel`}
        labelledBy={`${baseId}-tab-${current.specialty}`}
        profile={current}
        compact={variant === "home"}
        reduceMotion={!!reduceMotion}
      />
    </div>
  );

  const tracked = (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-700">
        What we track - {current.label.toLowerCase()}
      </p>
      <ul className="mt-3 space-y-2.5">
        {current.tracks.map((line) => (
          <li key={line} className="flex gap-3 text-sm text-slate-700">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] text-emerald-700">
              <i className="fa-solid fa-check" aria-hidden="true" />
            </span>
            <span className="leading-relaxed">{line}</span>
          </li>
        ))}
        {ALWAYS_TRACKED.map((line) => (
          <li key={line} className="flex gap-3 text-sm text-slate-700">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] text-emerald-700">
              <i className="fa-solid fa-check" aria-hidden="true" />
            </span>
            <span className="leading-relaxed">{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  if (variant === "home") {
    return (
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
        <div>
          <p className="font-display text-2xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-3xl">
            Every session, every score, every small win - <span className="text-teal-700">on your screen.</span>
          </p>
          <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
            Nothing about your recovery gets lost in a paper file. You see what your physiotherapist sees,
            the moment they record it.
          </p>
          <div className="mt-6">{tracked}</div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/book"
              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
            >
              Book your first session
              <i className="fa-solid fa-arrow-right text-[11px]" aria-hidden="true" />
            </Link>
            <Link
              href="/how-it-works#health-profile"
              className="text-sm font-semibold text-teal-700 hover:underline"
            >
              See the full dashboard
            </Link>
          </div>
        </div>
        <div className="min-w-0 space-y-5">
          {tabs}
          {frame}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">{tabs}</div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,8fr)_minmax(0,3fr)] lg:items-start">
        <div className="min-w-0">{frame}</div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:sticky lg:top-28">
          {tracked}
          <Link
            href="/book"
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800"
          >
            Start your own profile
            <i className="fa-solid fa-arrow-right text-[11px]" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <p className="mt-14 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
        How progress is tracked
      </p>
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

/** Tracked for every patient, whatever the specialty. */
const ALWAYS_TRACKED = [
  "Every session's notes and your home exercises",
  "Your care plan, session by session",
  "Your scans and reports, in one place",
];

const NAV = [
  { icon: "fa-house", label: "Overview" },
  { icon: "fa-notes-medical", label: "Health profile" },
  { icon: "fa-calendar-check", label: "Sessions" },
  { icon: "fa-clipboard-list", label: "Care plan" },
  { icon: "fa-folder-open", label: "Documents" },
];

function DashboardFrame({
  panelId,
  labelledBy,
  profile,
  compact,
  reduceMotion,
}: {
  panelId: string;
  labelledBy: string;
  profile: ShowcaseProfile;
  compact: boolean;
  reduceMotion: boolean;
}) {
  const d = SAMPLE_DASHBOARDS[profile.specialty];
  const timeline = compact ? d.timeline.slice(0, 3) : d.timeline;
  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_32px_64px_-32px_rgba(15,23,42,0.35)]"
    >
      {/* Window chrome: says "this is the app", without pretending to be a
          real address bar. */}
      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
        </span>
        <span className="truncate text-[11px] font-semibold text-slate-500">
          Your dashboard · Health profile
        </span>
        <span className="ml-auto shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-800">
          Sample patient
        </span>
      </div>

      <div className={`grid ${compact ? "" : "md:grid-cols-[11rem_minmax(0,1fr)]"}`}>
        {!compact && (
          <nav aria-hidden="true" className="hidden border-r border-slate-100 bg-slate-900 p-3 md:block">
            <p className="px-2 pb-3 pt-1 text-[11px] font-bold uppercase tracking-[0.15em] text-teal-300">
              Patient portal
            </p>
            {NAV.map((item) => (
              <div
                key={item.label}
                className={`mb-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold ${
                  item.label === "Health profile" ? "bg-teal-700 text-white" : "text-slate-400"
                }`}
              >
                <i className={`fa-solid ${item.icon} w-4 text-center text-[11px]`} />
                {item.label}
              </div>
            ))}
          </nav>
        )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={profile.specialty}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
            transition={{ duration: reduceMotion ? 0.1 : 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="min-w-0 space-y-4 bg-slate-50/60 p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-display text-base font-bold text-slate-900">Hi {d.patient}</p>
                <p className="text-xs text-slate-500">{d.condition}</p>
              </div>
              <span className="flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-[11px] font-semibold text-teal-800">
                <i className={`fa-solid ${profile.icon} text-[10px]`} aria-hidden="true" />
                {profile.label}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {d.stats.map((stat) => (
                <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px]">
                    {stat.label}
                  </p>
                  <p
                    className={`mt-1 font-display text-lg font-extrabold leading-none sm:text-xl ${
                      stat.tone === "good" ? "text-emerald-700" : "text-slate-900"
                    }`}
                  >
                    {stat.value}
                  </p>
                  <p className="mt-1 text-[10px] leading-snug text-slate-500 sm:text-[11px]">{stat.note}</p>
                </div>
              ))}
            </div>

            <div className={`grid gap-4 ${compact ? "" : "xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"}`}>
              <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
                <SpecialtyChart profile={profile} compact={compact} />
              </div>
              <div className="min-w-0 space-y-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">Care plan</p>
                    <p className="text-xs font-semibold text-slate-700">
                      {d.plan.done} of {d.plan.total} sessions
                    </p>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{d.plan.title}</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500"
                      style={{ width: `${Math.round((d.plan.done / d.plan.total) * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
                    Every action, recorded
                  </p>
                  <ol className="mt-3 space-y-3">
                    {timeline.map((entry, i) => (
                      <li key={`${entry.date}-${i}`} className="flex gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-[11px] text-teal-700">
                          <i className={`fa-solid ${entry.icon}`} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium leading-snug text-slate-800">{entry.text}</p>
                          <p className="mt-0.5 text-[10px] text-slate-400">{formatClinicDateShort(entry.date)}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function SpecialtyChart({ profile, compact }: { profile: ShowcaseProfile; compact: boolean }) {
  if (profile.specialty === "ortho") {
    return (
      <div className={`grid gap-4 ${compact ? "" : "sm:grid-cols-2"}`}>
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">Pain trend</p>
          <PainTrendChart points={painTrendSeries(SAMPLE_PAIN_ASSESSMENTS)} />
        </div>
        {!compact && (
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
              Pain Map - tap a dot
            </p>
            <PainMapView assessments={SAMPLE_PAIN_ASSESSMENTS} />
          </div>
        )}
      </div>
    );
  }
  if (profile.specialty === "neuro") {
    return (
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">Independence</p>
        <IntakeTrendChart
          points={SAMPLE_INDEPENDENCE}
          max={10}
          unit="/ 10"
          caption="Day-to-day independence"
          emptyText=""
        />
      </div>
    );
  }
  const milestones = sampleMilestones();
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">Milestones</p>
      <IntakeTrendChart
        points={SAMPLE_MILESTONE_COUNTS}
        max={milestones.length}
        unit="milestones"
        caption="Done on their own"
        emptyText=""
      />
      {!compact && (
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {milestones.map((m) => (
            <li
              key={m.label}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                m.done
                  ? m.isNew
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-teal-200 bg-teal-50 text-teal-800"
                  : "border-slate-200 bg-white text-slate-400"
              }`}
            >
              <i className={`fa-solid ${m.done ? (m.isNew ? "fa-star" : "fa-check") : "fa-circle"} text-[8px]`} aria-hidden="true" />
              {m.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
