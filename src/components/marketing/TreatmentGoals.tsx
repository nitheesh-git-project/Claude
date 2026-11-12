"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { useInView } from "motion/react";
import { photo } from "@/lib/marketingPhotos";
import { useHydrationSafeReducedMotion } from "@/lib/useHydrationSafeReducedMotion";
import { formatGoalValue, TREATMENT_GOALS, TREATMENT_GOALS_NOTE, type TreatmentGoal } from "@/lib/treatmentGoals";

/**
 * "What treatment works towards": one kind of care at a time, as a before and
 * after. A divider sweeps across the card and the first visit (grey photo,
 * rose figure, what is hard today) becomes the goal (colour, teal figure,
 * what the physiotherapist works towards).
 *
 * The sweep plays once when the band comes into view and again whenever a
 * kind of care is picked. "Play all six" walks through every kind of care,
 * and only when it is tapped: nothing here advances on its own (the carousel
 * rule in docs/rules/public-site.md). Under reduced motion the goal side is
 * shown at once, with nothing moving.
 *
 * Every story is a made-up sample patient, labelled as one, and the words are
 * goals, never promises (`treatmentGoals.ts`, unit-tested).
 */
const SWEEP_MS = 1800;
const HOLD_MS = 1600;

export default function TreatmentGoals() {
  const reduce = useHydrationSafeReducedMotion();
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { once: true, amount: 0.35 });
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [active, setActive] = useState(0);
  // 0 = the first visit fully showing, 1 = the goal fully showing.
  const [progress, setProgress] = useState(0);
  const [playingAll, setPlayingAll] = useState(false);
  const run = useRef(0);

  const sweep = useCallback(
    (index: number, then?: () => void) => {
      const token = ++run.current;
      setActive(index);
      if (reduce) {
        setProgress(1);
        if (then) window.setTimeout(() => token === run.current && then(), HOLD_MS);
        return;
      }
      setProgress(0);
      const start = performance.now() + 450;
      const step = (now: number) => {
        if (token !== run.current) return;
        const t = Math.min(1, Math.max(0, (now - start) / SWEEP_MS));
        setProgress(t);
        if (t < 1) requestAnimationFrame(step);
        else if (then) window.setTimeout(() => token === run.current && then(), HOLD_MS);
      };
      requestAnimationFrame(step);
    },
    [reduce]
  );

  // The first time the band is on screen, its first story plays once.
  useEffect(() => {
    if (!inView) return;
    // Starting an animation in response to the band scrolling into view:
    // the in-view signal is the external event this effect follows.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    sweep(0);
  }, [inView, sweep]);

  // Nothing keeps running once the visitor has gone.
  useEffect(() => () => void (run.current += 1), []);

  function pick(index: number, focus = false) {
    setPlayingAll(false);
    sweep(index);
    if (focus) tabsRef.current[index]?.focus();
  }

  function playAll() {
    setPlayingAll(true);
    const next = (i: number) => {
      if (i >= TREATMENT_GOALS.length) {
        setPlayingAll(false);
        return;
      }
      sweep(i, () => next(i + 1));
    };
    next(0);
  }

  function onTabKey(e: React.KeyboardEvent, i: number) {
    const last = TREATMENT_GOALS.length - 1;
    const to =
      e.key === "ArrowRight" ? (i === last ? 0 : i + 1)
      : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (to === null) return;
    e.preventDefault();
    pick(to, true);
  }

  const goal = TREATMENT_GOALS[active];
  const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
  const pct = eased * 100;

  return (
    <div ref={rootRef} data-testid="treatment-goals">
      <div
        role="tablist"
        // Distinct from RecoveryGist's "Kinds of care": two tablists sharing a
        // name make both unfindable (docs/rules/public-site.md).
        aria-label="Goals by kind of care"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0"
      >
        {TREATMENT_GOALS.map((g, i) => (
          <button
            key={g.key}
            ref={(el) => {
              tabsRef.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${g.key}`}
            aria-selected={i === active}
            aria-controls={`${baseId}-panel`}
            aria-label={g.label}
            tabIndex={i === active ? 0 : -1}
            onClick={() => pick(i)}
            onKeyDown={(e) => onTabKey(e, i)}
            className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 ${
              i === active
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:text-teal-800"
            }`}
          >
            {g.short}
          </button>
        ))}
      </div>

      <div
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${goal.key}`}
        className="relative mt-6 h-[640px] overflow-hidden rounded-[1.75rem] border border-slate-200 shadow-[0_30px_60px_-36px_rgba(15,23,42,0.45)] sm:h-[600px] md:h-[480px] lg:h-[520px]"
      >
        {/* The two sides are stacked and the goal is wiped across the first
            visit, so only one is ever read: the first visit is hidden from
            assistive tech and the goal side carries it as words. */}
        <Side goal={goal} side="before" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${(100 - pct).toFixed(2)}% 0 0)` }}>
          <Side goal={goal} side="after" />
        </div>
        {/* The divider exists only mid-sweep: rendered hidden, it would put an
            inline opacity:0 in the server HTML (HY-003). */}
        {progress > 0 && progress < 1 && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-[3px] -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.08)]"
            style={{ left: `${pct}%` }}
          >
            <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-teal-700 shadow-lg">
              <i className="fa-solid fa-arrows-left-right text-sm" />
            </span>
          </div>
        )}
      </div>

      {/* Under the card rather than on it: over the card it sat on the text
          column's first line (the layout audit's overlap). */}
      <div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          {goal.sample} · {TREATMENT_GOALS_NOTE}
        </p>
        <button
          type="button"
          onClick={playAll}
          disabled={playingAll}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-full bg-slate-900 px-4 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800 disabled:opacity-80 sm:self-auto"
        >
          <i className="fa-solid fa-play text-xs" aria-hidden="true" />
          {playingAll ? "Playing…" : "Play all six"}
        </button>
      </div>
    </div>
  );
}

/** One side of the card: the first visit, or the goal. */
function Side({ goal, side }: { goal: TreatmentGoal; side: "before" | "after" }) {
  const after = side === "after";
  return (
    <div
      aria-hidden={after ? undefined : true}
      className={`absolute inset-0 grid grid-rows-[208px_minmax(0,1fr)] md:grid-cols-[42%_minmax(0,1fr)] md:grid-rows-1 ${
        after ? "bg-teal-50" : "bg-rose-50"
      }`}
    >
      <div className="relative overflow-hidden">
        <Image
          src={photo(goal.photo)}
          alt={after ? goal.photoAlt : ""}
          fill
          sizes="(max-width: 768px) 100vw, 42vw"
          className={`object-cover ${after ? "" : "grayscale brightness-95"}`}
          style={{ objectPosition: goal.focus }}
        />
        <span
          className={`absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-bold ${
            after ? "bg-teal-100 text-teal-900" : "bg-rose-100 text-rose-900"
          }`}
        >
          {after ? "Goal · around week 8" : "First visit"}
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-3 p-5 sm:p-7 lg:p-10">
        {after && (
          <p className="sr-only">
            First visit: {goal.metric} {formatGoalValue(goal, goal.from)}. {goal.before.join(". ")}.
          </p>
        )}
        <p className={`text-xs font-bold uppercase tracking-[0.12em] ${after ? "text-teal-800" : "text-rose-800"}`}>
          {goal.metric} · {after ? "goal" : "today"}
        </p>
        <p
          className={`font-display text-5xl font-extrabold leading-none sm:text-6xl lg:text-7xl ${
            after ? "text-teal-700" : "text-rose-700"
          }`}
        >
          {formatGoalValue(goal, after ? goal.to : goal.from)}
        </p>
        <ul className="mt-1 space-y-2">
          {(after ? goal.after : goal.before).map((line) => (
            <li key={line} className={`flex items-start gap-3 text-base sm:text-lg ${after ? "text-slate-900" : "text-slate-600"}`}>
              {after ? (
                <i className="fa-solid fa-circle-check mt-1 shrink-0 text-teal-600" aria-hidden="true" />
              ) : (
                <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-rose-400" aria-hidden="true" />
              )}
              {line}
            </li>
          ))}
        </ul>
        {after && (
          <p className="font-display mt-auto text-lg font-bold text-slate-900 sm:text-xl lg:text-2xl">
            “{goal.goal}”
          </p>
        )}
      </div>
    </div>
  );
}
