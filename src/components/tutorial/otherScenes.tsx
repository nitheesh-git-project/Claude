"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { TUTORIAL_FIXTURES as F, type TutorialRole } from "@/lib/tutorial";
import { Chip, EASE, FeedRow, Field, Frame, SPRING, Stepper, TapButton, Typed, usePhase } from "./scenePrimitives";

// Swaps one state for the next. The exit is quick so a "wait" swap never
// leaves the card visibly empty between two states.
const swap = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: EASE } },
  exit: { opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.15 } },
};

const NAV: Record<TutorialRole, { icon: string; label: string }[]> = {
  patient: [
    { icon: "fa-gauge-high", label: "Home" },
    { icon: "fa-plus", label: "Book" },
    { icon: "fa-calendar-check", label: "Sessions" },
    { icon: "fa-layer-group", label: "Programmes" },
    { icon: "fa-file-medical", label: "Health" },
  ],
  therapist: [
    { icon: "fa-gauge-high", label: "Home" },
    { icon: "fa-calendar-week", label: "Hours" },
    { icon: "fa-calendar-check", label: "Sessions" },
    { icon: "fa-file-medical", label: "Patients" },
    { icon: "fa-chart-line", label: "Earnings" },
  ],
  hospital: [
    { icon: "fa-gauge-high", label: "Home" },
    { icon: "fa-user-plus", label: "Refer" },
    { icon: "fa-list-check", label: "Referrals" },
    { icon: "fa-indian-rupee-sign", label: "Earnings" },
  ],
};

/** The dashboard assembling itself: the nav pops in, then the cards. */
export function WelcomeScene({ role }: { role: TutorialRole }) {
  const name = role === "patient" ? F.patientShort : role === "therapist" ? F.therapistShort : F.hospital;
  return (
    <div className="flex w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
      <div className="flex w-16 shrink-0 flex-col items-center gap-2 border-r border-slate-100 bg-slate-50 py-3">
        <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={SPRING} className="mb-1 flex h-8 w-8 items-center justify-center rounded-xl bg-teal-700 text-white">
          <i className="fa-solid fa-person-walking" aria-hidden="true" />
        </motion.span>
        {NAV[role].map((n, i) => (
          <motion.span key={n.label} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: 0.25 + i * 0.09 }} className={`flex w-12 flex-col items-center gap-0.5 rounded-lg py-1 text-[8px] ${i === 0 ? "bg-teal-50 text-teal-700" : "text-slate-500"}`}>
            <i className={`fa-solid ${n.icon} text-[11px]`} aria-hidden="true" />
            {n.label}
          </motion.span>
        ))}
      </div>
      <div className="flex-1 space-y-2.5 p-4">
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.7 }} className="font-display text-lg font-bold text-slate-900">
          Hi, {name}
        </motion.p>
        {[0, 1, 2].map((i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.9 + i * 0.12 }} className="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5">
            <span className={`h-7 w-7 rounded-lg ${["bg-amber-100", "bg-emerald-100", "bg-sky-100"][i]}`} />
            <span className="flex-1 space-y-1">
              <span className="block h-2 w-3/4 rounded bg-slate-200" />
              <span className="block h-2 w-1/2 rounded bg-slate-100" />
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** The (i) beside a page title, being tapped, opening its chapter. */
export function InfoButtonScene() {
  const reduce = useReducedMotion();
  const phase = usePhase(3, 1500, 2);
  return (
    <Frame title="Sessions" icon="fa-calendar-check">
      <div className="flex items-center gap-2">
        <span className="font-display text-base font-bold text-slate-900">Sessions</span>
        <motion.span
          animate={phase === 0 && !reduce ? { scale: [1, 1.25, 1] } : { scale: phase === 1 ? 0.9 : 1 }}
          transition={{ duration: 0.9, repeat: phase === 0 ? Infinity : 0 }}
          className="relative flex h-6 w-6 items-center justify-center rounded-full bg-teal-50 text-[11px] text-teal-700 ring-1 ring-teal-200"
        >
          <i className="fa-solid fa-info" aria-hidden="true" />
          {phase === 1 && <i className="fa-solid fa-hand-pointer absolute -bottom-4 -right-2 text-base text-slate-800" aria-hidden="true" />}
        </motion.span>
      </div>
      <div className="mt-2 space-y-1.5 opacity-60">
        <div className="h-8 rounded-lg bg-slate-100" />
        <div className="h-8 rounded-lg bg-slate-100" />
      </div>
      <AnimatePresence>
        {phase === 2 && (
          <motion.div initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING} className="-mt-14 ml-auto mr-auto w-4/5 rounded-xl border border-teal-200 bg-white p-2.5 shadow-xl">
            <p className="text-[9px] font-bold uppercase tracking-wide text-teal-700">Tour · Booking a session</p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-900">What happens after you pay</p>
            <div className="mt-1.5 flex justify-end"><TapButton>Next</TapButton></div>
          </motion.div>
        )}
      </AnimatePresence>
    </Frame>
  );
}

/** The ending: a tick drawing itself and a small burst. */
export function FinishScene() {
  const reduce = useReducedMotion();
  return (
    <div className="relative flex h-56 w-full items-center justify-center">
      {!reduce &&
        Array.from({ length: 14 }).map((_, i) => {
          const angle = (i / 14) * Math.PI * 2;
          return (
            <motion.span
              key={i}
              className={`absolute h-2 w-2 rounded-full ${["bg-teal-400", "bg-amber-400", "bg-sky-400", "bg-emerald-400"][i % 4]}`}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
              animate={{ x: Math.cos(angle) * 110, y: Math.sin(angle) * 80, opacity: [0, 1, 0], scale: [0.4, 1, 0.6] }}
              transition={{ duration: 1.4, delay: 0.5 + (i % 3) * 0.05, ease: "easeOut" }}
            />
          );
        })}
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING} className="flex h-28 w-28 items-center justify-center rounded-full bg-teal-600 shadow-2xl shadow-teal-600/30">
        <svg viewBox="0 0 52 52" className="h-14 w-14" aria-hidden="true">
          <motion.path d="M14 27 L23 36 L39 18" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, delay: 0.25, ease: EASE }} />
        </svg>
      </motion.div>
    </div>
  );
}

export function HospitalFeedScene() {
  const phase = usePhase(3, 1600, 2);
  return (
    <Frame title="Home">
      <p className="mb-2 text-[11px] font-semibold text-slate-700">{F.hospital}</p>
      <div className="space-y-2">
        <FeedRow icon="fa-hospital-user" tone="good" title={`Referral accepted - ${F.patient}`} highlight={phase === 0} />
        <FeedRow icon="fa-hospital-user" tone="warn" title="Referral waiting on the clinic - Rahul Mehta" highlight={phase === 1} delay={0.1} />
        <FeedRow icon="fa-hospital-user" tone="bad" title="Referral declined - Anil Kumar" highlight={phase === 2} delay={0.2} />
      </div>
    </Frame>
  );
}

export function HospitalReferScene() {
  const phase = usePhase(5, 1300, 2);
  return (
    <Frame title="Refer a Patient" icon="fa-user-plus">
      <AnimatePresence mode="wait">
        {phase < 4 ? (
          <motion.div key="form" {...swap} className="space-y-2">
            <Field label="Patient name" active={phase === 0}>{phase === 0 ? <Typed text={F.patient} /> : F.patient}</Field>
            <Field label="Phone" active={phase === 1}>{phase >= 1 ? (phase === 1 ? <Typed text="+91 98XXX XX210" /> : "+91 98XXX XX210") : ""}</Field>
            <Field label="Medical issue" active={phase === 2}>{phase >= 2 ? (phase === 2 ? <Typed text="Knee replacement 3 weeks ago" /> : "Knee replacement 3 weeks ago") : ""}</Field>
            <div className="flex justify-end"><TapButton tapping={phase === 3} icon="fa-paper-plane">Send referral</TapButton></div>
          </motion.div>
        ) : (
          <motion.div key="ok" {...swap} className="flex flex-col items-center py-6 text-center">
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={SPRING} className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <i className="fa-solid fa-check text-lg" aria-hidden="true" />
            </motion.span>
            <p className="mt-2 text-[12px] font-semibold text-slate-900">Referral sent</p>
            <p className="text-[10px] text-slate-500">The clinic takes it from here.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </Frame>
  );
}

const REFERRAL = ["Pending Review", "Therapist Assigned", "Registration Link Sent", "Registered"];

export function HospitalReferralsScene() {
  const phase = usePhase(4, 1700, 2);
  return (
    <div className="grid w-full gap-3 sm:grid-cols-[1.4fr_1fr]">
      <Frame title="Referrals" icon="fa-list-check">
        <motion.div layout className="flex items-center justify-between rounded-xl border border-slate-200 p-2.5">
          <span>
            <span className="block text-[11px] font-semibold text-slate-900">{F.patient}</span>
            <span className="block text-[10px] text-slate-500">Knee replacement 3 weeks ago</span>
          </span>
          <AnimatePresence mode="wait">
            <motion.span key={phase} {...swap}>
              <Chip tone={phase === 3 ? "good" : phase === 0 ? "warn" : "info"}>{REFERRAL[phase]}</Chip>
            </motion.span>
          </AnimatePresence>
        </motion.div>
        <div className="mt-2 flex flex-wrap gap-1.5 opacity-80">
          <Chip tone="bad">Declined - with the clinic&apos;s reason</Chip>
          <Chip tone="neutral">Withdrawn - you took it back</Chip>
        </div>
      </Frame>
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-900/5">
        <Stepper steps={REFERRAL} current={phase} />
      </div>
    </div>
  );
}

export function HospitalEarningsScene() {
  const phase = usePhase(3, 1500, 2);
  const rows = [
    [F.patient, "Mon 7 Oct", "₹1,799", "₹180"],
    ["Rahul Mehta", "Thu 10 Oct", "₹1,799", "₹180"],
    [F.patient, "Mon 14 Oct", "₹1,799", "₹180"],
  ];
  return (
    <Frame title="Earnings" icon="fa-indian-rupee-sign">
      <div className="space-y-1.5">
        {rows.slice(0, phase + 1).map(([p, d, fee, share], i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={SPRING} className="flex items-center justify-between rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px]">
            <span className="text-slate-600">{p} · {d}</span>
            <span className="text-slate-500">{fee} → your share <strong className="text-slate-900">{share}</strong></span>
          </motion.div>
        ))}
      </div>
      <p className="mt-2 text-right text-[11px] text-slate-600">Your share so far <strong className="text-slate-900">{["₹180", "₹360", "₹540"][phase]}</strong></p>
    </Frame>
  );
}

export function HospitalProfileScene() {
  const phase = usePhase(2, 2000, 1);
  return (
    <Frame title="Edit Profile" icon="fa-hospital">
      <div className="flex items-center gap-3">
        <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING} className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-200">
          <i className="fa-solid fa-hospital text-lg" aria-hidden="true" />
        </motion.span>
        <div className="grid flex-1 gap-1.5 sm:grid-cols-2">
          <Field label="Organisation">{F.hospital}</Field>
          <Field label="Contact me by" active={phase === 1}>{phase === 1 ? "WhatsApp" : "Email"}</Field>
        </div>
      </div>
    </Frame>
  );
}
