import BeforeYouStart from "@/components/therapist/assessment/BeforeYouStart";
import type { Briefing } from "@/lib/cockpitBriefing";

export type SafetyState = "not_asked" | "clear" | "flagged";

const TONE = {
  clear: "border-emerald-300 bg-emerald-50 text-emerald-950",
  not_asked: "border-slate-300 bg-white text-slate-900",
  alarm: "border-2 border-red-600 bg-red-50 text-red-950",
} as const;

const HEADLINE: Record<SafetyState, string> = {
  not_asked: "Safety questions not asked yet",
  clear: "Safety clear",
  flagged: "A safety concern was noted",
};

/**
 * The cockpit's one safety strip (T3): where the run stands on safety, the
 * step's "someone beside them" rule when it has one, the protocol's "Stop at
 * once if" list, the resting check's "no exercise today", and the
 * "Before you start" notes folded underneath - one place to look, instead of
 * a chip, a banner, a red box and a line each in a corner of their own. It
 * is green when clear and turns red only when something needs action.
 * Read only: the server is the gate for every one of these.
 */
export default function SafetyStrip({
  state,
  stopAtOnce,
  needsHelper,
  firstName,
  noExercise,
  briefing,
}: {
  state: SafetyState;
  stopAtOnce: readonly string[];
  /** This step needs another adult beside the patient. */
  needsHelper: boolean;
  firstName: string;
  /** The heart and lung resting check said no exercise today. */
  noExercise: boolean;
  briefing?: Briefing;
}) {
  const alarm = state === "flagged" || noExercise;
  const tone = alarm ? TONE.alarm : state === "clear" ? TONE.clear : TONE.not_asked;
  return (
    <section aria-label="Safety" data-testid="safety-strip" className={`flex flex-col gap-1 rounded-xl border px-3 py-2 text-[13px] leading-snug sm:text-sm ${tone}`}>
      <p className="flex flex-wrap items-center gap-x-2">
        <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${alarm ? "bg-red-600" : state === "clear" ? "bg-emerald-600" : "bg-slate-400"}`} />
        <strong data-testid="safety-chip">{HEADLINE[state]}</strong>
        {needsHelper && (
          <span data-testid="helper-warning" className="font-semibold">
            · Someone must stand beside {firstName} for this test. Do not start until you have seen them on camera.
          </span>
        )}
      </p>
      {noExercise && (
        <p role="alert" data-testid="no-exercise-banner" className="font-semibold">
          The resting check says not to exercise today. Skip the exercise steps and contact the patient{"'"}s doctor.
        </p>
      )}
      <p data-testid="stop-at-once">
        <strong>Stop at once if</strong> {stopAtOnce.map((s) => s.toLowerCase()).join(", ")}.
      </p>
      {briefing && <BeforeYouStart briefing={briefing} compact />}
    </section>
  );
}
