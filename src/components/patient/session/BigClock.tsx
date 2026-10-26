import type { ClockShown } from "@/lib/companionScreen";

const TONE: Record<ClockShown["tone"], string> = {
  ready: "text-[#fcd34d]",
  go: "text-white",
  finished: "text-[#5eead4]",
};

/** The giant clock: a small label over a very large number. It is a timer to
 *  assistive technology but never announces itself (a number changing every
 *  second would talk over the physiotherapist); the step's words are what is
 *  announced. */
export default function BigClock({ clock }: { clock: ClockShown }) {
  return (
    <div role="timer" aria-label={clock.label} data-testid="big-clock" className="min-w-0 text-center">
      <div className="text-[clamp(14px,2vw,18px)] font-bold uppercase tracking-[0.06em] text-[#94a3b8]">{clock.label}</div>
      <div
        className={`font-display text-[clamp(96px,22vw,220px)] font-extrabold leading-none tabular-nums ${TONE[clock.tone]}`}
        data-tone={clock.tone}
      >
        {clock.text}
      </div>
    </div>
  );
}
