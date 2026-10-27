import ExercisePicture from "@/components/exercises/ExercisePicture";
import { formatClinicDate } from "@/lib/formatDateTime";
import { practisedLine, type PlanView } from "@/lib/exercisePlan";
import { homeExercisesCopy, type HomeExercisesVoice } from "@/lib/homeExercisesCopy";

export type HomeExercisesRead = { status: "ok"; view: PlanView | null } | { status: "not_migrated" } | { status: "unreadable" };

/**
 * The patient's Home exercises, read only: each exercise with its picture,
 * plain name, the dose in words, how it is done (collapsed under the name)
 * and when it was practised with the physiotherapist. Nothing to tick, fill
 * in or report. "Could not load" and "nothing yet" are different cards. A
 * server component: the open and close is a plain details element.
 */
export default function HomeExercisesCard({ read, voice }: { read: HomeExercisesRead; voice: HomeExercisesVoice }) {
  const copy = homeExercisesCopy(voice);
  const parent = voice === "parent";
  const shell = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6";
  const head = (
    <div className="mb-3">
      <h2 className="font-display text-lg font-bold text-slate-800">{copy.heading}</h2>
    </div>
  );

  if (read.status !== "ok") {
    return (
      <section className={shell} data-testid="home-exercises" data-state={read.status}>
        {head}
        <p role={read.status === "unreadable" ? "status" : undefined} className="text-sm text-slate-700">
          {read.status === "unreadable" ? copy.unreadable : copy.notMigrated}
        </p>
      </section>
    );
  }
  if (!read.view || read.view.items.length === 0) {
    return (
      <section className={shell} data-testid="home-exercises" data-state="empty">
        {head}
        <p className="text-sm text-slate-700">{copy.empty}</p>
      </section>
    );
  }
  const { view } = read;
  return (
    <section className={shell} data-testid="home-exercises" data-state="plan" aria-labelledby="home-exercises-heading">
      <div className="mb-3">
        <h2 id="home-exercises-heading" className="font-display text-lg font-bold text-slate-800">
          {copy.heading}
        </h2>
        <p className="mt-0.5 text-sm text-slate-700">{copy.intro}</p>
        <p className="mt-0.5 text-xs text-slate-600">{copy.set(formatClinicDate(view.publishedAt))}</p>
      </div>
      <ul className="space-y-2.5">
        {view.items.map((item) => (
          <li key={item.key}>
            <details className="group rounded-xl border border-slate-200 bg-slate-50" data-testid={`home-exercise-${item.key}`}>
              <summary className="flex min-h-[72px] cursor-pointer list-none items-center gap-3 rounded-xl px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 [&::-webkit-details-marker]:hidden">
                <span className="w-20 shrink-0 sm:w-24">
                  <ExercisePicture picture={item.picture} name={item.name} tone="light" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold text-slate-900">{item.name}</span>
                  <span className="block text-sm text-slate-800">{item.dose}</span>
                  <span className="mt-0.5 block text-[13px] text-slate-700" data-testid={`home-exercise-practised-${item.key}`}>
                    {practisedLine(item.practised, item.practised ? formatClinicDate(item.practised.at) : "", { parent })}
                  </span>
                </span>
                <i aria-hidden="true" className="fa-solid fa-chevron-down shrink-0 text-xs text-slate-600 transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-2.5 border-t border-slate-200 px-3 pb-3.5 pt-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-700">{copy.steps}</p>
                  <ol className="mt-1 list-decimal space-y-1 pl-5 text-[15px] text-slate-900">
                    {item.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                </div>
                {item.note && (
                  <p className="text-[15px] text-slate-900">
                    <span className="font-semibold">{copy.note}: </span>
                    {item.note}
                  </p>
                )}
                {item.helperLine && <p className="text-[15px] font-semibold text-slate-900">{item.helperLine}</p>}
                <p className="text-[15px] text-slate-800">
                  <span className="font-semibold">{copy.safety}: </span>
                  {item.safety}
                </p>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
