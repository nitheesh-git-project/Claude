"use client";

import { motion } from "motion/react";

/**
 * The four "what this step actually looks like" scenes for How It Works.
 *
 * Every panel here mirrors a screen that exists in the app -- the booking
 * wizard, the intake pop-up, the session card, the health profile. That is
 * deliberate: the page used to illustrate a daily home-exercise tracker and
 * a set of range-of-motion measurements that this platform has never had,
 * which is a promise the product then has to break. If a scene below
 * changes, it is because the screen it draws changed.
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

function SceneCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 1 — choosing a mode, a slot and paying                         */
/* ------------------------------------------------------------------ */

const SLOTS = [
  "07:00", "08:30", "10:00", "11:30",
  "13:00", "14:30", "16:00", "17:30",
  "19:00", "20:30", "21:00", "22:30",
];
const SELECTED_SLOT = 5;
const UNAVAILABLE = new Set([1, 6, 10]);

export function BookingScene({ homeVisitEnabled = true }: { homeVisitEnabled?: boolean }) {
  return (
    <SceneFrame>
      <SceneCard>
        <motion.div variants={rise} initial="hidden" animate="show" custom={0}>
          <p className="font-display text-sm font-bold text-slate-900">
            {homeVisitEnabled ? "How would you like to be seen?" : "Choose your slot"}
          </p>
          {homeVisitEnabled && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <span className="flex items-center justify-center gap-2 rounded-lg border border-teal-600 bg-teal-600 px-3 py-2 text-xs font-semibold text-white">
                <i className="fa-solid fa-video" /> Video call
              </span>
              <span className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">
                <i className="fa-solid fa-house-medical" /> Home visit
              </span>
            </div>
          )}
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-800">
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

        <motion.p
          variants={rise}
          initial="hidden"
          animate="show"
          custom={7}
          className="mt-3 text-[11px] text-slate-500"
        >
          Only slots your therapist is actually free for, at least 12 hours away.
        </motion.p>

        <motion.div
          variants={rise}
          initial="hidden"
          animate="show"
          custom={8}
          className="mt-auto flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3"
        >
          <span className="text-xs font-medium text-slate-300">UPI · card · netbanking</span>
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
      </SceneCard>
    </SceneFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Step 2 — the intake pop-up and the reports you attach               */
/* ------------------------------------------------------------------ */

const INTAKE_CHOICES = ["0-2 weeks", "2-8 weeks", "3-6 months", "Over a year"];

// Accepts the flag every scene is handed, though it has no mode-specific
// copy of its own -- StepScroller renders these interchangeably.
export function IntakeScene({}: { homeVisitEnabled?: boolean }) {
  return (
    <SceneFrame>
      <SceneCard>
        <motion.div variants={rise} initial="hidden" animate="show" custom={0}>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">
              Question 2 of 7
            </p>
            <span className="text-[11px] font-semibold text-slate-400">About 2 minutes</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <motion.div
              className="h-full rounded-full bg-teal-600"
              initial={{ width: "0%" }}
              animate={{ width: "28%" }}
              transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}
            />
          </div>
        </motion.div>

        <motion.div variants={rise} initial="hidden" animate="show" custom={1} className="mt-5">
          <p className="font-display text-lg font-bold leading-snug text-slate-900">
            How long has this been going on?
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
            Why we ask: something three days old and something three years old
            are treated differently, even when they hurt the same.
          </p>
        </motion.div>

        <div className="mt-4 space-y-2">
          {INTAKE_CHOICES.map((choice, i) => (
            <motion.div
              key={choice}
              variants={rise}
              initial="hidden"
              animate="show"
              custom={2 + i}
              className={`rounded-xl border px-3 py-2.5 text-xs font-semibold ${
                i === 2
                  ? "border-teal-600 bg-teal-50 text-teal-800"
                  : "border-slate-200 text-slate-600"
              }`}
            >
              {choice}
            </motion.div>
          ))}
        </div>

        <motion.div
          variants={rise}
          initial="hidden"
          animate="show"
          custom={7}
          className="mt-auto rounded-xl border border-slate-200 p-3"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Reports on file
          </p>
          <div className="mt-2 flex items-center gap-2">
            <i className="fa-solid fa-file-pdf text-teal-600" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">
              MRI left knee
            </span>
            <span className="text-[10px] font-semibold text-slate-400">14 Jul</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <i className="fa-solid fa-vial text-teal-600" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">
              Blood test — vitamin D
            </span>
            <span className="text-[10px] font-semibold text-slate-400">2 Aug</span>
          </div>
        </motion.div>
      </SceneCard>
    </SceneFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Step 3 — the session itself                                         */
/* ------------------------------------------------------------------ */

export function SessionScene({ homeVisitEnabled = true }: { homeVisitEnabled?: boolean }) {
  return (
    <SceneFrame>
      <SceneCard>
        <motion.div variants={rise} initial="hidden" animate="show" custom={0}>
          <div className="flex items-center justify-between">
            <p className="font-display text-sm font-bold text-slate-900">Your next session</p>
            <span className="rounded-md bg-teal-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-teal-700">
              Confirmed
            </span>
          </div>
        </motion.div>

        <motion.div
          variants={rise}
          initial="hidden"
          animate="show"
          custom={1}
          className="mt-4 rounded-xl border border-slate-200 p-4"
        >
          <p className="font-display text-base font-bold text-slate-900">
            Tue, 26 Aug · 4:00 – 5:00 pm
          </p>
          <p className="mt-1 text-xs text-slate-500">
            60 minutes with Dr. Meera · session SS0184
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className="flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white">
              <i className="fa-solid fa-video" /> Join on Google Meet
            </span>
            <span className="text-[11px] text-slate-400">opens 15 min before</span>
          </div>
        </motion.div>

        <motion.div
          variants={rise}
          initial="hidden"
          animate="show"
          custom={2}
          className="mt-3 space-y-2"
        >
          {[
            ["fa-file-lines", "Your answers and reports, already read"],
            ["fa-hand", "Guided movement checks, area by area"],
            ["fa-comments", "In the language you picked when booking"],
          ].map(([icon, text], i) => (
            <motion.div
              key={text}
              variants={rise}
              initial="hidden"
              animate="show"
              custom={3 + i}
              className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2.5"
            >
              <i className={`fa-solid ${icon} text-teal-600`} />
              <span className="text-xs font-medium text-slate-700">{text}</span>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          variants={rise}
          initial="hidden"
          animate="show"
          custom={7}
          className="mt-auto flex items-center gap-2.5 rounded-xl bg-slate-900 px-4 py-3"
        >
          <i
            aria-hidden="true"
            className={`fa-solid ${homeVisitEnabled ? "fa-house-medical" : "fa-shield-halved"} text-teal-400`}
          />
          <span className="text-xs leading-snug text-slate-300">
            {homeVisitEnabled
              ? "Booked a home visit instead? Same hour, at your address — the travel fee is shown before you pay, never added afterwards."
              : "Cancel more than 24 hours ahead and the payment is refunded in full — the window is stated before you pay, never after."}
          </span>
        </motion.div>
      </SceneCard>
    </SceneFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Step 4 — what lands on your chart afterwards                        */
/* ------------------------------------------------------------------ */

const EXAM_ROWS = [
  { area: "Knee (left)", score: "6/10", band: "Moderate", width: "60%" },
  { area: "Lower back", score: "3/10", band: "Mild", width: "30%" },
];

export function ChartScene({}: { homeVisitEnabled?: boolean }) {
  return (
    <SceneFrame>
      <SceneCard>
        <motion.div variants={rise} initial="hidden" animate="show" custom={0}>
          <div className="flex items-center justify-between">
            <p className="font-display text-sm font-bold text-slate-900">Your health profile</p>
            <span className="rounded-md bg-teal-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-teal-700">
              Yours to keep
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Filled in by your therapist after the session — every area examined,
            worst first.
          </p>
        </motion.div>

        <div className="mt-4 space-y-2.5">
          {EXAM_ROWS.map((row, i) => (
            <motion.div
              key={row.area}
              variants={rise}
              initial="hidden"
              animate="show"
              custom={i + 1}
              className="rounded-xl border border-slate-200 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">{row.area}</span>
                <span className="text-xs font-bold text-teal-700">
                  {row.score} · {row.band}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-teal-500 to-amber-400"
                  initial={{ width: "0%" }}
                  animate={{ width: row.width }}
                  transition={{ duration: 0.9, ease: EASE, delay: 0.3 + i * 0.12 }}
                />
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          variants={rise}
          initial="hidden"
          animate="show"
          custom={4}
          className="mt-3 rounded-xl border border-teal-100 bg-teal-50/60 px-3 py-2.5"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">
            Are you getting better?
          </span>
          <svg viewBox="0 0 200 40" className="mt-2 h-9 w-full" preserveAspectRatio="none">
            <motion.path
              d="M0,6 L55,12 L110,20 L165,28 L200,33"
              fill="none"
              stroke="#0d9488"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.1, ease: EASE, delay: 0.5 }}
            />
            {[
              [0, 6], [55, 12], [110, 20], [165, 28], [200, 33],
            ].map(([cx, cy], i) => (
              <motion.circle
                key={i}
                cx={cx}
                cy={cy}
                r={3.5}
                fill="#0d9488"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.55 + i * 0.12, type: "spring", stiffness: 320, damping: 14 }}
              />
            ))}
          </svg>
          <p className="text-[10px] font-medium text-teal-700/80">
            Each dot is one examination. Lower is better.
          </p>
        </motion.div>

        <motion.div
          variants={rise}
          initial="hidden"
          animate="show"
          custom={6}
          className="mt-auto flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs text-slate-300"
        >
          <i className="fa-solid fa-file-pdf text-teal-400" />
          Download the whole record as a PDF whenever another doctor asks for it.
        </motion.div>
      </SceneCard>
    </SceneFrame>
  );
}
