"use client";

import { motion } from "motion/react";

/**
 * The three "what this step actually looks like" scenes for How It Works.
 *
 * These are deliberately concrete rather than iconographic: a visitor who
 * has never had a virtual physio session should be able to look at each
 * panel and know what is going to happen to them.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

const rise = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 * i, duration: 0.45, ease: EASE },
  }),
};

function SceneFrame({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="h-full w-full"
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 1 — booking                                                    */
/* ------------------------------------------------------------------ */

const SLOTS = [
  "07:00", "08:30", "10:00", "11:30",
  "13:00", "14:30", "16:00", "17:30",
  "19:00", "20:30", "21:00", "22:30",
];
const SELECTED_SLOT = 5;
const UNAVAILABLE = new Set([1, 6, 10]);

export function BookingScene() {
  return (
    <SceneFrame>
      <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5">
        <motion.div variants={rise} initial="hidden" animate="show" custom={0}>
          <p className="font-display text-sm font-bold text-slate-900">Choose your slot</p>
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-800">
            <i className="fa-solid fa-globe text-teal-600" />
            Times shown in <strong className="font-semibold">your</strong> timezone — detected automatically
          </div>
        </motion.div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {SLOTS.map((slot, i) => {
            const disabled = UNAVAILABLE.has(i);
            const selected = i === SELECTED_SLOT;
            return (
              <motion.div
                key={slot}
                variants={rise}
                initial="hidden"
                animate="show"
                custom={1 + i * 0.35}
                className={`relative rounded-lg border px-2 py-2 text-center text-xs font-semibold ${
                  selected
                    ? "border-teal-600 bg-teal-600 text-white"
                    : disabled
                      ? "border-slate-100 bg-slate-50 text-slate-300 line-through"
                      : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {slot}
                {selected && (
                  <motion.span
                    className="absolute inset-0 rounded-lg ring-2 ring-teal-400"
                    animate={{ opacity: [0.9, 0, 0.9], scale: [1, 1.16, 1] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
              </motion.div>
            );
          })}
        </div>

        <motion.div
          variants={rise}
          initial="hidden"
          animate="show"
          custom={7}
          className="mt-5 rounded-xl border border-slate-200 p-3"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Attach your reports
          </p>
          <div className="mt-2 flex items-center gap-2">
            <i className="fa-solid fa-file-medical text-teal-600" />
            <span className="text-xs font-medium text-slate-700">lumbar-mri-scan.pdf</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <motion.div
              className="h-full rounded-full bg-teal-600"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 1.0, ease: EASE, delay: 0.35 }}
            />
          </div>
        </motion.div>

        <motion.div
          variants={rise}
          initial="hidden"
          animate="show"
          custom={9}
          className="mt-auto flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3"
        >
          <span className="text-xs font-medium text-slate-300">Secure UPI payment</span>
          <span className="flex items-center gap-2 text-sm font-bold text-white">
            <motion.i
              className="fa-solid fa-circle-check text-teal-400"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.85, type: "spring", stiffness: 300, damping: 14 }}
            />
            Confirmed
          </span>
        </motion.div>
      </div>
    </SceneFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Step 2 — the live assessment                                        */
/* ------------------------------------------------------------------ */

const JOINTS = [
  { id: "shoulder", x: 150, y: 74 },
  { id: "elbow", x: 160, y: 108 },
  { id: "wrist", x: 165, y: 140 },
  { id: "hip", x: 148, y: 132 },
  { id: "knee", x: 153, y: 180 },
  { id: "ankle", x: 149, y: 226 },
];

export function ConsultScene() {
  return (
    <SceneFrame>
      <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
          <span className="flex items-center gap-2 text-[11px] font-semibold text-slate-300">
            <motion.span
              className="h-2 w-2 rounded-full bg-rose-500"
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ duration: 1.8, repeat: Infinity }}
            />
            Live movement assessment
          </span>
          <span className="font-mono text-[11px] text-slate-400">58:12</span>
        </div>

        <div className="relative flex-1">
          <svg viewBox="0 0 300 270" className="h-full w-full">
            {/* Plumb line — the reference posture is measured against. */}
            <motion.line
              x1={150} y1={40} x2={150} y2={250}
              stroke="#475569" strokeWidth={1} strokeDasharray="4 5"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
              transition={{ duration: 0.8, ease: EASE }}
            />

            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              stroke="#5eead4"
              strokeWidth={2.5}
              strokeLinecap="round"
              fill="none"
            >
              <circle cx={150} cy={52} r={13} stroke="#5eead4" strokeWidth={2.5} />
              <path d="M150 65 L150 74" />
              <path d="M150 74 L148 132" />
              <path d="M150 74 L160 108 L165 140" />
              <path d="M148 132 L153 180 L149 226" />
            </motion.g>

            {/* Hip angle readout — the kind of measurement a therapist calls out. */}
            <motion.path
              d="M148 132 m 22 0 a 22 22 0 0 1 -6.5 15.5"
              fill="none"
              stroke="#fbbf24"
              strokeWidth={2}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.45, ease: EASE }}
            />

            {JOINTS.map((j, i) => (
              <motion.circle
                key={j.id}
                cx={j.x}
                cy={j.y}
                r={5}
                fill="#0f766e"
                stroke="#5eead4"
                strokeWidth={2}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.22 + i * 0.06, type: "spring", stiffness: 320, damping: 16 }}
                style={{ transformOrigin: `${j.x}px ${j.y}px` }}
              />
            ))}
          </svg>

          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.55, duration: 0.35 }}
            className="absolute left-4 top-4 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 backdrop-blur"
          >
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Trunk lean</p>
            <p className="font-mono text-sm font-bold text-amber-300">8.4°</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.65, duration: 0.35 }}
            className="absolute right-4 top-4 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 backdrop-blur"
          >
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Hip flexion</p>
            <p className="font-mono text-sm font-bold text-teal-300">96°</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.75, duration: 0.35 }}
            className="absolute bottom-4 right-4 flex w-28 items-center gap-2 rounded-lg border border-white/15 bg-slate-800/90 p-2 backdrop-blur"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-700 text-[10px] font-bold text-white">
              DP
            </span>
            <span className="text-[10px] leading-tight text-slate-300">
              Dr. Pooja
              <br />
              <span className="text-slate-500">Specialist</span>
            </span>
          </motion.div>
        </div>
      </div>
    </SceneFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Step 3 — the plan you leave with                                    */
/* ------------------------------------------------------------------ */

const EXERCISES = [
  { name: "Chin tuck — seated", dose: "3 × 10", done: true },
  { name: "Thoracic extension over chair", dose: "3 × 8", done: true },
  { name: "Glute bridge — bed", dose: "3 × 12", done: true },
  { name: "Standing hip hinge", dose: "2 × 10", done: false },
];

export function PlanScene() {
  const completed = EXERCISES.filter((e) => e.done).length;
  const ratio = completed / EXERCISES.length;
  const circumference = 2 * Math.PI * 26;

  return (
    <SceneFrame>
      <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-display text-sm font-bold text-slate-900">Your home plan</p>
            <p className="text-xs text-slate-500">Week 1 · built around your room, chair and bed</p>
          </div>
          <div className="relative h-16 w-16 shrink-0">
            <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
              <circle cx={32} cy={32} r={26} fill="none" stroke="#e2e8f0" strokeWidth={6} />
              <motion.circle
                cx={32} cy={32} r={26} fill="none" stroke="#0d9488" strokeWidth={6}
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: circumference * (1 - ratio) }}
                transition={{ duration: 1.1, ease: EASE, delay: 0.3 }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-900">
              {completed}/{EXERCISES.length}
            </span>
          </div>
        </div>

        <div className="mt-5 space-y-2.5">
          {EXERCISES.map((ex, i) => (
            <motion.div
              key={ex.name}
              variants={rise}
              initial="hidden"
              animate="show"
              custom={i + 1}
              className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                <i className="fa-solid fa-person-walking text-sm" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-slate-800">
                  {ex.name}
                </span>
                <span className="text-[11px] text-slate-500">{ex.dose}</span>
              </span>
              {ex.done ? (
                <motion.i
                  className="fa-solid fa-circle-check text-teal-600"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.4 + i * 0.1, type: "spring", stiffness: 320, damping: 15 }}
                />
              ) : (
                <span className="h-4 w-4 rounded-full border-2 border-slate-200" />
              )}
            </motion.div>
          ))}
        </div>

        <motion.div
          variants={rise}
          initial="hidden"
          animate="show"
          custom={6}
          className="mt-auto flex items-center gap-2 rounded-xl bg-teal-50 px-4 py-3 text-xs text-teal-900"
        >
          <i className="fa-solid fa-rotate text-teal-600" />
          Reviewed and adjusted at every follow-up session.
        </motion.div>
      </div>
    </SceneFrame>
  );
}
