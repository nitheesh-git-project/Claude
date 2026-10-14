"use client";

import { AnimatePresence, motion } from "motion/react";
import { TUTORIAL_FIXTURES as F } from "@/lib/tutorial";
import {
  BodyMap,
  Chip,
  EASE,
  FeedRow,
  Field,
  Frame,
  ProgressChart,
  SPRING,
  Stepper,
  TapButton,
  Typed,
  usePhase,
} from "./scenePrimitives";

// Swaps one state for the next. The exit is quick so a "wait" swap never
// leaves the card visibly empty between two states.
const swap = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: EASE } },
  exit: { opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.15 } },
};

export function TherapistFeedScene() {
  const phase = usePhase(4, 1500, 2);
  return (
    <Frame title="Home">
      <p className="mb-2 text-[11px] font-semibold text-slate-700">Good evening, {F.therapistShort}</p>
      <div className="space-y-2">
        <FeedRow icon="fa-clipboard-question" tone="warn" title={`Onboarding needed - ${F.patient}`} detail="Their Health Profile stays locked to them until it is done." needsYou highlight={phase === 0} />
        <FeedRow icon="fa-calendar-check" tone="good" title={`Video session booked with ${F.patient}`} detail={F.when} highlight={phase === 1} delay={0.1} />
        <FeedRow icon="fa-clipboard-check" tone="warn" title="Video session finished - mark it complete" detail="Mon 7 Oct, 6:00 PM" needsYou highlight={phase === 2} delay={0.2} />
        <FeedRow icon="fa-indian-rupee-sign" tone="good" title="Payout of ₹5,400 sent" highlight={phase === 3} delay={0.3} />
      </div>
    </Frame>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOTS = ["9-1", "4-8"];

export function TherapistAvailabilityScene() {
  const phase = usePhase(3, 1900, 2);
  const filled = (d: number, s: number) => (phase >= 1 ? d < 5 || (d === 5 && s === 0) : d < 2);
  const onLeave = phase === 2;
  return (
    <Frame title="Availability" icon="fa-calendar-week">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-800">Weekly hours</span>
        <span className="flex items-center gap-1.5 text-[10px] text-slate-600">
          On leave
          <motion.span className={`relative inline-flex h-4 w-7 rounded-full ${onLeave ? "bg-amber-500" : "bg-slate-300"}`} layout>
            <motion.span className="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow" initial={false} animate={{ left: onLeave ? 14 : 2 }} transition={SPRING} />
          </motion.span>
        </span>
      </div>
      <motion.div className="grid grid-cols-7 gap-1" animate={{ opacity: onLeave ? 0.35 : 1 }}>
        {DAYS.map((d, di) => (
          <div key={d} className="space-y-1">
            <span className="block text-center text-[9px] font-semibold text-slate-500">{d}</span>
            {SLOTS.map((s, si) => (
              <motion.span
                key={s}
                initial={false}
                animate={{ backgroundColor: filled(di, si) ? "#0d9488" : "#f1f5f9", scale: filled(di, si) ? 1 : 0.95 }}
                transition={{ ...SPRING, delay: (di * 2 + si) * 0.04 }}
                className={`flex h-7 items-center justify-center rounded-md text-[8px] font-semibold ${filled(di, si) ? "text-white" : "text-slate-400"}`}
              >
                {s}
              </motion.span>
            ))}
          </div>
        ))}
      </motion.div>
      <AnimatePresence>
        {onLeave && (
          <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 text-center">
            <Chip tone="warn" icon="fa-plane-departure">On leave until Sun 20 Oct - no new sessions</Chip>
          </motion.p>
        )}
      </AnimatePresence>
    </Frame>
  );
}

export function TherapistSessionScene() {
  const phase = usePhase(4, 1800, 2);
  return (
    <Frame title="Sessions" icon="fa-calendar-check">
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-900">{F.patient}</p>
            <p className="text-[10px] text-slate-500">Video session · {F.when}</p>
          </div>
          <AnimatePresence mode="wait">
            <motion.span key={phase >= 2 ? "done" : "conf"} {...swap}>
              {phase >= 2 ? <Chip tone="good" icon="fa-check">Completed</Chip> : <Chip tone="brand">Confirmed</Chip>}
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="mt-3 flex min-h-[30px] justify-end gap-2">
          {phase === 0 && <TapButton glow icon="fa-video">Join</TapButton>}
          {phase === 1 && <TapButton tapping icon="fa-check">Mark complete</TapButton>}
        </div>
        <AnimatePresence>
          {phase >= 2 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.4, ease: EASE }} className="overflow-hidden">
              <Field label="Session note (clinicians only)" active={phase === 2}>
                <Typed text="Lumbar flexion improved. Continue core work; review in 3 days." start={phase >= 2} speed={22} />
              </Field>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Frame>
  );
}

export function TherapistTriageScene() {
  const phase = usePhase(4, 1600, 3);
  const qs = [
    ["How old is the patient?", "18 to 64"],
    ["What brought them in?", "A long-standing ache with no clear cause"],
    ["Any of these present?", "None of these"],
  ];
  return (
    <Frame title={`${F.patient} · Health profile`} icon="fa-file-medical">
      <div className="space-y-1.5">
        {qs.map(([q, a], i) => (
          <div key={q} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
            <span className="text-[10px] text-slate-600">{q}</span>
            <AnimatePresence>
              {phase > i && (
                <motion.span initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={SPRING}>
                  <Chip tone="brand">{a}</Chip>
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
      <AnimatePresence>
        {phase >= 3 && (
          <motion.div initial={{ opacity: 0, y: 12, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING} className="mt-2.5 rounded-xl border border-teal-300 bg-teal-50 p-2.5">
            <p className="text-[11px] font-semibold text-teal-900"><i className="fa-solid fa-wand-magic-sparkles mr-1" aria-hidden="true" />Suggested: Orthopaedic</p>
            <p className="mt-0.5 text-[10px] text-teal-800">Because: a musculoskeletal complaint with no neurological signs.</p>
            <div className="mt-2 flex gap-2">
              <TapButton tapping>Use Orthopaedic</TapButton>
              <TapButton variant="secondary">Choose another</TapButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Frame>
  );
}

export function TherapistIntakeScene() {
  const phase = usePhase(9, 650, 4);
  const qs = [
    ["Main issue", F.condition],
    ["How long", "About 3 months"],
    ["Severity now", "6 / 10"],
    ["Where it hurts", "Lower back"],
    ["Worse when", "Sitting long"],
    ["What helps", "Walking, heat"],
    ["Anything else", "Desk job"],
  ];
  const done = Math.min(phase, 7);
  return (
    <div className="grid w-full gap-3 sm:grid-cols-[1.5fr_1fr]">
      <Frame title="Orthopaedic · 7 questions" icon="fa-bone">
        <div className="mb-2 h-1.5 overflow-hidden rounded bg-slate-100">
          <motion.div className="h-full bg-teal-600" initial={false} animate={{ width: `${(done / 7) * 100}%` }} transition={{ duration: 0.4, ease: EASE }} />
        </div>
        <div className="space-y-1">
          {qs.map(([q, a], i) => (
            <div key={q} className="flex items-center justify-between rounded-md px-1.5 py-1 text-[10px] odd:bg-slate-50">
              <span className="text-slate-500">{q}</span>
              <AnimatePresence>{i < done && <motion.span initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={SPRING} className="font-medium text-slate-800">{a}</motion.span>}</AnimatePresence>
            </div>
          ))}
        </div>
      </Frame>
      <motion.div layout className="flex flex-col justify-center rounded-2xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-900/5">
        <p className="mb-2 text-center text-[9px] font-bold uppercase tracking-wide text-slate-400">What {F.patientShort} sees</p>
        {/* Keyed rather than wait-mode: the swap is a fade-in of the new
            state, so the panel is never empty between the two. */}
        {phase < 8 ? (
          <motion.div key="lock" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={SPRING} className="text-center">
            <i className="fa-solid fa-lock text-xl text-slate-300" aria-hidden="true" />
            <p className="mt-1 text-[10px] text-slate-500">Health profile locked</p>
          </motion.div>
        ) : (
          <motion.div key="ready" initial={{ opacity: 0, scale: 0.9, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={SPRING}>
            <FeedRow icon="fa-circle-check" tone="good" title="Your health profile is ready" highlight />
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

export function TherapistExamScene() {
  const phase = usePhase(4, 1600, 2);
  const points = [
    { x: 50, y: 72, level: phase >= 2 ? 4 : 7 },
    ...(phase >= 1 ? [{ x: 56, y: 96, level: 3 }] : []),
  ];
  return (
    <div className="grid w-full gap-3 sm:grid-cols-2">
      <Frame title="Pain Map · exam" icon="fa-person">
        <div className="flex items-center gap-3">
          <div className="h-36 w-20 shrink-0"><BodyMap points={points} /></div>
          <div className="flex-1 space-y-2">
            <p className="text-[10px] font-semibold text-slate-700">Lower back</p>
            <div className="h-1.5 rounded bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500">
              <motion.span className="relative -top-1 block h-3.5 w-3.5 rounded-full border-2 border-white bg-slate-800 shadow" initial={false} animate={{ left: `${(phase >= 2 ? 40 : 70) - 4}%` }} transition={SPRING} style={{ position: "relative" }} />
            </div>
            <p className="text-[10px] text-slate-500">Pain {phase >= 2 ? 4 : 7} / 10</p>
          </div>
        </div>
      </Frame>
      <Frame title="Progress" icon="fa-chart-line">
        <p className="text-[10px] font-semibold text-slate-700">Are they getting better?</p>
        <div className="h-28"><ProgressChart values={[7, 6, 4, 3]} shown={phase >= 3 ? 4 : 3} /></div>
        <p className="text-center text-[9px] text-slate-500">One point per exam</p>
      </Frame>
    </div>
  );
}

export function TherapistRecommendScene() {
  const phase = usePhase(4, 1800, 2);
  return (
    <div className="grid w-full gap-3 sm:grid-cols-[1.4fr_1fr]">
      <Frame title="Recommend a programme" icon="fa-notes-medical">
        <Field label="Programme">{F.programme}</Field>
        <div className="mt-2"><Field label="Why">Core strengthening; flare-ups when sitting</Field></div>
        <div className="mt-2.5 flex items-center justify-end">
          <AnimatePresence mode="wait">
            <motion.span key={phase === 0 ? "btn" : "chip"} {...swap}>
              {phase === 0 ? <TapButton tapping icon="fa-paper-plane">Send to the clinic</TapButton> : <Chip tone={phase >= 2 ? "good" : "info"}>{phase >= 2 ? "Approved by the clinic" : "With the clinic for review"}</Chip>}
            </motion.span>
          </AnimatePresence>
        </div>
      </Frame>
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-900/5">
        <Stepper steps={["You recommend", "Clinic reviews & prices", `${F.patientShort} decides`, "Sessions ready to book"]} current={phase} />
        <AnimatePresence>
          {phase === 3 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="mt-2">
              <FeedRow icon="fa-circle-check" tone="good" title={`${F.patientShort} accepted your recommendation`} highlight />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function TherapistUpdatesScene() {
  const phase = usePhase(4, 1800, 2);
  return (
    <Frame title={`${F.patient} · Health profile`} icon="fa-file-medical">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-2.5">
          <p className="text-[9px] font-bold uppercase text-slate-500">On the record</p>
          <AnimatePresence mode="wait">
            <motion.p key={phase >= 3 ? "new" : "old"} {...swap} className="mt-1 text-[11px] text-slate-800">
              Severity now: <strong>{phase >= 3 ? "4 / 10" : "6 / 10"}</strong>
            </motion.p>
          </AnimatePresence>
        </div>
        <div className="rounded-xl border border-dashed border-amber-300 p-2.5">
          <p className="text-[9px] font-bold uppercase text-amber-700">Change sent</p>
          <AnimatePresence>
            {phase >= 1 && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={SPRING} className="mt-1 space-y-1">
                <p className="text-[11px] text-slate-800">Severity now: <strong>4 / 10</strong></p>
                {phase < 3 ? <Chip tone="warn" icon="fa-hourglass-half">Waiting for the clinic to approve</Chip> : <Chip tone="good" icon="fa-check">Approved</Chip>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="mt-2.5">
        <FeedRow icon="fa-key" tone={phase >= 3 ? "good" : "info"} title={phase >= 3 ? "Edit access approved" : "Edit access requested"} detail={phase >= 3 ? "You can edit this record now." : "Waiting on the clinic to approve it. You can already read this patient's record."} highlight={phase === 2} />
      </div>
    </Frame>
  );
}

export function TherapistEarningsScene() {
  const phase = usePhase(5, 1500, 2);
  const rows = Math.min(phase + 1, 3);
  const total = ["₹1,079", "₹2,158", "₹3,237"][rows - 1];
  return (
    <Frame title="Earnings" icon="fa-chart-line">
      <div className="space-y-1.5">
        {Array.from({ length: rows }).map((_, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={SPRING} className="flex items-center justify-between rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px]">
            <span className="text-slate-600">Completed · {F.patientShort} · {["Mon 7 Oct", "Thu 10 Oct", "Mon 14 Oct"][i]}</span>
            <span className="text-slate-500">{F.price} × {F.share}% = <strong className="text-slate-900">₹1,079</strong></span>
          </motion.div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2">
        <span className="text-[11px] text-slate-600">Owed to you <motion.strong key={total} initial={{ scale: 1.3, color: "#0d9488" }} animate={{ scale: 1, color: "#0f172a" }} className="ml-1 inline-block text-sm">{total}</motion.strong></span>
        <AnimatePresence mode="wait">
          <motion.span key={phase < 3 ? "a" : phase === 3 ? "b" : "c"} {...swap}>
            {phase < 3 && <TapButton tapping={phase === 2} icon="fa-money-bill-transfer">Request payout</TapButton>}
            {phase === 3 && <Chip tone="warn" icon="fa-hourglass-half">Payout pending</Chip>}
            {phase === 4 && <Chip tone="good" icon="fa-check">Payout sent</Chip>}
          </motion.span>
        </AnimatePresence>
      </div>
    </Frame>
  );
}

export function TherapistProfileScene() {
  const phase = usePhase(2, 2200, 1);
  return (
    <div className="grid w-full gap-3 sm:grid-cols-2">
      <Frame title="Public details" icon="fa-address-card">
        <div className="space-y-1.5">
          <Field label="Languages">English, Kannada, Hindi</Field>
          <Field label="Bio" active={phase === 0}><strong>Back pain specialist</strong> with ten years in clinic.</Field>
        </div>
        <p className="mt-2"><Chip tone="good" icon="fa-bolt">Saves straight away</Chip></p>
      </Frame>
      <Frame title="Credentials" icon="fa-graduation-cap">
        <div className="space-y-1.5">
          <Field label="Qualifications">MPT (Ortho), KSCP Reg 44821</Field>
          <Field label="Specialist in" active={phase === 1}>Orthopaedic</Field>
        </div>
        <p className="mt-2">
          <AnimatePresence mode="wait">
            <motion.span key={phase} {...swap} className="inline-block">
              {phase === 0 ? <Chip tone="neutral" icon="fa-user-shield">Needs clinic approval</Chip> : <Chip tone="warn" icon="fa-hourglass-half">Pending Review</Chip>}
            </motion.span>
          </AnimatePresence>
        </p>
      </Frame>
    </div>
  );
}
