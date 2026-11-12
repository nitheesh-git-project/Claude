import type { Briefing, BriefingTone } from "@/lib/cockpitBriefing";

const TONE: Record<BriefingTone, string> = {
  watch: "border-amber-300 bg-amber-50 text-amber-950",
  info: "border-slate-200 bg-white text-slate-900",
  unchecked: "border-slate-300 bg-slate-50 text-slate-800",
};

function List({ briefing }: { briefing: Briefing }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {briefing.items.map((item) => (
        <li key={item.key} data-testid={`briefing-${item.key}`} className={`rounded-xl border px-3 py-2 text-[15px] leading-snug ${TONE[item.tone]}`}>
          <span className="block text-[13px] font-bold">{item.label}</span>
          <span className="[overflow-wrap:anywhere]">{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Before you start" (B5): the last session's plan and anything to watch,
 * the precautions, the affected side, ON or OFF on a Parkinson's run. In full
 * on the Start panel; one line in the cockpit's header that opens to the same
 * list. A read that failed says "couldn't check" (cockpitBriefing.ts).
 */
export default function BeforeYouStart({ briefing, compact = false }: { briefing: Briefing; compact?: boolean }) {
  if (compact) {
    if (!briefing.oneLine) return null;
    return (
      <details data-testid="briefing-line" className="group w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3">
        <summary className="flex min-h-[44px] cursor-pointer items-center gap-2 text-[13px] text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
          <span className="shrink-0 font-bold">Before you start:</span>
          <span className="min-w-0 truncate group-open:whitespace-normal">{briefing.oneLine}</span>
        </summary>
        <div className="pb-2">
          <List briefing={briefing} />
        </div>
      </details>
    );
  }
  return (
    <section aria-labelledby="briefing-heading" data-testid="briefing" className="space-y-2">
      <h2 id="briefing-heading" className="text-sm font-bold uppercase tracking-wider text-slate-700">
        Before you start
      </h2>
      {briefing.items.length === 0 ? (
        <p className="text-[15px] text-slate-700">Nothing on record to watch for: no plan or caution from a last session, no precautions in the intake.</p>
      ) : (
        <List briefing={briefing} />
      )}
    </section>
  );
}
