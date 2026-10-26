"use client";

import { useEffect, useId, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { useHydrationSafeReducedMotion } from "@/lib/useHydrationSafeReducedMotion";
import type { SampleProps } from "@/components/marketing/healthProfile/SampleParts";
import Link from "@/components/system/ProgressLink";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import {
  PROGRESS_STEPS,
  SAMPLE_NOTE,
  type ShowcaseProfile,
  type ShowcaseSpecialty,
} from "@/lib/healthProfileShowcase";

const ROTATE_MS = 5000;

function PanelLoading() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600" role="status">
      Drawing the sample...
    </div>
  );
}

// Each profile's panel is its own chunk, loaded when its tab is first shown:
// the real components are heavy (the body map, the milestone chart, the
// graph), and a visitor sees one profile at a time.
const PANELS: Record<ShowcaseSpecialty, ComponentType<SampleProps>> = {
  ortho: dynamic(() => import("@/components/marketing/healthProfile/OrthoSample"), { loading: PanelLoading }),
  neuro: dynamic(() => import("@/components/marketing/healthProfile/NeuroSample"), { loading: PanelLoading }),
  pediatrics: dynamic(() => import("@/components/marketing/healthProfile/PedsSample"), { loading: PanelLoading }),
  geriatric: dynamic(() => import("@/components/marketing/healthProfile/GeriatricSample"), { loading: PanelLoading }),
  cardiopulmonary: dynamic(() => import("@/components/marketing/healthProfile/CardioSample"), { loading: PanelLoading }),
};

/** What every visitor should leave knowing. */
const PITCH = [
  { icon: "fa-location-dot", title: "Where you are now", body: "Your latest scores, set beside your first visit." },
  { icon: "fa-chart-line", title: "How you have improved", body: "One dot per review, with your goal marked." },
  { icon: "fa-flag-checkered", title: "Your milestones", body: "Planned, being worked on, and reached." },
];

/**
 * The Health Profile of each kind of care, with sample data -- the real
 * graph, milestone cards and condition picture inside a frame, for an
 * invented patient. See src/lib/healthProfileShowcase.ts and
 * healthProfileSamples.ts.
 *
 * It advances every five seconds, which the public pages otherwise avoid
 * ("a carousel that moves on its own is a carousel nobody can read",
 * public-site.md), so the movement is held to the reader: only while at
 * least half of it is on screen (so it never moves at the same time as
 * JourneySteps above it), never while hovered, focused or touched, never
 * again once somebody picks a tab, never under reduced motion, and always
 * with a pause button.
 *
 * The frame never changes the page's height while it rotates: it keeps the
 * tallest height any profile has drawn at this width as its minimum, so the
 * content below stays put. Once a visitor picks a tab the minimum is dropped,
 * since the page then changes only because they asked it to.
 *
 * `variant="home"` is the teaser: the graph and the milestone cards beside a
 * short pitch and a booking button. `"full"` (/how-it-works) adds the
 * condition picture and the five-step strip underneath.
 */
export default function HealthProfileShowcase({
  profiles,
  variant = "full",
}: {
  profiles: ShowcaseProfile[];
  variant?: "full" | "home";
}) {
  const baseId = useId();
  // Not motion's useReducedMotion: it reads the media query on the first
  // client render, and the pause button below exists only while the tour
  // rotates -- so for anyone with reduced motion on, the client's first
  // render dropped a button the server's HTML had (React #418).
  const reduceMotion = useHydrationSafeReducedMotion();
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState(false); // a person picked a tab or an example
  const [paused, setPaused] = useState(false); // the pause button
  const [held, setHeld] = useState(false); // hover / focus / touch
  const [inView, setInView] = useState(false);
  const [minHeight, setMinHeight] = useState(0);
  // Watched for visibility: the frame itself, not the whole band, which on
  // the home page is taller than half a screen and never counted.
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
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

  // Keep the tallest height any profile has drawn at this width, so a
  // shorter one does not pull the page up under the reader. A new width
  // (rotating a phone, resizing a window) starts the count again.
  useEffect(() => {
    const outer = frameRef.current;
    const inner = contentRef.current;
    if (!outer || !inner) return;
    let width = outer.clientWidth;
    const observer = new ResizeObserver(() => {
      const w = outer.clientWidth;
      const h = Math.ceil(inner.getBoundingClientRect().height);
      if (Math.abs(w - width) > 1) {
        width = w;
        setMinHeight(h);
      } else {
        setMinHeight((m) => (h > m ? h : m));
      }
    });
    observer.observe(inner);
    observer.observe(outer);
    return () => observer.disconnect();
  }, []);

  const rotating = profiles.length > 1 && !reduceMotion && !chosen && !paused && !held && inView;

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setTimeout(() => setActive((i) => (i + 1) % profiles.length), ROTATE_MS);
    return () => window.clearTimeout(timer);
  }, [rotating, active, profiles.length]);

  // Bring the selected tab into view inside its own scrolling row. Done by
  // hand on the row, never with scrollIntoView, which would also scroll the
  // page when the tour moves on while the row is partly off screen.
  useEffect(() => {
    const list = listRef.current;
    const tab = tabsRef.current[active];
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
    const left = tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2;
    list.scrollTo({ left: Math.max(0, left), behavior: reduceMotion ? "auto" : "smooth" });
  }, [active, reduceMotion]);

  // Height is held only while the tour can still move on by itself. Once a
  // visitor picks a tab the page changes only when they ask it to.
  const reserveHeight = profiles.length > 1 && !reduceMotion && !chosen;
  if (profiles.length === 0) return null;
  const index = Math.min(active, profiles.length - 1);
  const current = profiles[index];
  const Panel = PANELS[current.specialty];

  function pick(next: number) {
    setActive(next);
    setChosen(true);
  }

  function onTabKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % profiles.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + profiles.length) % profiles.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = profiles.length - 1;
    else return;
    e.preventDefault();
    pick(next);
    tabsRef.current[next]?.focus();
  }

  const tabs = profiles.length > 1 && (
    <div className="flex items-center justify-center gap-2">
      {/* Scrolls sideways inside its own row on a phone, so no tab ever pushes
          the page wider and none is cut off without a way to reach it. */}
      <div
        ref={listRef}
        role="tablist"
        aria-label="Sample health profile by kind of care"
        aria-orientation="horizontal"
        onKeyDown={onTabKeyDown}
        className="flex min-w-0 snap-x gap-1 overflow-x-auto rounded-full border border-slate-200 bg-white p-1 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {profiles.map((p, i) => {
          const selected = i === index;
          return (
            <button
              key={p.specialty}
              ref={(el) => {
                tabsRef.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${p.specialty}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => pick(i)}
              className={`relative flex min-h-[44px] shrink-0 snap-center items-center gap-2 overflow-hidden whitespace-nowrap rounded-full px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 ${
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
      {!reduceMotion && !chosen && (
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Play the health profile tour" : "Pause the health profile tour"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xs text-slate-600 shadow-sm transition hover:border-teal-300 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
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
      style={{ minHeight: reserveHeight && minHeight ? minHeight : undefined }}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
      onTouchStart={() => setHeld(true)}
      className="min-w-0"
    >
      <div ref={contentRef}>
        <div
          id={`${baseId}-panel`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${current.specialty}`}
          className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-slate-50/60 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_32px_64px_-32px_rgba(15,23,42,0.35)]"
        >
          <ProfileHeader profile={current} />
          <AnimatePresence initial={false}>
            <motion.div
              key={current.specialty}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0.1 : 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="min-w-0 p-3 sm:p-5"
            >
              <Panel showPicture={variant === "full"} onPick={() => setChosen(true)} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );

  if (variant === "home") {
    return (
      <div className="space-y-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center">
          <p className="font-display text-2xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-3xl">
            Open your profile and see the whole picture - <span className="text-teal-700">on your screen.</span>
          </p>
          <ul className="grid gap-4 sm:grid-cols-3">
            {PITCH.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-sm text-teal-700">
                  <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-display text-sm font-bold text-slate-900">{item.title}</span>
                  <span className="block text-sm leading-relaxed text-slate-600">{item.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        {tabs}
        {frame}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/book"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
          >
            Book your first session
            <i className="fa-solid fa-arrow-right text-[11px]" aria-hidden="true" />
          </Link>
          <Link
            href="/how-it-works#health-profile"
            className="inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-700 hover:underline"
          >
            See the full profile
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">{tabs}</div>
      {frame}
      <div className="mt-8 flex justify-center">
        <Link
          href="/book"
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
        >
          Start your own profile
          <i className="fa-solid fa-arrow-right text-[11px]" aria-hidden="true" />
        </Link>
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
                <span className="text-[11px] font-bold text-slate-500">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <p className="mt-3 font-display text-sm font-bold text-slate-900">{step.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{step.body}</p>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}

/** Who it is for, what it watches and the headline change: the part of a
 *  frame that is plain words, drawn before the heavy components arrive. */
function ProfileHeader({ profile }: { profile: ShowcaseProfile }) {
  return (
    <div className="border-b border-slate-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <i className={`fa-solid ${profile.icon}`} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-lg font-bold leading-tight text-slate-900">{profile.label}</h3>
            <p className="mt-0.5 text-sm text-slate-700">{profile.forWho}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-800">
          {SAMPLE_NOTE}
        </span>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-start">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-800">
            {profile.sample.name}: first visit to latest
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{profile.headline.metric}</p>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 font-display text-2xl font-extrabold leading-tight text-emerald-800">
            <span>{profile.headline.from}</span>
            <i className="fa-solid fa-arrow-right text-sm" aria-hidden="true" />
            <span className="sr-only">to</span>
            <span>{profile.headline.to}</span>
          </p>
          <p className="mt-1 text-xs text-slate-700">{profile.sample.line}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-teal-700">What this profile watches</p>
          <ul className="mt-2 space-y-2">
            {profile.watches.map((line) => (
              <li key={line} className="flex gap-3 text-sm text-slate-700">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] text-emerald-700">
                  <i className="fa-solid fa-check" aria-hidden="true" />
                </span>
                <span className="leading-relaxed">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
