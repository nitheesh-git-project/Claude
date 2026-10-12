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

export function PatientFeedScene() {
  const phase = usePhase(4, 1500, 2);
  return (
    <Frame title="Home">
      <p className="mb-2 text-[11px] font-semibold text-slate-700">Good evening, {F.patientShort}</p>
      <div className="space-y-2">
        <FeedRow icon="fa-credit-card" tone="warn" title="Payment not completed" detail="This session isn't booked until payment goes through." needsYou highlight={phase === 0} />
        <FeedRow icon="fa-calendar-check" tone="good" title={`Video session confirmed with ${F.therapist}`} detail={F.when} highlight={phase === 1} delay={0.1} />
        <FeedRow icon="fa-circle-check" tone="good" title="Your health profile is ready" detail="Your therapist has filled it in - you can read it and add to it now." highlight={phase === 2} delay={0.2} />
        <FeedRow icon="fa-layer-group" tone="info" title="Your therapist recommended a programme" detail={F.programme} highlight={phase === 3} delay={0.3} />
      </div>
    </Frame>
  );
}

export function PatientBookScene() {
  const phase = usePhase(5, 1500, 2);
  const steps = ["What for", "How", "When", "Pay"];
  return (
    <Frame title="Book a Session" icon="fa-plus">
      <div className="mb-3 flex gap-1">
        {steps.map((s, i) => (
          <div key={s} className="flex-1">
            <div className="h-1 overflow-hidden rounded bg-slate-100">
              <motion.div className="h-full bg-teal-600" initial={false} animate={{ width: phase > i ? "100%" : phase === i ? "50%" : "0%" }} transition={{ duration: 0.5, ease: EASE }} />
            </div>
            <span className={`mt-1 block text-[9px] ${phase >= i ? "font-semibold text-teal-700" : "text-slate-400"}`}>{s}</span>
          </div>
        ))}
      </div>
      <div className="relative min-h-[150px]">
        <AnimatePresence mode="wait">
          {phase === 0 && (
            <motion.div key="what" {...swap} className="space-y-2">
              <p className="text-[11px] font-semibold text-slate-800">What would you like help with?</p>
              <div className="flex flex-wrap gap-1.5">
                {["Neck pain", F.condition, "Knee pain", "Sports injury"].map((c) => (
                  <span key={c} className={`rounded-full border px-2.5 py-1 text-[10px] ${c === F.condition ? "border-teal-600 bg-teal-50 font-semibold text-teal-800" : "border-slate-200 text-slate-600"}`}>
                    {c}
                  </span>
                ))}
              </div>
            </motion.div>
          )}
          {phase === 1 && (
            <motion.div key="how" {...swap} className="grid grid-cols-2 gap-2">
              {[
                { t: "Video session", i: "fa-video", on: true },
                { t: "Home visit", i: "fa-house-medical", on: false },
              ].map((o) => (
                <div key={o.t} className={`rounded-xl border p-3 text-center ${o.on ? "border-teal-600 bg-teal-50" : "border-slate-200"}`}>
                  <i className={`fa-solid ${o.i} text-lg ${o.on ? "text-teal-700" : "text-slate-400"}`} aria-hidden="true" />
                  <p className="mt-1 text-[11px] font-semibold text-slate-800">{o.t}</p>
                </div>
              ))}
            </motion.div>
          )}
          {phase === 2 && (
            <motion.div key="when" {...swap} className="space-y-2">
              <div className="flex gap-1.5">
                {["Sat 12", "Sun 13", "Mon 14", "Tue 15"].map((d) => (
                  <span key={d} className={`flex-1 rounded-lg border py-1.5 text-center text-[10px] ${d === "Mon 14" ? "border-teal-600 bg-teal-600 font-semibold text-white" : "border-slate-200 text-slate-600"}`}>
                    {d}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["10:00 AM", "1:00 PM", "6:00 PM", "7:00 PM"].map((t) => (
                  <span key={t} className={`rounded-lg border px-2 py-1 text-[10px] ${t === "6:00 PM" ? "border-teal-600 bg-teal-50 font-semibold text-teal-800" : "border-slate-200 text-slate-600"}`}>
                    {t}
                  </span>
                ))}
              </div>
            </motion.div>
          )}
          {phase >= 3 && (
            <motion.div key="pay" {...swap} className="space-y-2 rounded-xl border border-slate-200 p-3">
              <div className="flex justify-between text-[11px]"><span className="text-slate-600">Video session · {F.when}</span><span className="font-semibold">{F.price}</span></div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-600">Promo code</span>
                <Chip tone="good" icon="fa-tag">WELCOME10 applied</Chip>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                <span className="text-[11px] font-bold text-slate-900">₹1,619</span>
                {phase === 3 ? <TapButton tapping icon="fa-lock">Pay securely</TapButton> : <Chip tone="good" icon="fa-circle-check">Paid</Chip>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Frame>
  );
}

const JOURNEY = [
  { tone: "warn" as const, icon: "fa-credit-card", title: "Payment not completed", detail: "This session isn't booked until payment goes through." },
  { tone: "info" as const, icon: "fa-hourglass-half", title: "Video session waiting for a therapist", detail: "The clinic is assigning someone - you'll see the joining details here once it's confirmed." },
  { tone: "good" as const, icon: "fa-calendar-check", title: `Video session confirmed with ${F.therapist}`, detail: F.when },
  { tone: "good" as const, icon: "fa-video", title: "It's time - join your session", detail: "The Join button lights up shortly before it starts." },
  { tone: "good" as const, icon: "fa-clipboard-check", title: "Session completed", detail: "How was it? Rate your session." },
];

export function PatientJourneyScene({ stepId }: { stepId: string }) {
  const unpaid = stepId === "unpaid";
  const phase = usePhase(unpaid ? 3 : 5, 1900, 2);
  if (unpaid) {
    return (
      <Frame title="Sessions" icon="fa-calendar-check">
        <AnimatePresence mode="wait">
          {phase < 2 ? (
            <motion.div key="unpaid" {...swap} className="space-y-3">
              <FeedRow icon="fa-credit-card" tone="warn" title="Payment not completed" detail="This session isn't booked until payment goes through." needsYou highlight />
              <div className="flex justify-end">
                <TapButton tapping={phase === 1} icon="fa-arrow-right">Pay now</TapButton>
              </div>
            </motion.div>
          ) : (
            <motion.div key="resume" {...swap} className="space-y-2 rounded-xl border border-teal-200 bg-teal-50/50 p-3">
              <p className="text-[11px] font-semibold text-teal-800"><i className="fa-solid fa-rotate-right mr-1" aria-hidden="true" />Back at the last step - nothing to fill in again</p>
              <Field label="Session">Video session · {F.when}</Field>
              <Field label="Promo code">WELCOME10 <Chip tone="good">re-checked</Chip></Field>
              <div className="flex justify-end"><TapButton glow icon="fa-lock">Pay securely</TapButton></div>
            </motion.div>
          )}
        </AnimatePresence>
      </Frame>
    );
  }
  const s = JOURNEY[phase];
  return (
    <div className="grid w-full gap-3 sm:grid-cols-[1.4fr_1fr]">
      <Frame title="Sessions" icon="fa-calendar-check">
        <motion.div layout className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-400">{F.sessionCode}</span>
            <AnimatePresence mode="popLayout">
              <motion.span key={phase} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={SPRING}>
                <Chip tone={s.tone}>{["Unpaid", "Requested", "Confirmed", "Starting now", "Completed"][phase]}</Chip>
              </motion.span>
            </AnimatePresence>
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={phase} {...swap}>
              <FeedRow icon={s.icon} tone={s.tone} title={s.title} detail={s.detail} highlight />
            </motion.div>
          </AnimatePresence>
          <div className="mt-3 flex min-h-[30px] items-center justify-end gap-2">
            {phase === 0 && <TapButton tapping icon="fa-lock">Pay now</TapButton>}
            {phase === 2 && <TapButton disabled icon="fa-video">Tap to Join</TapButton>}
            {phase === 3 && <TapButton glow icon="fa-video">Tap to Join</TapButton>}
            {phase === 4 && (
              <span className="flex gap-0.5 text-amber-400" aria-label="Rated 5 stars">
                {[0, 1, 2, 3, 4].map((i) => (
                  <motion.i key={i} className="fa-solid fa-star text-sm" initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...SPRING, delay: 0.15 * i }} aria-hidden="true" />
                ))}
              </span>
            )}
          </div>
        </motion.div>
      </Frame>
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-900/5">
        <Stepper steps={["Paid", "Waiting for a therapist", "Confirmed", "Join", "Completed & rated"]} current={phase} />
      </div>
    </div>
  );
}

export function PatientSuggestedScene() {
  const phase = usePhase(3, 1800, 2);
  return (
    <Frame title="Suggested" icon="fa-lightbulb">
      <AnimatePresence mode="wait">
        {phase < 2 ? (
          <motion.div key="card" {...swap} className="rounded-xl border border-slate-200 p-3">
            <p className="text-[11px] font-semibold text-slate-900">{F.therapistShort} suggested your next session</p>
            <p className="mt-0.5 text-[10px] text-slate-500">Video session · {F.whenNext}</p>
            <div className="mt-3 flex gap-2">
              <TapButton tapping={phase === 1} icon="fa-check">Accept this time</TapButton>
              <TapButton variant="secondary">Decline</TapButton>
            </div>
          </motion.div>
        ) : (
          <motion.div key="booked" {...swap}>
            <FeedRow icon="fa-calendar-check" tone="good" title={`Video session confirmed with ${F.therapist}`} detail={F.whenNext} highlight />
            <p className="mt-2 text-center text-[10px] text-slate-500"><Chip tone="good" icon="fa-check">Booked</Chip></p>
          </motion.div>
        )}
      </AnimatePresence>
    </Frame>
  );
}

export function PatientProgrammeScene() {
  const phase = usePhase(4, 1700, 3);
  const booked = phase >= 3 ? 2 : 0;
  return (
    <Frame title="Programmes" icon="fa-layer-group">
      <AnimatePresence mode="wait">
        {phase === 0 && (
          <motion.div key="rec" {...swap}>
            <FeedRow icon="fa-layer-group" tone="info" title="Your therapist recommended a programme" detail={F.programme} needsYou highlight />
          </motion.div>
        )}
        {phase === 1 && (
          <motion.div key="offer" {...swap} className="rounded-xl border border-slate-200 p-3">
            <p className="text-[11px] font-semibold text-slate-900">{F.programme}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">Recommended by {F.therapist} · checked by the clinic</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[12px] font-bold text-slate-900">{F.programmePrice}</span>
              <TapButton tapping icon="fa-check">Accept &amp; pay</TapButton>
            </div>
          </motion.div>
        )}
        {phase >= 2 && (
          <motion.div key="book" {...swap} className="space-y-2">
            <FeedRow icon="fa-calendar-plus" tone="warn" title={`${6 - booked} sessions still to book`} detail={`${F.programme} - you've paid for these. Pick your times whenever suits you.`} highlight />
            <div className="flex justify-center gap-1.5 pt-1">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <motion.span
                  key={i}
                  initial={false}
                  animate={{ scale: i < booked ? 1.1 : 1, backgroundColor: i < booked ? "#0d9488" : "#e2e8f0" }}
                  transition={{ ...SPRING, delay: i * 0.12 }}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white"
                >
                  {i < booked ? <i className="fa-solid fa-check" aria-hidden="true" /> : null}
                </motion.span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Frame>
  );
}

export function PatientPaymentsScene() {
  const phase = usePhase(2, 2400, 1);
  const rows = [
    { what: `Session ${F.sessionCode}`, amt: F.price, chip: <Chip tone="good" icon="fa-check">Paid</Chip> },
    { what: `Programme ${F.programmeCode}`, amt: F.programmePrice, chip: <Chip tone="good" icon="fa-check">Paid</Chip> },
  ];
  return (
    <Frame title="Payments" icon="fa-receipt">
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <motion.div key={r.what} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: i * 0.1 }} className="flex items-center justify-between rounded-lg border border-slate-200 px-2.5 py-2">
            <span className="text-[11px] text-slate-700">{r.what}</span>
            <span className="flex items-center gap-2">
              <span className="text-[11px] font-semibold">{r.amt}</span>
              {r.chip}
              <i className="fa-solid fa-file-arrow-down text-[11px] text-teal-700" aria-label="Receipt" />
            </span>
          </motion.div>
        ))}
        <motion.div layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: 0.2 }} className="rounded-lg border border-slate-200 px-2.5 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-700">Cancelled session SS0131</span>
            <span className="text-[11px] font-semibold">{F.price}</span>
          </div>
          <div className="mt-1.5">
            <AnimatePresence mode="wait">
              <motion.span key={phase} {...swap} className="inline-block">
                {phase === 0 ? (
                  <Chip tone="good" icon="fa-rotate-left">{F.price} refunded</Chip>
                ) : (
                  <Chip tone="warn" icon="fa-hand-holding-dollar">Refund delayed - our team is sending it by hand</Chip>
                )}
              </motion.span>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </Frame>
  );
}

export function PatientHealthLockedScene() {
  const phase = usePhase(4, 1500, 2);
  return (
    <Frame title="Health Profile" icon="fa-file-medical">
      <div className="space-y-2.5">
        <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-2.5">
          <motion.i className="fa-solid fa-lock mt-0.5 text-sky-700" aria-hidden="true" animate={{ rotate: [0, -12, 12, 0] }} transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 2 }} />
          <p className="text-[10px] leading-snug text-sky-900">Your therapist fills this in with you at your first session. Any scans or reports you already have can go here now.</p>
        </div>
        <div className="grid grid-cols-3 gap-1.5 opacity-50">
          {["Your condition", "Pain Map", "Progress"].map((t) => (
            <div key={t} className="rounded-lg border border-dashed border-slate-300 p-2 text-center text-[9px] text-slate-500">
              <i className="fa-solid fa-lock mb-0.5 block" aria-hidden="true" />
              {t}
            </div>
          ))}
        </div>
        <div className="rounded-xl border-2 border-dashed border-teal-300 bg-teal-50/40 p-2.5">
          <p className="text-[10px] font-semibold text-teal-800"><i className="fa-solid fa-cloud-arrow-up mr-1" aria-hidden="true" />Your reports and scans</p>
          <AnimatePresence>
            {phase >= 1 && (
              <motion.div initial={{ opacity: 0, y: -16, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING} className="mt-2 flex items-center gap-2 rounded-lg bg-white p-1.5 shadow-sm">
                <i className="fa-solid fa-file-pdf text-red-500" aria-hidden="true" />
                <span className="flex-1">
                  <span className="block text-[10px] font-semibold text-slate-800">MRI-lower-back.pdf</span>
                  <span className="mt-0.5 block h-1 overflow-hidden rounded bg-slate-100">
                    <motion.span className="block h-full bg-teal-600" initial={{ width: "0%" }} animate={{ width: phase >= 2 ? "100%" : "40%" }} transition={{ duration: 0.9, ease: EASE }} />
                  </span>
                </span>
                {phase >= 3 && <Chip tone="good" icon="fa-check">Uploaded</Chip>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Frame>
  );
}

export function PatientHealthReadyScene() {
  const phase = usePhase(4, 1800, 3);
  return (
    <Frame title="Health Profile" icon="fa-file-medical">
      <AnimatePresence mode="wait">
        {phase === 0 ? (
          <motion.div key="notice" {...swap} className="py-4">
            <FeedRow icon="fa-circle-check" tone="good" title="Your health profile is ready" detail="Your therapist has filled it in - you can read it and add to it now." highlight />
          </motion.div>
        ) : (
          <motion.div key="profile" {...swap} className="grid gap-2 sm:grid-cols-3">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING }} className={`space-y-1 rounded-xl border p-2 ${phase === 1 ? "border-teal-400 ring-2 ring-teal-400/30" : "border-slate-200"}`}>
              <p className="text-[9px] font-bold uppercase text-teal-700">Your condition</p>
              {[["Main issue", F.condition], ["How long", "About 3 months"], ["Worse when", "Sitting long"]].map(([k, v]) => (
                <p key={k} className="text-[10px] leading-tight"><span className="text-slate-500">{k}: </span><span className="font-medium text-slate-800">{v}</span></p>
              ))}
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.1 }} className={`rounded-xl border p-2 ${phase === 2 ? "border-teal-400 ring-2 ring-teal-400/30" : "border-slate-200"}`}>
              <p className="text-[9px] font-bold uppercase text-teal-700">Pain Map</p>
              <div className="mx-auto h-24 w-16">
                <BodyMap points={[{ x: 50, y: 72, level: 7 }, { x: 44, y: 95, level: 4 }]} />
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.2 }} className={`rounded-xl border p-2 ${phase === 3 ? "border-teal-400 ring-2 ring-teal-400/30" : "border-slate-200"}`}>
              <p className="text-[9px] font-bold uppercase text-teal-700">Are you getting better?</p>
              <div className="h-20">
                <ProgressChart values={[7, 6, 4, 3]} shown={phase === 3 ? 4 : 2} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Frame>
  );
}

export function PatientHealthUpdateScene() {
  const phase = usePhase(5, 1700, 2);
  return (
    <Frame title="Health Profile" icon="fa-file-medical">
      <div className="space-y-2.5">
        <Field label="What makes it worse?" active={phase === 0}>
          {phase === 0 ? <Typed text="Sitting long, bending forward" /> : "Sitting long, bending forward"}
        </Field>
        <div className="flex items-center justify-between">
          <AnimatePresence mode="wait">
            <motion.span key={phase} {...swap}>
              {phase <= 1 && <span className="text-[10px] text-slate-500">Edited - not sent yet</span>}
              {(phase === 2 || phase === 3) && <Chip tone="warn" icon="fa-hourglass-half">Waiting for the clinic to approve</Chip>}
              {phase === 4 && <Chip tone="good" icon="fa-circle-check">Health profile approved</Chip>}
            </motion.span>
          </AnimatePresence>
          {phase <= 1 && <TapButton tapping={phase === 1} icon="fa-paper-plane">Send</TapButton>}
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
          <div className="rounded-lg bg-slate-50 p-2">
            <p className="text-[9px] font-bold uppercase text-slate-500">Your therapist sees</p>
            <AnimatePresence mode="wait">
              <motion.p key={phase === 4 ? "new" : "old"} {...swap} className="text-[10px] text-slate-700">
                {phase === 4 ? "Sitting long, bending forward" : "Sitting long"}
              </motion.p>
            </AnimatePresence>
          </div>
          <div className="rounded-lg bg-amber-50/60 p-2">
            <p className="text-[9px] font-bold uppercase text-amber-700">If it needs a fix</p>
            <p className="text-[10px] text-slate-700">&ldquo;Came back with a note&rdquo; - fix and resend.</p>
          </div>
        </div>
      </div>
    </Frame>
  );
}

export function PatientProfileScene() {
  const phase = usePhase(3, 1700, 2);
  return (
    <Frame title="Edit Profile" icon="fa-user-pen">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Full name">{F.patient}</Field>
        <Field label="Phone" active={phase === 0}>+91 98XXX XX210</Field>
        <Field label="Email">priya@example.com</Field>
        <Field label="Password">••••••••</Field>
      </div>
      <AnimatePresence>
        {phase >= 1 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="mt-2.5 flex items-center gap-2 rounded-xl border border-slate-200 p-2">
            <i className="fa-solid fa-house text-teal-600" aria-hidden="true" />
            <span className="flex-1 text-[10px] text-slate-700"><span className="font-semibold">Home</span> · 12th Main, Indiranagar, 560038</span>
            {phase >= 2 && <Chip tone="good" icon="fa-check">Saved for home visits</Chip>}
          </motion.div>
        )}
      </AnimatePresence>
    </Frame>
  );
}
