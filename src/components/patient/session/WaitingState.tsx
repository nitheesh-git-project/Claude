import { WAITING_TEXT } from "@/lib/companionScreen";

/** The calm screen before a guided check starts, between checks, and a while
 *  after one ends. Nothing to press; it changes by itself. */
export default function WaitingState({ ended = false }: { ended?: boolean }) {
  return (
    <div
      data-testid="companion-waiting"
      className="flex min-h-dvh flex-col items-center justify-center gap-[clamp(16px,3vw,32px)] px-[clamp(16px,4vw,48px)] pt-[clamp(20px,4vw,48px)] pb-24 text-center"
    >
      <span aria-hidden="true" className="relative grid h-[clamp(96px,18vw,160px)] w-[clamp(96px,18vw,160px)] place-items-center">
        <span className="absolute inset-0 rounded-full bg-[#5eead4]/15 motion-safe:animate-pulse" />
        <span className="absolute inset-[18%] rounded-full bg-[#5eead4]/30" />
        <span className="h-[28%] w-[28%] rounded-full bg-[#5eead4]" />
      </span>
      <h1 className="max-w-[20ch] font-display text-[clamp(28px,5.5vw,56px)] font-extrabold leading-[1.15] text-white [text-wrap:balance]">
        {ended ? "All done" : WAITING_TEXT.title}
      </h1>
      <p className="max-w-[30ch] text-[clamp(18px,2.6vw,28px)] font-medium leading-[1.4] text-[#e2e8f0]">
        {ended ? "That is everything for today. Thank you." : WAITING_TEXT.line}
      </p>
      <p className="text-[clamp(16px,2vw,22px)] text-[#94a3b8]">{ended ? "You can close this screen." : WAITING_TEXT.calm}</p>
    </div>
  );
}
