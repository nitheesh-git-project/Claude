"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * The building blocks every tutorial scene is drawn with: a small app frame,
 * feed items, chips, buttons with a tap ripple, a progress line. They copy
 * the dashboard's own look (slate cards, teal brand, the feed's tone colours)
 * at a smaller scale, so what the tour shows is recognisably the screen a
 * person is about to use, without rendering real components that need real
 * data, a router or a session.
 */

export const EASE = [0.16, 1, 0.3, 1] as const;
export const SPRING = { type: "spring", stiffness: 380, damping: 30 } as const;

/**
 * A scene's beat: 0, 1, 2 ... n-1, advancing every `ms`, then holding on
 * the last beat for `hold` beats before starting again -- so a state change
 * plays, rests long enough to read, and loops.
 */
export function usePhase(count: number, ms = 1700, hold = 2): number {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    let tick = 0;
    const total = count + hold;
    const id = window.setInterval(() => {
      tick = (tick + 1) % total;
      setPhase(Math.min(tick, count - 1));
    }, ms);
    return () => window.clearInterval(id);
  }, [count, ms, hold]);
  return phase;
}

export type Tone = "good" | "warn" | "info" | "bad" | "neutral" | "brand";

export const TONE: Record<Tone, { chip: string; icon: string; ring: string }> = {
  good: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: "bg-emerald-100 text-emerald-700", ring: "ring-emerald-300" },
  warn: { chip: "bg-amber-50 text-amber-800 ring-amber-200", icon: "bg-amber-100 text-amber-700", ring: "ring-amber-300" },
  info: { chip: "bg-sky-50 text-sky-800 ring-sky-200", icon: "bg-sky-100 text-sky-700", ring: "ring-sky-300" },
  bad: { chip: "bg-red-50 text-red-700 ring-red-200", icon: "bg-red-100 text-red-700", ring: "ring-red-300" },
  neutral: { chip: "bg-slate-100 text-slate-700 ring-slate-200", icon: "bg-slate-100 text-slate-600", ring: "ring-slate-300" },
  brand: { chip: "bg-teal-50 text-teal-800 ring-teal-200", icon: "bg-teal-100 text-teal-700", ring: "ring-teal-300" },
};

/** A miniature dashboard window: a title bar and a body. */
export function Frame({
  title,
  icon = "fa-gauge-high",
  children,
  className = "",
}: {
  title: string;
  icon?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 ${className}`}>
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2">
        <span className="flex gap-1" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-slate-300" />
          <span className="h-2 w-2 rounded-full bg-slate-300" />
          <span className="h-2 w-2 rounded-full bg-slate-300" />
        </span>
        <span className="ml-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
          <i className={`fa-solid ${icon} text-teal-600`} aria-hidden="true" />
          {title}
        </span>
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </div>
  );
}

export function Chip({ tone = "neutral", icon, children }: { tone?: Tone; icon?: string; children: ReactNode }) {
  return (
    <motion.span
      layout
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={SPRING}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${TONE[tone].chip}`}
    >
      {icon && <i className={`fa-solid ${icon} text-[9px]`} aria-hidden="true" />}
      {children}
    </motion.span>
  );
}

/** A feed row, as the dashboards' Home feed draws one. */
export function FeedRow({
  icon,
  tone,
  title,
  detail,
  needsYou,
  highlight,
  delay = 0,
}: {
  icon: string;
  tone: Tone;
  title: string;
  detail?: string;
  needsYou?: boolean;
  highlight?: boolean;
  delay?: number;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0, scale: highlight ? 1.02 : 1 }}
      transition={{ ...SPRING, delay }}
      className={`flex items-start gap-2.5 rounded-xl border bg-white p-2.5 transition-shadow ${
        highlight ? `border-transparent shadow-lg ring-2 ${TONE[tone].ring}` : "border-slate-200"
      }`}
    >
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] ${TONE[tone].icon}`}>
        <i className={`fa-solid ${icon}`} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold leading-snug text-slate-900">{title}</span>
          {needsYou && <Chip tone="warn">Needs you</Chip>}
        </span>
        {detail && <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">{detail}</span>}
      </span>
    </motion.div>
  );
}

/** A button that shows a finger and a ripple while it is "being tapped". */
export function TapButton({
  children,
  tapping = false,
  variant = "primary",
  icon,
  disabled,
  glow,
}: {
  children: ReactNode;
  tapping?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  icon?: string;
  disabled?: boolean;
  glow?: boolean;
}) {
  const reduce = useReducedMotion();
  const cls =
    variant === "primary"
      ? "bg-teal-700 text-white"
      : variant === "secondary"
        ? "bg-slate-100 text-slate-700"
        : "bg-transparent text-teal-700";
  return (
    <motion.span
      animate={tapping && !reduce ? { scale: [1, 0.94, 1] } : { scale: 1 }}
      transition={{ duration: 0.45 }}
      className={`relative inline-flex select-none items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold ${cls} ${
        disabled ? "opacity-40" : ""
      } ${glow ? "shadow-[0_0_0_4px_rgba(13,148,136,0.18)]" : ""}`}
    >
      {icon && <i className={`fa-solid ${icon} text-[10px]`} aria-hidden="true" />}
      {children}
      {glow && !reduce && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-teal-400"
          animate={{ opacity: [0.9, 0], scale: [1, 1.25] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      {tapping && (
        <>
          {!reduce && (
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-400/40"
              initial={{ scale: 0, opacity: 0.8 }}
              animate={{ scale: 2.2, opacity: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
          )}
          <motion.i
            aria-hidden="true"
            className="fa-solid fa-hand-pointer pointer-events-none absolute -bottom-4 right-0 text-base text-slate-800 drop-shadow"
            initial={{ opacity: 0, x: 14, y: 14 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
          />
        </>
      )}
    </motion.span>
  );
}

/** A labelled step line: dots joined by a filling bar, the current one lit. */
export function Stepper({ steps, current, tone = "brand" }: { steps: string[]; current: number; tone?: Tone }) {
  return (
    <ol className="space-y-0">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="relative flex gap-2.5 pb-3 last:pb-0">
            {i < steps.length - 1 && (
              <span className="absolute left-[9px] top-5 h-[calc(100%-12px)] w-0.5 overflow-hidden rounded bg-slate-200" aria-hidden="true">
                <motion.span
                  className="block w-full bg-teal-500"
                  initial={false}
                  animate={{ height: done ? "100%" : "0%" }}
                  transition={{ duration: 0.5, ease: EASE }}
                />
              </span>
            )}
            <motion.span
              initial={false}
              animate={{ scale: active ? 1.15 : 1 }}
              transition={SPRING}
              className={`relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                done ? "bg-teal-600 text-white" : active ? `${TONE[tone].icon} ring-2 ${TONE[tone].ring}` : "bg-slate-100 text-slate-400"
              }`}
            >
              {done ? <i className="fa-solid fa-check" aria-hidden="true" /> : i + 1}
            </motion.span>
            <span className={`pt-0.5 text-[11px] leading-snug ${active ? "font-semibold text-slate-900" : done ? "text-slate-600" : "text-slate-400"}`}>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Text that types itself out. */
export function Typed({ text, start = true, speed = 28 }: { text: string; start?: boolean; speed?: number }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!start) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) window.clearInterval(id);
    }, speed);
    return () => {
      window.clearInterval(id);
      setN(0);
    };
  }, [text, start, speed]);
  const shown = reduce ? (start ? text.length : 0) : n;
  return (
    <span>
      {text.slice(0, shown)}
      {start && shown < text.length && (
        <span className="ml-px inline-block h-3 w-px animate-pulse bg-slate-500 align-middle" aria-hidden="true" />
      )}
    </span>
  );
}

/** A labelled field as a form draws one. */
export function Field({ label, children, active }: { label: string; children: ReactNode; active?: boolean }) {
  return (
    <div>
      <span className="mb-0.5 block text-[9px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <span
        className={`block min-h-[26px] rounded-lg border px-2 py-1 text-[11px] text-slate-800 transition-colors ${
          active ? "border-teal-500 ring-2 ring-teal-500/20" : "border-slate-200"
        }`}
      >
        {children}
      </span>
    </div>
  );
}

/** A small person silhouette with pain points, for the Pain Map. */
export function BodyMap({ points }: { points: { x: number; y: number; level: number }[] }) {
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 100 160" className="h-full w-full" role="img" aria-label="Pain Map">
      <g fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1">
        <circle cx="50" cy="18" r="11" />
        <rect x="34" y="31" width="32" height="52" rx="12" />
        <rect x="20" y="34" width="11" height="44" rx="5.5" />
        <rect x="69" y="34" width="11" height="44" rx="5.5" />
        <rect x="36" y="82" width="12" height="62" rx="6" />
        <rect x="52" y="82" width="12" height="62" rx="6" />
      </g>
      {points.map((p, i) => {
        const color = p.level >= 7 ? "#dc2626" : p.level >= 4 ? "#f59e0b" : "#10b981";
        return (
          <g key={`${p.x}-${p.y}`}>
            {!reduce && (
              <motion.circle
                cx={p.x}
                cy={p.y}
                r={6}
                fill={color}
                initial={{ opacity: 0.5, scale: 0.6 }}
                animate={{ opacity: [0.5, 0], scale: [0.6, 2] }}
                transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.3 }}
                style={{ transformOrigin: `${p.x}px ${p.y}px` }}
              />
            )}
            <motion.circle
              cx={p.x}
              cy={p.y}
              r={4.5}
              fill={color}
              stroke="white"
              strokeWidth="1.5"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ ...SPRING, delay: i * 0.15 }}
              style={{ transformOrigin: `${p.x}px ${p.y}px` }}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** A progress line that draws itself point by point. */
export function ProgressChart({ values, shown }: { values: number[]; shown: number }) {
  const w = 160;
  const h = 70;
  const pts = values.map((v, i) => ({
    x: 12 + (i * (w - 24)) / Math.max(1, values.length - 1),
    // Pain 0-10: more pain sits lower, so getting better reads as rising.
    y: 8 + (v / 10) * (h - 16),
  }));
  const visible = pts.slice(0, Math.max(1, shown));
  const d = visible.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" role="img" aria-label="Progress chart">
      {[0, 1, 2].map((i) => (
        <line key={i} x1="8" x2={w - 8} y1={10 + i * 25} y2={10 + i * 25} stroke="#f1f5f9" strokeWidth="1" />
      ))}
      <motion.path
        key={shown}
        d={d}
        fill="none"
        stroke="#0d9488"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0.6 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.7, ease: EASE }}
      />
      {visible.map((p, i) => (
        <motion.circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="3.5"
          fill="white"
          stroke="#0d9488"
          strokeWidth="2"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ ...SPRING, delay: 0.1 }}
          style={{ transformOrigin: `${p.x}px ${p.y}px` }}
        />
      ))}
    </svg>
  );
}
