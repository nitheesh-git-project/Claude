"use client";

import { AnimatePresence, motion } from "motion/react";
import { TUTORIAL_FIXTURES as F } from "@/lib/tutorial";
import { questionsForSpecialty, visibleQuestions } from "@/lib/conditionIntake";
import {
  CONDITION_SPECIALTIES,
  TRIAGE_QUESTIONS,
  suggestSpecialtyFromTriage,
  type ConditionSpecialty,
} from "@/lib/conditionSpecialty";
import { Chip, EASE, FeedRow, Frame, SPRING, Stepper, TapButton, usePhase } from "./scenePrimitives";

// The "How onboarding works" guide (src/lib/tutorial.ts, ONBOARDING_GUIDE).
//
// The question scenes read the real question sets and the real triage rule
// rather than copies of them: a guide that walks a therapist through
// questions the wizard no longer asks is worse than no guide, and this way
// a question added to intakeNeuro.ts shows up here with nothing to update.
// Answers are the tutorial's dummy patient, never anyone's own data.

const swap = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: EASE } },
  exit: { opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.15 } },
};

function specialty(key: ConditionSpecialty) {
  return CONDITION_SPECIALTIES.find((s) => s.key === key)!;
}

export function OnboardOverviewScene() {
  const phase = usePhase(5, 1500, 2);
  const unlocked = phase >= 4;
  return (
    <div className="grid w-full gap-3 sm:grid-cols-[1.3fr_1fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-900/5">
        <Stepper
          steps={[
            `${F.patientShort} is assigned to you`,
            `"Onboarding needed" on Home and her session`,
            "First session: four questions pick the condition type",
            "That type's own questions, with her",
            "Saved - her Health Profile opens",
          ]}
          current={phase}
          tone="warn"
        />
      </div>
      <Frame title={`What ${F.patientShort} sees`} icon="fa-file-medical">
        <AnimatePresence mode="wait">
          {unlocked ? (
            <motion.div key="ready" {...swap}>
              <FeedRow icon="fa-circle-check" tone="good" title="Your health profile is ready" highlight />
            </motion.div>
          ) : (
            <motion.div key="lock" {...swap} className="py-3 text-center">
              <i className="fa-solid fa-lock text-xl text-slate-300" aria-hidden="true" />
              <p className="mt-1 text-[10px] text-slate-500">Health profile locked until her therapist starts it</p>
            </motion.div>
          )}
        </AnimatePresence>
      </Frame>
    </div>
  );
}

export function OnboardPrepareScene() {
  const phase = usePhase(5, 1300, 3);
  const items: [string, string][] = [
    ["fa-file-medical", "Open her Health Profile from the session card"],
    ["fa-file-arrow-up", "Read any reports she uploaded"],
    ["fa-clock", "Keep the first ten minutes for the questions"],
    ["fa-comments", "Ask in her words - read the help lines aloud"],
  ];
  return (
    <div className="grid w-full gap-3 sm:grid-cols-[1fr_1.2fr]">
      <Frame title="Sessions" icon="fa-calendar-check">
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-2.5">
          <p className="text-[11px] font-semibold text-slate-900">{F.patient}</p>
          <p className="text-[10px] text-slate-500">Video session · {F.when}</p>
          <p className="mt-1.5">
            <Chip tone="warn" icon="fa-clipboard-question">Onboarding needed</Chip>
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <TapButton tapping={phase === 0} icon="fa-file-medical">Start onboarding</TapButton>
            <TapButton variant="ghost" icon="fa-circle-question">How onboarding works</TapButton>
          </div>
        </div>
      </Frame>
      <Frame title="Before the session" icon="fa-list-check">
        <ul className="space-y-1.5">
          {items.map(([icon, text], i) => {
            const done = phase > i;
            return (
              <li key={text} className="flex items-center gap-2 text-[10px]">
                <motion.span
                  initial={false}
                  animate={{ backgroundColor: done ? "#0d9488" : "#f1f5f9", scale: done ? 1 : 0.92 }}
                  transition={SPRING}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] ${done ? "text-white" : "text-slate-400"}`}
                >
                  <i className={`fa-solid ${done ? "fa-check" : icon}`} aria-hidden="true" />
                </motion.span>
                <span className={done ? "text-slate-800" : "text-slate-500"}>{text}</span>
              </li>
            );
          })}
        </ul>
      </Frame>
    </div>
  );
}

// Three dummy patients, one per condition type, so the triage scene shows
// every way the suggestion can land -- the suggestion itself comes from
// suggestSpecialtyFromTriage, the same rule the dialog runs.
const TRIAGE_CASES: { who: string; answers: Record<string, string> }[] = [
  {
    who: `${F.patientShort}, 34`,
    answers: {
      age_band: "18 to 64",
      presenting_problem: "A long-standing ache with no clear cause",
      neuro_signs: "None of these",
    },
  },
  {
    who: "Mr Iyer, 71",
    answers: {
      age_band: "65 or older",
      presenting_problem: "After a stroke, brain or spinal injury",
      neuro_signs: "Weakness on one side\nDifficulty with balance or walking",
    },
  },
  {
    who: "Aarav, 2",
    answers: {
      age_band: "Under 18",
      presenting_problem: "Delayed development or a condition present from birth or childhood",
      neuro_signs: "None of these",
      development_concern: "Yes",
    },
  },
];

export function OnboardTriageScene() {
  // Each case: questions fill in (4 beats), then the suggestion (1 beat).
  const phase = usePhase(TRIAGE_CASES.length * 5, 900, 2);
  const caseIndex = Math.floor(phase / 5);
  const beat = phase % 5;
  const c = TRIAGE_CASES[caseIndex];
  const suggestion = suggestSpecialtyFromTriage(c.answers);
  const def = specialty(suggestion.suggested);
  const shown = visibleQuestions(TRIAGE_QUESTIONS, c.answers);
  return (
    <Frame title={`Triage · ${c.who}`} icon="fa-clipboard-question">
      <AnimatePresence mode="wait">
        <motion.div key={caseIndex} {...swap}>
          <div className="space-y-1">
            {shown.map((q, i) => (
              <div key={q.key} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2 py-1">
                <span className="text-[10px] text-slate-600">{q.shortLabel ?? q.label}</span>
                <AnimatePresence>
                  {beat > i && (
                    <motion.span initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={SPRING} className="max-w-[60%] truncate text-right text-[10px] font-semibold text-slate-800">
                      {(c.answers[q.key] ?? "-").split("\n").join(", ")}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
          <div className="mt-2 min-h-[58px]">
            <AnimatePresence>
              {beat >= 4 && (
                <motion.div initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING} className="rounded-xl border border-teal-300 bg-teal-50 p-2">
                  <p className="text-[11px] font-semibold text-teal-900">
                    <i className={`fa-solid ${def.icon} mr-1`} aria-hidden="true" />
                    Suggested: {def.label}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-snug text-teal-800">Because: {suggestion.because}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="mt-1 flex justify-center gap-1.5" aria-hidden="true">
        {TRIAGE_CASES.map((t, i) => (
          <span key={t.who} className={`h-1.5 rounded-full transition-all ${i === caseIndex ? "w-4 bg-teal-600" : "w-1.5 bg-slate-300"}`} />
        ))}
      </div>
    </Frame>
  );
}

/** One condition type's question set, walked one question at a time: the
 *  list on the left fills in, the current question's help line -- the one
 *  written to be read aloud -- on the right. */
function QuestionSetScene({ kind }: { kind: ConditionSpecialty }) {
  // The questions asked with nothing answered yet: a follow-up that waits
  // on an answer (the Parkinson's ones) is not part of the walk-through.
  const questions = visibleQuestions(questionsForSpecialty(kind), {});
  const counted = questions.filter((q) => !q.excludeFromCount).length;
  const phase = usePhase(questions.length + 1, 1500, 2);
  const current = questions[Math.min(phase, questions.length - 1)];
  const finished = phase >= questions.length;
  const def = specialty(kind);
  return (
    <div className="grid w-full gap-3 sm:grid-cols-[1.25fr_1fr]">
      <Frame title={`${def.label} · ${counted} questions`} icon={def.icon}>
        <div className="mb-2 h-1.5 overflow-hidden rounded bg-slate-100">
          <motion.div className={`h-full ${def.accent}`} initial={false} animate={{ width: `${(Math.min(phase, questions.length) / questions.length) * 100}%` }} transition={{ duration: 0.4, ease: EASE }} />
        </div>
        <ol className="space-y-0.5">
          {questions.map((q, i) => (
            <li
              key={q.key}
              className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10px] ${
                i === phase ? "bg-teal-50 font-semibold text-slate-900" : i < phase ? "text-slate-600" : "text-slate-400"
              }`}
            >
              <i className={`fa-solid ${i < phase ? "fa-circle-check text-teal-600" : "fa-circle text-[6px]"} w-3 text-center`} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{q.shortLabel ?? q.label}</span>
              {q.excludeFromCount ? (
                <span className="text-[9px] text-slate-400">who answers</span>
              ) : q.required ? (
                <span className="text-[9px] text-amber-700">required</span>
              ) : null}
            </li>
          ))}
        </ol>
      </Frame>
      <div className="flex flex-col justify-center rounded-2xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-900/5">
        <AnimatePresence mode="wait">
          {finished ? (
            <motion.div key="done" {...swap} className="text-center">
              <Chip tone="good" icon="fa-check">All asked - save it</Chip>
              {kind === "ortho" && (
                <p className="mt-2 text-[10px] text-slate-600">
                  <i className="fa-solid fa-person mr-1 text-teal-600" aria-hidden="true" />
                  Then record the Pain Map exam - Done needs it.
                </p>
              )}
            </motion.div>
          ) : (
            <motion.div key={current.key} {...swap}>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Ask</p>
              <p className="mt-0.5 text-[11px] font-semibold leading-snug text-slate-900">{current.label}</p>
              {current.helpText && <p className="mt-1.5 text-[10px] leading-snug text-slate-500">{current.helpText}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export const OnboardOrthoScene = () => <QuestionSetScene kind="ortho" />;
export const OnboardNeuroScene = () => <QuestionSetScene kind="neuro" />;
export const OnboardPaedsScene = () => <QuestionSetScene kind="pediatrics" />;

export function OnboardSaveScene() {
  const phase = usePhase(4, 1600, 2);
  return (
    <div className="grid w-full gap-3 sm:grid-cols-2">
      <Frame title={`${F.patient} · Health profile`} icon="fa-file-medical">
        <div className="space-y-1.5 text-[10px]">
          <div className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1">
            <span className="text-slate-500">Main issue</span>
            <span className="font-medium text-slate-800">{F.condition}</span>
          </div>
          <div className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1">
            <span className="text-slate-500">How long</span>
            <span className="font-medium text-slate-800">About 3 months</span>
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-between">
          <AnimatePresence mode="wait">
            <motion.span key={phase === 0 ? "draft" : phase === 1 ? "save" : "live"} {...swap}>
              {phase === 0 && <Chip tone="neutral" icon="fa-floppy-disk">Draft saved</Chip>}
              {phase === 1 && <TapButton tapping icon="fa-check">Save</TapButton>}
              {phase >= 2 && <Chip tone="good" icon="fa-bolt">Live - no review</Chip>}
            </motion.span>
          </AnimatePresence>
        </div>
      </Frame>
      <div className="space-y-2">
        <Frame title="Your Home" icon="fa-house">
          <AnimatePresence mode="wait">
            {phase < 2 ? (
              <motion.div key="needed" {...swap}>
                <FeedRow icon="fa-clipboard-question" tone="warn" title={`Onboarding needed - ${F.patient}`} needsYou />
              </motion.div>
            ) : (
              <motion.p key="clear" {...swap} className="py-2 text-center text-[10px] text-slate-500">
                <i className="fa-solid fa-circle-check mr-1 text-teal-600" aria-hidden="true" />
                Nothing waiting on you
              </motion.p>
            )}
          </AnimatePresence>
        </Frame>
        <AnimatePresence>
          {phase >= 3 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
              <FeedRow icon="fa-circle-check" tone="good" title={`${F.patientShort}: "Your health profile is ready"`} highlight />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function OnboardChangeScene() {
  const phase = usePhase(4, 1600, 2);
  const from = specialty("ortho");
  const to = specialty("neuro");
  const def = phase >= 3 ? to : from;
  return (
    <Frame title={`${F.patient} · Health profile`} icon="fa-file-medical">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-2">
        <span className="text-[10px] text-slate-600">
          Recorded as{" "}
          <AnimatePresence mode="wait">
            <motion.span key={def.key} {...swap} className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${def.chipClass}`}>
              {def.label}
            </motion.span>
          </AnimatePresence>
        </span>
        <TapButton variant="secondary" tapping={phase === 0}>Change condition type</TapButton>
      </div>
      <div className="mt-2 min-h-[44px]">
        <AnimatePresence mode="wait">
          {phase === 1 && (
            <motion.p key="triage" {...swap} className="text-[10px] text-slate-600">
              <i className="fa-solid fa-clipboard-question mr-1 text-teal-600" aria-hidden="true" />
              The four questions again - new signs since the first session point to Neurological.
            </motion.p>
          )}
          {phase === 2 && (
            <motion.p key="set" {...swap} className="text-[10px] text-slate-600">
              <i className={`fa-solid ${to.icon} mr-1 text-violet-600`} aria-hidden="true" />
              Then the {to.label} questions.
            </motion.p>
          )}
          {phase >= 3 && (
            <motion.div key="saved" {...swap} className="flex flex-wrap gap-1.5">
              <Chip tone="good" icon="fa-bolt">Saved straight away</Chip>
              <Chip tone="neutral" icon="fa-clock-rotate-left">In Review History</Chip>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Frame>
  );
}
