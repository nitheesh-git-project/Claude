"use client";

import type { RedFlagQuestion } from "@/lib/sessionProtocols";

/** The line a yes adds to the session note's "Anything to watch". */
export function watchLineFor(q: RedFlagQuestion): string {
  return `Safety question answered yes: ${q.question.replace(/\?$/, "")}.`;
}

/**
 * The safety questions, asked aloud, answered with two big buttons each. A
 * yes is a concern: it closes every test for today (the server enforces it)
 * and the card says so as soon as it is tapped, before anything is saved.
 */
export default function RedFlagsTool({
  questions,
  answers,
  onAnswer,
  disabled,
  onEnd,
  onWatch,
  watched,
}: {
  questions: readonly RedFlagQuestion[];
  answers: Readonly<Record<string, boolean>>;
  onAnswer: (id: string, yes: boolean) => void;
  disabled: boolean;
  /** The two next actions under a yes: end the assessment now, or carry the
   *  answer into the session note's "Anything to watch". */
  onEnd?: () => void;
  onWatch?: (line: string) => void;
  watched?: readonly string[];
}) {
  const anyYes = questions.some((q) => answers[q.id] === true);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700">Ask each question aloud. Tap what the patient answers.</p>
      <ul className="flex flex-col gap-2.5">
        {questions.map((q) => {
          const answer = answers[q.id];
          return (
            <li key={q.id} data-testid={`flag-${q.id}`}>
              <div role="group" aria-labelledby={`flag-q-${q.id}`} className="rounded-xl border border-slate-200 p-3">
                <p id={`flag-q-${q.id}`} className="text-base font-semibold text-slate-900">
                  {q.question}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={disabled}
                    aria-pressed={answer === false}
                    onClick={() => onAnswer(q.id, false)}
                    className={`min-h-[52px] rounded-xl border text-lg font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 disabled:opacity-60 ${
                      answer === false ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-900 hover:border-teal-500"
                    }`}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-pressed={answer === true}
                    onClick={() => onAnswer(q.id, true)}
                    className={`min-h-[52px] rounded-xl border text-lg font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-1 disabled:opacity-60 ${
                      answer === true ? "border-red-700 bg-red-700 text-white" : "border-slate-300 bg-white text-slate-900 hover:border-red-500"
                    }`}
                  >
                    Yes
                  </button>
                </div>
                {answer === true && (onEnd || onWatch) && (
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-red-950" data-testid={`flag-next-${q.id}`}>
                    <span className="font-semibold">Next:</span>
                    {onEnd && (
                      <button type="button" onClick={onEnd} className="min-h-[44px] font-bold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">
                        End the assessment
                      </button>
                    )}
                    {onWatch &&
                      (watched?.includes(watchLineFor(q)) ? (
                        <span className="font-semibold text-teal-900">Added to Anything to watch</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onWatch(watchLineFor(q))}
                          className="min-h-[44px] font-bold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                        >
                          Add to Anything to watch
                        </button>
                      ))}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {anyYes && (
        <p role="alert" data-testid="flag-warning" className="rounded-xl border-2 border-red-600 bg-red-50 px-4 py-3 text-[15px] font-semibold text-red-950">
          A yes means no tests today. Save and next goes straight to the summary.
        </p>
      )}
    </div>
  );
}
