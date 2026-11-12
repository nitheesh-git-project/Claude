import type { LiveDisplayView } from "@/lib/assessmentRun";
import type { ClockShown } from "@/lib/companionScreen";
import BigClock from "@/components/patient/session/BigClock";
import PositionPicture from "@/components/patient/session/PositionPicture";
import ExercisePicture from "@/components/exercises/ExercisePicture";

/**
 * What the patient sees during a guided check: the step name small, one big
 * instruction, a picture of the position, the clock when the step has one and
 * one calming line. Display only: no button, no link, nothing to press. Every
 * word comes from the display row the server wrote (assessmentRun.ts
 * buildLiveDisplay), already checked against the patient-safe whitelist.
 */
export default function LiveScreen({ view, clock }: { view: LiveDisplayView; clock: ClockShown | null }) {
  const t = view.text;
  if (t.exercise) return <ExerciseDemo view={view} exercise={t.exercise} />;
  return (
    <div
      data-testid="companion-live"
      data-phase={view.phase}
      className="flex min-h-dvh select-none flex-col items-center justify-center gap-[clamp(16px,3vw,32px)] px-[clamp(16px,4vw,48px)] py-[clamp(20px,4vw,48px)] text-center"
    >
      <p data-testid="companion-step" className="text-[clamp(15px,2vw,20px)] font-bold uppercase tracking-[0.06em] text-[#5eead4]">
        {t.progress} · {t.title}
      </p>
      <h1 data-testid="companion-line" className="max-w-[18ch] font-display text-[clamp(30px,6vw,64px)] font-extrabold leading-[1.12] text-white [text-wrap:balance]">
        {t.line}
      </h1>
      <div className="flex flex-wrap items-center justify-center gap-[clamp(16px,4vw,48px)]">
        <PositionPicture picture={t.picture} phase={view.phase} />
        {clock && <BigClock clock={clock} />}
      </div>
      {t.sub && (
        <p data-testid="companion-sub" className="max-w-[28ch] text-[clamp(20px,3vw,32px)] font-medium leading-[1.35] text-[#e2e8f0]">
          {t.sub}
        </p>
      )}
    </div>
  );
}

/**
 * One home exercise on the Home exercises step (phase 7d): "Exercise 2 of 4"
 * and its name, the picture, and while the physiotherapist is showing it the
 * few steps as large numbered lines. On "Your turn" the picture stays and the
 * steps go, so the screen is quiet while the patient does it. No clock, and
 * nothing to press. The picture and the steps are the library's own (the
 * server wrote them; asLiveDisplayView vouched for the shape).
 */
function ExerciseDemo({ view, exercise }: { view: LiveDisplayView; exercise: NonNullable<LiveDisplayView["text"]["exercise"]> }) {
  const t = view.text;
  const showSteps = view.phase === "demo";
  return (
    <div
      data-testid="companion-live"
      data-phase={view.phase}
      data-exercise={exercise.key}
      className="flex min-h-dvh select-none flex-col items-center justify-center gap-[clamp(14px,2.5vw,28px)] px-[clamp(16px,4vw,48px)] py-[clamp(20px,4vw,48px)] text-center"
    >
      <p data-testid="companion-step" className="text-[clamp(15px,2vw,20px)] font-bold uppercase tracking-[0.06em] text-[#5eead4]">
        <span data-testid="companion-counter">{exercise.counter}</span> · {t.title}
      </p>
      <h1 data-testid="companion-line" className="max-w-[22ch] font-display text-[clamp(28px,5vw,56px)] font-extrabold leading-[1.12] text-white [text-wrap:balance]">
        {t.line}
      </h1>
      <div className="flex w-full max-w-[1100px] flex-col items-center justify-center gap-[clamp(16px,4vw,48px)] md:flex-row md:items-center">
        <div className="w-[clamp(200px,60vw,340px)] shrink-0 md:w-[clamp(260px,34vw,420px)]">
          <ExercisePicture picture={exercise.picture} name={t.title} tone="dark" />
        </div>
        {showSteps && (
          <ol data-testid="companion-steps" className="flex min-w-0 flex-1 flex-col gap-[clamp(10px,1.6vw,18px)] text-left">
            {exercise.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3.5">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-[clamp(34px,4.6vw,48px)] w-[clamp(34px,4.6vw,48px)] shrink-0 items-center justify-center rounded-full bg-[#5eead4] text-[clamp(18px,2.4vw,26px)] font-extrabold text-[#0f172a]"
                >
                  {i + 1}
                </span>
                <span className="text-[clamp(20px,2.7vw,32px)] font-semibold leading-[1.3] text-white">{step}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      {t.sub && (
        <p data-testid="companion-sub" className="max-w-[34ch] text-[clamp(18px,2.6vw,28px)] font-medium leading-[1.35] text-[#e2e8f0]">
          {t.sub}
        </p>
      )}
    </div>
  );
}
