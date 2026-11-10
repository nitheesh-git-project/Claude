import { formatClinicDateShort } from "@/lib/formatDateTime";
import type { WalkingLadder as Ladder } from "@/lib/neuroProfile";

const upperFirst = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/**
 * "How much help to walk", the Functional Ambulation Categories as a ladder:
 * the top rung (5, independent anywhere) first, the rung the patient is on
 * marked "Now" and the rung they started on marked "Start". A list of real
 * rows with the grade in words, so nothing depends on colour or on a drawing.
 */
export default function WalkingLadder({ ladder, voice }: { ladder: Ladder; voice: "patient" | "clinician" }) {
  const rungs = [...ladder.rungs].sort((a, b) => b.value - a.value);
  return (
    <section aria-label="Walking ability" className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5" data-testid="walking-ladder">
      <h3 className="font-display text-sm font-bold text-slate-900">{voice === "patient" ? "How much help you need to walk" : "Walking ability (FAC), 0 to 5"}</h3>
      <ol className="mt-2 space-y-1">
        {rungs.map((rung) => {
          const isNow = rung.value === ladder.now;
          const isStart = ladder.first !== null && rung.value === ladder.first && !isNow;
          const [grade, ...rest] = rung.label.split(": ");
          return (
            <li
              key={rung.value}
              aria-current={isNow ? "step" : undefined}
              className={`flex min-w-0 items-start gap-2.5 rounded-lg border px-2.5 py-1.5 text-[13px] leading-snug ${
                isNow ? "border-teal-700 bg-teal-50 text-slate-900" : "border-slate-200 text-slate-700"
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  isNow ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-800"
                }`}
              >
                {grade}
              </span>
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                <span className="sr-only">Level {grade}: </span>
                {upperFirst(rest.join(": "))}
              </span>
              {(isNow || isStart) && (
                <span className={`shrink-0 text-xs font-bold ${isNow ? "text-teal-800" : "text-slate-700"}`}>
                  {isNow ? "Now" : "Start"}
                  <span className="block text-[11px] font-normal text-slate-700">
                    {formatClinicDateShort(isNow ? ladder.nowAt : ladder.firstAt)}
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
