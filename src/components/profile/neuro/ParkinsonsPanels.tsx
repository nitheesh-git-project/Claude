import { formatClinicDateShort } from "@/lib/formatDateTime";
import type { ParkinsonStage, SymptomProfile } from "@/lib/neuroProfile";
import type { Voice } from "@/lib/progressView";

const MAX = 4;
const WORD = ["none", "slight", "mild", "moderate", "severe"] as const;

/**
 * The symptom profile: the physiotherapist's own six-part rating (0 none to 4
 * severe), the first and the latest in one medication state. It is labelled as
 * the clinic's rating and not an official score, and a symptom that exercise
 * is not expected to change (tremor) is not drawn as a failure - nothing here
 * is coloured good or bad. Each row says its numbers in words as well as on
 * the bar. Drawn only when a rating exists (symptomProfile).
 */
export function SymptomProfilePanel({ profile, voice }: { profile: SymptomProfile; voice: Voice }) {
  const clinician = voice === "clinician";
  return (
    <section aria-label="Symptom profile" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" data-testid="pd-symptoms">
      <h2 className="font-display text-lg font-bold text-slate-900">Symptom profile{profile.medicationState ? ` (${profile.medicationState.toUpperCase()})` : ""}</h2>
      <p className="mt-0.5 text-sm text-slate-700">
        {clinician
          ? "The physiotherapist's own rating, 0 (none) to 4 (severe). The clinic's own summary, not an official score such as the MDS-UPDRS."
          : "Your physiotherapist's own rating, 0 (none) to 4 (severe). It is not an official score."}
      </p>
      <ul className="mt-3 space-y-3">
        {profile.rows.map((row) => {
          const now = row.now;
          return (
            <li key={row.label} className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="font-semibold text-slate-900">{row.label}</span>
                <span className="text-slate-800">
                  {now === null ? "Not rated" : `${now} (${WORD[Math.max(0, Math.min(MAX, now))]})`}
                  {row.first !== null && now !== null && row.first !== now && <span className="text-slate-700">, was {row.first}</span>}
                  {row.first !== null && now !== null && row.first === now && <span className="text-slate-700">, unchanged</span>}
                </span>
              </div>
              <div className="relative mt-1.5 h-2.5 rounded-full bg-slate-200" aria-hidden>
                {now !== null && <div className="h-full rounded-full bg-teal-600" style={{ width: `${(now / MAX) * 100}%` }} />}
                {row.first !== null && (
                  <span
                    className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-slate-600 bg-white"
                    style={{ left: `${(row.first / MAX) * 100}%`, transform: `translate(${row.first === 0 ? "0" : row.first === MAX ? "-100%" : "-50%"}, -50%)` }}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-slate-700">
        The filled bar is now{profile.firstAt ? ", the open circle is where each began" : ""}. Rated{" "}
        {formatClinicDateShort(profile.nowAt)}
        {profile.firstAt ? ` (first ${formatClinicDateShort(profile.firstAt)})` : ""}.
        {voice === "clinician" ? "" : " Tremor usually answers to medicine more than to exercise, so it may not move."}
      </p>
    </section>
  );
}

/**
 * The stage of Parkinson's (Modified Hoehn and Yahr) as a fact about the
 * condition: stage describes the condition, not the therapy, and holding it is
 * the aim - so it is never coloured better or worse, and never offered as a
 * goal. Drawn only when a stage is recorded.
 */
export function StageCard({ stage, voice }: { stage: ParkinsonStage; voice: Voice }) {
  const [, ...rest] = stage.label.split(": ");
  return (
    <section aria-label="Stage of Parkinson's" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" data-testid="pd-stage">
      <h2 className="font-display text-lg font-bold text-slate-900">Stage of Parkinson&apos;s</h2>
      <p className="mt-2 flex items-baseline gap-3">
        <span className="font-display text-3xl font-extrabold text-slate-900">{stage.value}</span>
        <span className="text-sm text-slate-800 [overflow-wrap:anywhere]">{rest.length > 0 ? rest.join(": ") : stage.label}</span>
      </p>
      <p className="mt-2 text-xs text-slate-700">
        {stage.since === stage.at ? `Recorded ${formatClinicDateShort(stage.at)}.` : `Held at ${stage.value} since ${formatClinicDateShort(stage.since)}.`}{" "}
        {voice === "clinician"
          ? "Stage describes the condition, not the therapy: holding it is the aim."
          : "Stage describes the condition, not your exercise - holding steady is the aim."}
      </p>
    </section>
  );
}
