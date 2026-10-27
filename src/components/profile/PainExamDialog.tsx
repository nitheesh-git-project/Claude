"use client";

import { useId, useMemo, useState, useTransition } from "react";
import OverlayPortal from "@/components/system/OverlayPortal";
import { useDialogChrome } from "@/lib/useDialogChrome";
import { useRouter } from "@/lib/useRouter";
import { debugNowHeaders } from "@/lib/debugNow";
import {
  PAIN_MAP_REGIONS,
  getDefaultQuestionsForRegion,
  groupExamQuestions,
  latestAssessmentByRegionSide,
  mergeQuestionOverrides,
  painBand,
  PAIN_BAND_LABEL,
  formatPainOutOfTen,
  regionRequiresSide,
  type PainAssessmentRow,
  type PainMapRegionKey,
  type QuestionOverrideRow,
} from "@/lib/painMap";
import { painChangeWords, painPercentFromScore } from "@/lib/painScale";
import PainScaleButtons from "@/components/profile/PainScaleButtons";

const BAND_STYLE: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-700",
  mid: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
};

/**
 * Recording one region's exam findings, on a surface of its own.
 *
 * This replaces a card that showed a body map, a 17-item region dropdown
 * that duplicated it, and all twenty questions at once - roughly 1,500px of
 * form with nothing telling you which region you were answering about. The
 * region is now chosen by tapping the body map (or the chips in step one
 * here), and it stays in the dialog's header the whole time you type.
 *
 * Grouped rather than paced one-question-at-a-time: the patient fills their
 * intake once and needs gentleness, while a therapist fills this after every
 * session and needs speed. Same principle - never a wall of fields - with
 * the treatment each audience actually benefits from.
 */
export default function PainExamDialog({
  endpoint,
  patientId,
  assessments,
  overridesByRegion,
  initialRegion,
  initialSide,
  onClose,
}: {
  endpoint: string;
  patientId: string;
  assessments: PainAssessmentRow[];
  overridesByRegion: Record<string, QuestionOverrideRow[]>;
  initialRegion?: PainMapRegionKey | null;
  initialSide?: "left" | "right" | null;
  onClose: () => void;
}) {
  const [region, setRegion] = useState<PainMapRegionKey | null>(initialRegion ?? null);
  const [side, setSide] = useState<"left" | "right">(initialSide ?? "left");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // The overall pain, picked on the eleven 0-10 buttons and stored times
  // ten. Nothing is picked until someone taps: the old slider sat at 0 and
  // saved "no pain" for an area nobody had scored.
  const [painScore, setPainScore] = useState<number | null>(null);
  const painPercent = painScore === null ? null : painPercentFromScore(painScore);
  const painLabelId = useId();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const needsSide = region ? regionRequiresSide(region) : false;
  const regionDef = region ? PAIN_MAP_REGIONS.find((r) => r.key === region) ?? null : null;

  const grouped = useMemo(() => {
    if (!region) return [];
    return groupExamQuestions(
      mergeQuestionOverrides(
        getDefaultQuestionsForRegion(region),
        overridesByRegion[region] ?? []
      )
    );
  }, [region, overridesByRegion]);

  // What this region scored last time. Shown while recording, because the
  // whole reason these rows are append-only is to read a trend - and a
  // therapist comparing against last visit shouldn't have to close the form
  // to find the number.
  const previous = useMemo(() => {
    if (!region) return null;
    return (
      latestAssessmentByRegionSide(assessments).get(`${region}:${needsSide ? side : "na"}`) ?? null
    );
  }, [assessments, region, side, needsSide]);

  function pickRegion(next: PainMapRegionKey) {
    setRegion(next);
    setAnswers({});
    setPainScore(null);
  }

  function submit() {
    if (!region) return;
    if (painPercent === null) {
      setError("Choose the overall pain for this area, 0 to 10.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch(endpoint, {
        method: "POST",
        // The therapist route judges "has a session with them started" on
        // the debug bar's simulated clock, like the session card that
        // offered this exam -- see src/lib/debugClock.ts. Empty with no
        // simulation, and ignored by the admin route.
        headers: { "Content-Type": "application/json", ...debugNowHeaders() },
        body: JSON.stringify({
          patientId,
          region,
          side: needsSide ? side : undefined,
          answers: Object.entries(answers).map(([key, value]) => ({ key, value })),
          painPercent,
        }),
      });
      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not save this exam. Please try again.");
      }
    });
  }

  const backRegions = PAIN_MAP_REGIONS.filter((r) => r.view === "back");
  const frontRegions = PAIN_MAP_REGIONS.filter((r) => r.view === "front");

  const titleId = useId();
  // Escape, the focus trap and focus restore come from the shared hook
  // rather than being hand-rolled per dialog -- see useDialogChrome.
  const { panelRef, dialogProps } = useDialogChrome({ onClose: onClose, labelledBy: titleId });

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
        <div
          ref={panelRef}
          {...dialogProps}
          className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-teal-700">
                Recording an exam
              </p>
              <h2 id={titleId} className="font-display text-lg font-bold text-slate-900">
                {regionDef
                  ? `${regionDef.label}${needsSide ? ` - ${side}` : ""}`
                  : "Which area did you examine?"}
              </h2>
              {previous && (
                <p className="mt-1 text-xs text-slate-500">
                  Last time this area was{" "}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      BAND_STYLE[painBand(previous.pain_percent)] ?? BAND_STYLE.mid
                    }`}
                  >
                    {formatPainOutOfTen(previous.pain_percent)} ·{" "}
                    {PAIN_BAND_LABEL[painBand(previous.pain_percent)]}
                  </span>
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 text-slate-500 transition hover:text-slate-700"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {/* Region chips instead of the old 17-item <select>: grouped by the
                same Back/Front split as the body map, so picking one here and
                tapping one there are recognisably the same act. */}
            {!region ? (
              <div className="space-y-5">
                <p className="text-xs text-slate-500">
                  Pick the area you examined. You can also close this and tap the spot directly on the
                  body map.
                </p>
                {[
                  ["Back of the body", backRegions],
                  ["Front of the body", frontRegions],
                ].map(([title, list]) => (
                  <div key={title as string}>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      {title as string}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(list as typeof PAIN_MAP_REGIONS).map((r) => (
                        <button
                          key={r.key}
                          type="button"
                          onClick={() => pickRegion(r.key)}
                          className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-teal-400 hover:text-teal-700"
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setRegion(null)}
                    className="text-xs font-semibold text-teal-700 hover:underline"
                  >
                    ← Change area
                  </button>
                  {needsSide && (
                    <div className="inline-flex rounded-xl bg-slate-100 p-1">
                      {(["left", "right"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={side === s}
                          onClick={() => setSide(s)}
                          className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold capitalize transition ${
                            side === s
                              ? "bg-white text-slate-800 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500">
                  Nothing here is required - record what you checked and leave the rest. Saving adds a
                  new reading rather than editing the last one, so the patient sees a trend.
                </p>

                {grouped.map(({ group, questions }) => (
                  <section key={group.key}>
                    <h3 className="text-sm font-bold text-slate-800">{group.title}</h3>
                    <p className="mb-3 text-[11px] text-slate-500">{group.blurb}</p>
                    <div className="space-y-3">
                      {questions.map((q) => (
                        <div key={q.key}>
                          <label className="mb-1 block text-xs font-semibold text-slate-600">
                            {q.text}
                          </label>
                          {q.inputType === "select" || q.inputType === "yes_no" ? (
                            <div className="flex flex-wrap gap-2">
                              {(q.inputType === "yes_no" ? ["Yes", "No"] : q.options ?? []).map(
                                (opt) => {
                                  const active = answers[q.key] === opt;
                                  return (
                                    <button
                                      key={opt}
                                      type="button"
                                      aria-pressed={active}
                                      onClick={() =>
                                        setAnswers((a) => ({ ...a, [q.key]: active ? "" : opt }))
                                      }
                                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                        active
                                          ? "border-teal-600 bg-teal-50 text-teal-700"
                                          : "border-slate-200 text-slate-600 hover:border-teal-300"
                                      }`}
                                    >
                                      {opt}
                                    </button>
                                  );
                                }
                              )}
                            </div>
                          ) : q.inputType === "scale_0_10" ? (
                            <div className="flex flex-wrap gap-1.5">
                              {Array.from({ length: 11 }, (_, i) => String(i)).map((n) => {
                                const active = answers[q.key] === n;
                                return (
                                  <button
                                    key={n}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() =>
                                      setAnswers((a) => ({ ...a, [q.key]: active ? "" : n }))
                                    }
                                    className={`h-8 w-8 rounded-lg border text-xs font-bold transition ${
                                      active
                                        ? "border-teal-600 bg-teal-600 text-white"
                                        : "border-slate-200 text-slate-600 hover:border-teal-300"
                                    }`}
                                  >
                                    {n}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={answers[q.key] ?? ""}
                              onChange={(e) =>
                                setAnswers((a) => ({ ...a, [q.key]: e.target.value }))
                              }
                              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                ))}

                <section className="rounded-xl border border-slate-200 p-4">
                  <p id={painLabelId} className="mb-1 block text-sm font-bold text-slate-800">
                    Overall pain for this area, 0 to 10
                  </p>
                  {/* The same eleven buttons as the guided assessment's pain
                      step: out of ten, the way the patient rates their own
                      pain, and stored times ten as every reading is. */}
                  <p className="mb-3 text-[13px] text-slate-600">Tap the number the patient gives: 0 is no pain, 10 the worst they can imagine.</p>
                  <PainScaleButtons value={painScore} onChange={(n) => { setPainScore(n); setError(null); }} labelledBy={painLabelId} />
                  <p className="mt-2 text-[13px] font-semibold text-slate-600">
                    {painPercent === null ? "Not scored yet." : `${formatPainOutOfTen(painPercent)} · ${PAIN_BAND_LABEL[painBand(painPercent)]}`}
                    {previous && painPercent !== null && (
                      <span className="ml-2 font-normal text-slate-600">{painChangeWords(previous.pain_percent, painPercent)}</span>
                    )}
                  </p>
                </section>
              </div>
            )}
          </div>

          {region && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
              {error ? (
                <span className="text-xs font-semibold text-red-600">{error}</span>
              ) : (
                <span className="text-xs text-slate-500">
                  Saves as a new reading - the patient sees it straight away.
                </span>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-500 transition hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={isPending}
                  data-testid="pain-exam-save"
                  className="rounded-xl bg-teal-700 px-5 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
                >
                  {isPending ? "Saving…" : "Save exam"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </OverlayPortal>
  );
}
