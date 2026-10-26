import { phaseBarState } from "@/lib/phaseSuggestion";
import { subjectWords, type ProfileSubject } from "@/lib/childVoice";
import { PHASES_BY_PROFILE_KIND } from "@/lib/milestoneTemplates";
import type { ProfileKind } from "@/lib/outcomeMeasures";
import type { Voice } from "@/lib/progressView";

/**
 * The four stages of the course for this kind of patient, with the current
 * one marked: stages behind in solid teal, the current one lighter and bold,
 * those ahead grey. The stage is set by the physiotherapist and moving on
 * follows criteria, not the week number - so the bar says which stage, never
 * "week 6 of 12".
 *
 * Stage names come from `PHASES_BY_PROFILE_KIND`. Status is also spelled out
 * for a screen reader (and `aria-current="step"` on the current one), so the
 * colours are not the only signal. `currentPhase` null (not set) marks none
 * and says so.
 */
export default function PhaseBar({
  profileKind,
  currentPhase,
  suggested = false,
  voice,
  subject = "self",
}: {
  /** Who the patient-voice sentences are about (childVoice.ts): "child" speaks to a parent ("your child's ..."). */
  subject?: ProfileSubject;
  profileKind: ProfileKind;
  /** One of the kind's four phase names, or null when none is set. */
  currentPhase: string | null;
  /** `currentPhase` is the plan's inference, not the physiotherapist's call:
   *  drawn lighter, dashed and labelled, never as a confirmed stage. */
  suggested?: boolean;
  voice: Voice;
}) {
  const w = subjectWords(subject, voice);
  const phases = PHASES_BY_PROFILE_KIND[profileKind];
  const currentIndex = currentPhase ? phases.indexOf(currentPhase) : -1;

  return (
    <div>
      <ol className="grid grid-cols-4 gap-1.5 sm:gap-2" aria-label={voice === "clinician" ? "Phase of care" : w("Where you are in your care")}>
        {phases.map((phase, i) => {
          const state = phaseBarState(i, currentIndex, suggested);
          return (
            <li key={phase} aria-current={state === "current" ? "step" : undefined} className="min-w-0">
              <div
                aria-hidden
                className={`h-2 rounded-full ${
                  state === "done"
                    ? "bg-teal-700"
                    : state === "current"
                      ? "bg-teal-400"
                      : state === "suggested"
                        ? "border border-dashed border-teal-600 bg-teal-50"
                        : "bg-slate-200"
                }`}
              />
              <p
                className={`mt-1.5 text-[11px] leading-tight sm:text-xs [overflow-wrap:anywhere] ${
                  state === "current" ? "font-bold text-slate-900" : state === "suggested" ? "font-semibold italic text-teal-900" : state === "done" ? "text-slate-700" : "text-slate-600"
                }`}
              >
                {phase}
                <span className="sr-only">{state === "done" ? " (done)" : state === "current" ? w(" (you are here)") : state === "suggested" ? " (suggested, not confirmed)" : " (ahead)"}</span>
              </p>
            </li>
          );
        })}
      </ol>
      {currentIndex < 0 && (
        <p className="mt-2 text-xs text-slate-600">
          {voice === "clinician"
            ? "No phase is set yet. Set it from the plan when the first stage's criteria are met."
            : w("Your physiotherapist will mark which stage you are in.")}
        </p>
      )}
    </div>
  );
}
