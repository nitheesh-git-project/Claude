import type { LiveDisplayView } from "@/lib/assessmentRun";
import type { ClockShown } from "@/lib/companionScreen";
import BigClock from "@/components/patient/session/BigClock";
import PositionPicture from "@/components/patient/session/PositionPicture";

/**
 * What the patient sees during a guided check: the step name small, one big
 * instruction, a picture of the position, the clock when the step has one and
 * one calming line. Display only: no button, no link, nothing to press. Every
 * word comes from the display row the server wrote (assessmentRun.ts
 * buildLiveDisplay), already checked against the patient-safe whitelist.
 */
export default function LiveScreen({ view, clock }: { view: LiveDisplayView; clock: ClockShown | null }) {
  const t = view.text;
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
        <PositionPicture picture={t.picture} />
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
