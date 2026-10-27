"use client";

import { useState } from "react";
import ExercisePicture from "@/components/exercises/ExercisePicture";
import Spinner from "@/components/system/Spinner";
import { buildExerciseDisplay, type LiveDisplayText } from "@/lib/assessmentRun";
import { exerciseByKey } from "@/lib/exerciseLibrary";
import { doseText, type CorrectionReason, type TeachingEvent } from "@/lib/exercisePlan";
import type { CockpitFailure } from "@/lib/cockpit";
import type { ProtocolStep, SessionProtocol } from "@/lib/sessionProtocols";
import { postTeach } from "@/components/therapist/assessment/api";
import {
  COACHING_CUE_OPTIONS,
  MARK_BUTTONS,
  NOT_ATTEMPTED_OPTIONS,
  correctionBody,
  exerciseProgress,
  latestMarksByKey,
  markBody,
  markText,
  nextUnmarked,
  type MarkChoice,
} from "@/lib/teachTool";
import type { TeachPlan } from "@/components/therapist/assessment/teach/TeachTool";
import FixMarkSheet from "@/components/therapist/assessment/teach/FixMarkSheet";

type Message = { tone: "ok" | "refused" | "unchecked" | "offline" | "wait"; text: string; fix?: string | null };

/**
 * Teaching one exercise at a time. The next thing to do is always the one big
 * button: Show the demo, then Your turn, then (the physiotherapist watching
 * on camera) ONE row of three marks. A mark that needs a reason or a cue asks
 * for exactly one, from a fixed list. The patient's screen follows; nothing on
 * it can be pressed. A mark, once made, is part of the record; a mistaken one
 * is fixed with "Fix this mark" (phase 7d-3) -- a new record after it, with a
 * fixed reason -- and the latest is what counts.
 */
export default function TeachingLoop({
  runId,
  protocol,
  step,
  plan,
  marks,
  setupReady,
  exertionBlocked,
  ensureSetup,
  onMark,
  onPreview,
  onChangePlan,
}: {
  runId: string;
  protocol: SessionProtocol;
  step: ProtocolStep;
  plan: TeachPlan;
  /** This run's marks and fixes on this plan; the latest per exercise counts. */
  marks: TeachingEvent[];
  setupReady: boolean;
  exertionBlocked: string | null;
  /** Records the ticked set-up on the run if it is not yet; null when it stands, else why not. */
  ensureSetup: () => Promise<CockpitFailure | null>;
  onMark: (event: TeachingEvent) => void;
  onPreview: (text: LiveDisplayText | null) => void;
  onChangePlan: () => void;
}) {
  const keys = plan.items.map((i) => i.exerciseKey);
  const byKey = latestMarksByKey(marks);
  const markedKeys = new Set(byKey.keys());
  const [selected, setSelected] = useState<number>(() => nextUnmarked(keys, markedKeys) ?? 0);
  const [shown, setShown] = useState<Record<string, "demo" | "go">>({});
  const [picking, setPicking] = useState<"needs_practice" | "not_attempted" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const key = keys[Math.min(selected, keys.length - 1)];
  const exercise = exerciseByKey(key);
  const item = plan.items.find((i) => i.exerciseKey === key);
  if (!exercise || !item) return null;
  const index = keys.indexOf(key);
  const mark = byKey.get(key) ?? null;
  const allDone = markedKeys.size >= keys.length;
  const phase = shown[key] ?? null;

  function fail(f: CockpitFailure) {
    setMessage({ tone: f.kind, text: f.message, fix: f.fix });
  }

  function previewDone(k: string) {
    const ex = exerciseByKey(k);
    const at = keys.indexOf(k);
    if (!ex || at < 0) return;
    const built = buildExerciseDisplay({ protocol, step, exercise: ex, phase: "done", index: at, total: keys.length });
    if (built.ok) onPreview(built.write.display);
  }

  async function show(which: "demo" | "go") {
    if (busy) return;
    setMessage(null);
    if (which === "go") {
      if (exertionBlocked) return setMessage({ tone: "refused", text: exertionBlocked });
      if (!setupReady) return setMessage({ tone: "refused", text: "The set-up above is not all ticked yet.", fix: "Tick each item, then try again." });
    }
    setBusy(which);
    try {
      if (which === "go") {
        const setup = await ensureSetup();
        if (setup) return fail(setup);
      }
      const r = await postTeach({ runId, exerciseKey: key, phase: which });
      if (!r.ok) return fail(r.failure);
      setShown((prev) => ({ ...prev, [key]: which }));
      if (r.data.display) onPreview(r.data.display.text);
      setMessage({ tone: "ok", text: which === "demo" ? `${exercise!.name} is on the patient's screen.` : "The patient's screen says Your turn." });
    } finally {
      setBusy(null);
    }
  }

  async function record(choice: MarkChoice, fix: CorrectionReason | null = null) {
    if (busy) return;
    setMessage(null);
    const doing = choice.outcome !== "not_attempted";
    if (doing) {
      if (exertionBlocked) return setMessage({ tone: "refused", text: exertionBlocked });
      if (!setupReady) return setMessage({ tone: "refused", text: "The set-up above is not all ticked yet.", fix: "Tick each item, then try again." });
    }
    setBusy("mark");
    try {
      if (doing) {
        const setup = await ensureSetup();
        if (setup) return fail(setup);
      }
      const r = await postTeach(fix ? correctionBody(runId, key, choice, fix) : markBody(runId, key, choice));
      if (!r.ok) return fail(r.failure);
      const event: TeachingEvent = r.data.event ?? {
        id: `local-${key}-${runId}${fix ? `-fix-${Date.now()}` : ""}`,
        kind: fix ? "correction" : "mark",
        correctsEventId: fix ? (mark?.id ?? null) : null,
        correctionReason: fix,
        runId,
        planId: plan.id,
        patientId: "",
        exerciseKey: key,
        outcome: choice.outcome,
        cueKey: "cueKey" in choice ? choice.cueKey : null,
        reasonKey: "reasonKey" in choice ? choice.reasonKey : null,
        helperPresent: false,
        actor: "",
        createdAt: new Date().toISOString(),
      };
      onMark(event);
      setPicking(null);
      if (fix) {
        setFixing(false);
        setMessage({ tone: "ok", text: `${exercise!.name} fixed: ${markText(event).toLowerCase()}. The first mark stays on the record.` });
        return;
      }
      previewDone(key);
      const after = new Set(markedKeys).add(key);
      const next = nextUnmarked(keys, after, index + 1);
      setMessage({
        tone: "ok",
        text: `${exercise!.name} marked: ${markText(event).toLowerCase()}.${next === null ? ` All ${keys.length} exercises are marked.` : ""}`,
      });
      if (next !== null) setSelected(next);
    } finally {
      setBusy(null);
    }
  }

  const primary = "bg-teal-700 text-white hover:bg-teal-800 border-transparent";
  const quiet = "bg-white text-slate-900 border-slate-300 hover:border-teal-500";
  const big =
    "inline-flex min-h-[56px] items-center justify-center gap-2 rounded-xl border px-4 text-lg font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
  const demoNext = !mark && phase === null;
  const goNext = !mark && phase === "demo";

  return (
    <div className="space-y-4" data-testid="teaching-loop">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-bold text-teal-900" data-testid="teach-progress">
          {exerciseProgress(index, keys.length)}
        </p>
        <button
          type="button"
          onClick={onChangePlan}
          disabled={!!busy}
          className="min-h-[44px] rounded-xl px-3 text-sm font-semibold text-slate-800 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-50"
        >
          Change the plan
        </button>
      </div>

      <ol className="flex flex-wrap gap-2" aria-label="Exercises in the plan">
        {keys.map((k, i) => {
          const m = byKey.get(k);
          const ex = exerciseByKey(k);
          return (
            <li key={k}>
              <button
                type="button"
                aria-current={i === index ? "step" : undefined}
                onClick={() => {
                  setSelected(i);
                  setPicking(null);
                  setFixing(false);
                  setMessage(null);
                }}
                data-testid={`teach-pill-${k}`}
                data-marked={m ? m.outcome : "no"}
                className={`inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-full border px-3.5 text-[15px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 ${
                  i === index ? "border-teal-700 bg-teal-700 text-white" : m ? "border-teal-300 bg-teal-50 text-slate-900" : "border-slate-300 bg-white text-slate-900 hover:border-teal-500"
                }`}
              >
                <span aria-hidden="true">{m ? "✓" : i + 1}</span>
                <span className="truncate">{ex?.name ?? k}</span>
                <span className="sr-only">{m ? `, marked: ${markText(m)}` : ", not marked yet"}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:flex-row sm:items-start" data-testid="teach-current">
        <div className="mx-auto w-40 shrink-0 sm:mx-0 sm:w-44">
          <ExercisePicture picture={exercise.picture} name={exercise.name} tone="light" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="font-display text-xl font-extrabold text-slate-900">{exercise.name}</h3>
          <p className="text-[15px] font-semibold text-slate-900" data-testid="teach-dose">
            {doseText(item.dose)}
          </p>
          {item.dose.note && <p className="text-sm text-slate-800">Note: {item.dose.note}</p>}
          <ol className="list-decimal space-y-0.5 pl-5 text-sm text-slate-800">
            {exercise.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          {exercise.needsHelper && (
            <p className="rounded-lg border-2 border-red-600 bg-red-50 px-3 py-2 text-sm font-semibold text-red-950">
              Another adult stands beside the patient for this one.
            </p>
          )}
        </div>
      </div>

      {mark ? (
        <div className="space-y-3" data-testid="teach-marked">
          <p className="rounded-xl border border-teal-300 bg-teal-50 px-4 py-3 text-base font-semibold text-slate-900">
            Marked: {markText(mark)}
          </p>
          {fixing ? (
            <FixMarkSheet
              exerciseName={exercise.name}
              current={mark}
              busy={busy === "mark"}
              onSave={(choice, reason) => void record(choice, reason)}
              onCancel={() => {
                setFixing(false);
                setMessage(null);
              }}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-sm text-slate-700">If this mark is wrong, fix it. The first mark stays on the record.</p>
              <button
                type="button"
                data-testid="teach-fix"
                disabled={!!busy}
                onClick={() => {
                  setMessage(null);
                  setFixing(true);
                }}
                className="min-h-[44px] rounded-xl border border-teal-700 bg-white px-4 text-[15px] font-bold text-teal-900 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:opacity-50"
              >
                Fix this mark
              </button>
            </div>
          )}
          {!allDone && !fixing && (
            <button
              type="button"
              className={`${big} ${primary} w-full`}
              onClick={() => setSelected(nextUnmarked(keys, markedKeys, index + 1) ?? index)}
              data-testid="teach-next"
            >
              Next exercise
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              data-testid="teach-demo"
              className={`${big} ${demoNext ? primary : quiet} flex-1 basis-[10rem]`}
              disabled={!!busy}
              onClick={() => void show("demo")}
            >
              {busy === "demo" && <Spinner />}
              Show the demo
            </button>
            <button
              type="button"
              data-testid="teach-go"
              className={`${big} ${goNext ? primary : quiet} flex-1 basis-[10rem]`}
              disabled={!!busy}
              onClick={() => void show("go")}
            >
              {busy === "go" && <Spinner />}
              Your turn
            </button>
          </div>

          <div role="group" aria-label="How did it go?" className="space-y-2">
            <p className="text-sm font-bold text-slate-900">How did it go?</p>
            <div className="grid grid-cols-3 gap-2">
              {MARK_BUTTONS.map((b) => {
                const needsTurn = b.outcome !== "not_attempted" && phase !== "go";
                const open = picking === b.outcome;
                return (
                  <button
                    key={b.outcome}
                    type="button"
                    data-testid={`teach-mark-${b.outcome}`}
                    aria-pressed={b.follow ? open : undefined}
                    disabled={!!busy || needsTurn}
                    title={needsTurn ? "Tap Your turn first" : undefined}
                    onClick={() => {
                      setMessage(null);
                      if (b.outcome === "performed_correctly") void record({ outcome: "performed_correctly" });
                      else setPicking(open ? null : (b.outcome as "needs_practice" | "not_attempted"));
                    }}
                    className={`flex min-h-[64px] items-center justify-center rounded-xl border px-2 text-center text-base font-bold leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 ${
                      open ? "border-teal-700 bg-teal-700 text-white" : phase === "go" || b.outcome === "not_attempted" ? "border-teal-700 bg-white text-teal-900 hover:bg-teal-50" : "border-slate-300 bg-white text-slate-900"
                    }`}
                  >
                    {busy === "mark" && b.outcome === "performed_correctly" ? <Spinner /> : b.label}
                  </button>
                );
              })}
            </div>
            {phase !== "go" && <p className="text-[13px] text-slate-700">Tap Your turn first, then watch them do it.</p>}
          </div>

          {picking && (
            <fieldset className="space-y-2 rounded-xl border border-slate-200 bg-white p-3" data-testid={`teach-pick-${picking}`}>
              <legend className="px-1 text-sm font-bold text-slate-900">{picking === "needs_practice" ? "Pick one thing to remind them." : "Why not?"}</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(picking === "needs_practice" ? COACHING_CUE_OPTIONS : NOT_ATTEMPTED_OPTIONS).map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    disabled={!!busy}
                    data-testid={`${picking === "needs_practice" ? "cue" : "reason"}-${o.key}`}
                    onClick={() =>
                      void record(
                        picking === "needs_practice"
                          ? { outcome: "needs_practice", cueKey: o.key as Extract<MarkChoice, { outcome: "needs_practice" }>["cueKey"] }
                          : { outcome: "not_attempted", reasonKey: o.key as Extract<MarkChoice, { outcome: "not_attempted" }>["reasonKey"] }
                      )
                    }
                    className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-left text-[15px] font-semibold text-slate-900 hover:border-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-50"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      )}

      {allDone && (
        <p className="rounded-xl border border-teal-300 bg-teal-50 px-4 py-3 text-base font-semibold text-teal-950" data-testid="teach-all-marked">
          All {keys.length} exercises are marked. Tap Save and next.
        </p>
      )}

      <div aria-live="polite" className="empty:hidden" data-testid="teach-message-region">
        {message && (
          <p
            role={message.tone === "ok" ? "status" : "alert"}
            data-testid="teach-message"
            data-tone={message.tone}
            className={`rounded-xl border px-4 py-3 text-[15px] ${
              message.tone === "ok"
                ? "border-slate-200 bg-white text-slate-900"
                : message.tone === "refused"
                  ? "border-red-200 bg-red-50 text-red-950"
                  : "border-amber-300 bg-amber-50 text-amber-950"
            }`}
          >
            <span className="font-semibold">{message.text}</span>
            {message.fix && <span className="mt-0.5 block font-bold">{message.fix}</span>}
          </p>
        )}
      </div>
    </div>
  );
}
