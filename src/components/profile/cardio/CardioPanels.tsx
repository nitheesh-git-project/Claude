import { formatClinicDate } from "@/lib/formatDateTime";
import type { CardioView } from "@/lib/cardioProfile";
import { heartRateTargetText } from "@/lib/cardioProfile";
import { oxygenBar, stopAtOnceItems, walkTrack } from "@/lib/cardioPicture";
import { CARDIO_STOP_AT_ONCE, TALK_TEST_GUIDANCE } from "@/lib/cardioSafety";
import { CARDIO_MMRC_OPTIONS } from "@/lib/intakeCardio";
import { TALK_TEST_GRADES } from "@/lib/outcomeMeasures";
import type { Voice } from "@/lib/progressView";

const CARD = "min-w-0 rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4";

/**
 * The patient's safety limits as a row of chips under the header, visible
 * without scrolling: their OWN oxygen stop limit (labelled "default" until
 * the doctor sets one), the beta-blocker note when it changes how they are
 * paced, and the surgeon's breastbone precautions with the day they end.
 * Plain words and never alarming: these are the limits the programme works
 * inside.
 */
export function SafetyLimitsRow({ view, voice }: { view: CardioView; voice: Voice }) {
  const patient = voice === "patient";
  const { limit, precautions: p } = view;
  const chips: { key: string; icon: string; text: string; tone: string }[] = [];
  chips.push({
    key: "oxygen",
    icon: "fa-lungs",
    text: `Oxygen stop limit ${limit.percent}%${limit.dropFromRestPoints !== null ? ` or a drop of ${limit.dropFromRestPoints}` : ""} · ${
      limit.source === "doctor" ? (patient ? "set by your doctor" : "set by the doctor") : "default"
    }`,
    tone: "border-sky-200 bg-sky-50 text-sky-950",
  });
  if (view.onBetaBlocker !== false) {
    chips.push({
      key: "beta",
      icon: "fa-pills",
      text: view.effort.mode === "talk_test" ? view.effort.headline[patient ? "patient" : "clinician"] : "",
      tone: "border-violet-200 bg-violet-50 text-violet-950",
    });
  }
  if (p.status === "active") {
    chips.push({
      key: "sternal",
      icon: "fa-shield-heart",
      text: `Breastbone precautions until ${formatClinicDate(p.until)} (${p.daysLeft} ${p.daysLeft === 1 ? "day" : "days"} left)`,
      tone: "border-amber-200 bg-amber-50 text-amber-950",
    });
  } else if (p.status === "ended") {
    chips.push({ key: "sternal", icon: "fa-shield-heart", text: `Breastbone precautions ended ${formatClinicDate(p.until)}`, tone: "border-slate-200 bg-slate-50 text-slate-900" });
  } else if (p.status === "end_date_unknown") {
    chips.push({ key: "sternal", icon: "fa-shield-heart", text: "Breastbone precautions: end date not clear yet", tone: "border-amber-200 bg-amber-50 text-amber-950" });
  }
  const explain: string[] = [];
  if (limit.source === "default") {
    explain.push(
      patient
        ? "Your oxygen limit is a usual starting figure until your doctor gives you one. Tell your physiotherapist if they have."
        : "The oxygen limit is the handbook default for this condition until the doctor sets one."
    );
  }
  if (p.status === "active" && p.text) explain.push(`${patient ? "Your surgeon asked:" : "Surgeon's precautions:"} ${p.text}.`);
  return (
    <div role="group" aria-label="Safety limits" data-testid="safety-limits">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-700">Safety limits</p>
      <ul className="mt-1.5 flex flex-wrap gap-2">
        {chips.map((c) => (
          <li key={c.key} data-testid={`limit-${c.key}`} className={`flex max-w-full items-start gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold leading-snug ${c.tone}`}>
            <i aria-hidden className={`fa-solid ${c.icon} mt-0.5 shrink-0`} />
            <span className="min-w-0 [overflow-wrap:anywhere]">{c.text}</span>
          </li>
        ))}
      </ul>
      {explain.map((line) => (
        <p key={line} className="mt-1.5 text-xs text-slate-700">
          {line}
        </p>
      ))}
    </div>
  );
}

/** The six-minute walk: distance, a track from the first test to the latest
 *  and the expected distance, and why a percentage is or is not shown. */
export function WalkTrackCard({ view, voice }: { view: CardioView; voice: Voice }) {
  const patient = voice === "patient";
  const model = walkTrack(view, voice);
  return (
    <section aria-label="Six-minute walk" className={CARD} data-testid="walk-track">
      <h3 className="font-display text-base font-bold text-slate-900">Six-minute walk</h3>
      <p className="mt-0.5 text-xs text-slate-700">
        {patient ? "As far as you can comfortably go in six minutes, on a flat 30 metre corridor." : "Distance covered in six minutes on a flat 30 m course."}
      </p>
      {model ? (
        <>
          <p className="mt-2 font-display text-3xl font-extrabold text-slate-900">
            {model.latest!.value} <span className="text-base font-semibold text-slate-700">metres</span>
          </p>
          {view.walk.latest && <p className="text-xs text-slate-700">{formatClinicDate(view.walk.latest.measuredAt)}</p>}
          <div className="relative mt-4 h-3 rounded-full bg-slate-200" role="img" aria-label={`${model.latest!.value} metres on a scale of 0 to ${model.max}`}>
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${model.latest!.pct}%`, background: "var(--chart-brand-soft)" }} />
            {model.first && (
              <span aria-hidden className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full" style={{ left: `calc(${model.first.pct}% - 8px)`, background: "var(--background)", border: "2px solid var(--chart-ink)" }} />
            )}
            {model.predicted && <span aria-hidden className="absolute -top-1.5 h-6 w-1 rounded" style={{ left: `calc(${model.predicted.pct}% - 2px)`, background: "var(--chart-indigo)" }} />}
          </div>
          <div aria-hidden className="mt-1 flex justify-between text-[11px] text-slate-600">
            <span>0</span>
            <span>{model.max} m</span>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-slate-800">
            {model.first && (
              <li className="flex items-center gap-2">
                <span aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: "var(--background)", border: "2px solid var(--chart-ink)" }} />
                <span>
                  {patient ? "Your first test" : "First test"}: <strong>{model.first.value} m</strong>
                </span>
              </li>
            )}
            <li className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: "var(--chart-brand-soft)" }} />
              <span>
                {patient ? "Now" : "Latest"}: <strong>{model.latest!.value} m</strong>
              </span>
            </li>
            {model.predicted && (
              <li className="flex items-center gap-2">
                <span aria-hidden className="inline-block h-3 w-1 shrink-0 rounded" style={{ background: "var(--chart-indigo)" }} />
                <span>
                  {patient ? "Expected for someone like you" : "Predicted"}: <strong>{model.predicted.value} m</strong>
                  {model.predicted.percentText ? ` (${patient ? "you walk" : "walked"} ${model.predicted.percentText})` : ""}
                </span>
              </li>
            )}
          </ul>
          {model.predicted ? (
            <p className="mt-1.5 text-xs text-slate-700">{view.walk.prediction.status === "ok" ? `By ${view.walk.prediction.equation}.` : ""}</p>
          ) : (
            model.predictionText && (
              <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-800" data-testid="prediction-needs">
                {model.predictionText}
              </p>
            )
          )}
          {model.changeText && <p className="mt-1.5 text-xs text-slate-700">{model.changeText}</p>}
        </>
      ) : (
        <p className="mt-2 text-sm text-slate-700">{view.measuresFailed ? "We couldn't load the walk results just now. They are not missing." : patient ? "Not walked yet. Your physiotherapist will time your first walk." : "No six-minute walk recorded yet."}</p>
      )}
    </section>
  );
}

/** Oxygen against THIS patient's stop limit (never a fixed 90% line). */
export function OxygenCard({ view, voice }: { view: CardioView; voice: Voice }) {
  const patient = voice === "patient";
  const bar = oxygenBar(view);
  const source = view.limit.source === "doctor" ? (patient ? "set by your doctor" : "set by the doctor") : "default";
  const nothing = !bar.rest && !bar.lowest;
  return (
    <section aria-label="Oxygen level" className={CARD} data-testid="oxygen-card">
      <h3 className="font-display text-base font-bold text-slate-900">{patient ? "Your oxygen level" : "Oxygen (SpO2)"}</h3>
      <p className="mt-0.5 text-sm font-semibold text-slate-900" data-testid="oxygen-limit">
        {patient ? "Your stop limit" : "Stop limit"}: {view.limit.percent}% <span className="font-normal text-slate-700">({source})</span>
      </p>
      <div
        className="relative mt-6 h-3 rounded-full"
        role="img"
        aria-label={`Oxygen scale from ${bar.min}% to ${bar.max}%. Stop limit ${bar.limit.percent}%.${bar.rest ? ` At rest ${bar.rest.value}%.` : ""}${bar.lowest ? ` Lowest ${bar.lowest.value}%.` : ""}`}
      >
        <div className="absolute inset-0 flex overflow-hidden rounded-full">
          <div className="bg-rose-200" style={{ width: `${bar.limit.pct}%` }} />
          <div className="flex-1 bg-emerald-200" />
        </div>
        <span aria-hidden className="absolute -top-5 text-[11px] font-bold text-slate-900" style={{ left: `${bar.limit.pct}%`, transform: bar.limit.pct < 12 ? "none" : "translateX(-50%)" }}>
          {bar.limit.percent}%
        </span>
        <span aria-hidden className="absolute -top-1 h-5 w-0.5" style={{ left: `${bar.limit.pct}%`, background: "var(--chart-ink)" }} />
        {bar.rest && (
          <span aria-hidden className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full" style={{ left: `calc(${bar.rest.pct}% - 8px)`, background: "var(--chart-brand-soft)", border: "2px solid var(--chart-ink)" }} />
        )}
        {bar.lowest && (
          <span aria-hidden className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rotate-45" style={{ left: `calc(${bar.lowest.pct}% - 8px)`, background: "var(--background)", border: "2px solid var(--chart-ink)" }} />
        )}
      </div>
      <div aria-hidden className="mt-1 flex justify-between text-[11px] text-slate-600">
        <span>{bar.min}%</span>
        <span>{bar.max}%</span>
      </div>
      <ul className="mt-2 space-y-1 text-sm text-slate-800">
        {bar.rest && (
          <li className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: "var(--chart-brand-soft)", border: "2px solid var(--chart-ink)" }} />
            <span>
              At rest: <strong>{bar.rest.value}%</strong>
              {bar.restBelowScale && <span className="text-xs text-slate-700"> (below this scale)</span>}
            </span>
          </li>
        )}
        {bar.lowest && (
          <li className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-3 w-3 shrink-0 rotate-45" style={{ background: "var(--background)", border: "2px solid var(--chart-ink)" }} />
            <span>
              Lowest on exercise: <strong>{bar.lowest.value}%</strong>
              {bar.lowestBelowScale && <span className="text-xs text-slate-700"> (below this scale)</span>}
            </span>
          </li>
        )}
      </ul>
      {nothing && <p className="mt-2 text-sm text-slate-700">{view.measuresFailed ? "We couldn't load the oxygen readings just now. They are not missing." : patient ? "No oxygen reading yet." : "No oxygen reading recorded yet."}</p>}
      {view.oxygenCheck.stop && view.oxygenCheck.reason && (
        <p role="status" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950" data-testid="oxygen-stop">
          {view.oxygenCheck.reason[patient ? "patient" : "clinician"]}
        </p>
      )}
      <p className="mt-2 text-xs text-slate-700">
        {patient ? "This limit is yours; it differs from patient to patient." : "The limit is this patient's own, not a fixed line."}
        {view.homeOxygen.uses === true ? ` ${patient ? "You use oxygen at home" : "Uses home oxygen"}${view.homeOxygen.prescription ? `: ${view.homeOxygen.prescription}` : ""}.` : ""}
      </p>
    </section>
  );
}

/** How hard to work: the talk test, or a heart-rate range when that applies. */
export function EffortCard({ view, voice }: { view: CardioView; voice: Voice }) {
  const patient = voice === "patient";
  const grade = view.vitals.talkTest?.value ?? null;
  const target = heartRateTargetText(view);
  return (
    <section aria-label="How hard to work" className={CARD} data-testid="effort-card">
      <h3 className="font-display text-base font-bold text-slate-900">How hard to work</h3>
      <p className="mt-0.5 text-sm text-slate-800">{TALK_TEST_GUIDANCE[patient ? "patient" : "clinician"]}</p>
      <ul className="mt-2 space-y-1.5" aria-label="The talk test">
        {TALK_TEST_GRADES.map((g) => (
          <li
            key={g.value}
            className={`flex min-h-[40px] items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
              grade === g.value ? "border-teal-700 bg-teal-50 font-semibold text-teal-950" : "border-slate-200 text-slate-800"
            }`}
          >
            <i aria-hidden className={`fa-solid ${g.value === 0 ? "fa-music" : g.value === 1 ? "fa-comments" : "fa-person-running"} w-4 shrink-0 text-center`} />
            <span className="min-w-0">{g.label}</span>
            {grade === g.value && <span className="ml-auto shrink-0 text-xs">{patient ? "Last time" : "Latest"}</span>}
          </li>
        ))}
      </ul>
      {target ? (
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-900" data-testid="hr-target">
          {target} <span className="text-xs text-slate-700">The talk test still comes first.</span>
        </p>
      ) : (
        <p className="mt-2 text-xs text-slate-700">
          {view.effort.mode === "talk_test" ? view.effort.headline[patient ? "patient" : "clinician"] : ""}.
        </p>
      )}
    </section>
  );
}

function bpText(bp: { systolic: number; diastolic: number | null } | null): string | null {
  return bp ? `${bp.systolic}${bp.diastolic !== null ? `/${bp.diastolic}` : ""}` : null;
}

/** Resting and after-exercise vitals side by side, each with its date. */
export function VitalsStrip({ view, voice }: { view: CardioView; voice: Voice }) {
  const v = view.vitals;
  const rows: { label: string; rest: string | null; after: string | null }[] = [
    { label: "Heart rate", rest: v.restingHeartRate ? String(v.restingHeartRate.value) : null, after: null },
    { label: "Blood pressure", rest: bpText(v.bloodPressureRest), after: bpText(v.bloodPressureAfter) },
    { label: "Oxygen", rest: v.spo2Rest ? `${v.spo2Rest.value}%` : null, after: v.spo2Lowest ? `${v.spo2Lowest.value}%` : null },
    { label: "Breathlessness 0-10", rest: v.breathlessnessRest ? String(v.breathlessnessRest.value) : null, after: v.breathlessnessAfter ? String(v.breathlessnessAfter.value) : null },
  ];
  const restDate = [v.restingHeartRate, v.bloodPressureRest, v.spo2Rest].filter(Boolean).map((r) => r!.measuredAt).sort().pop();
  const afterDate = [v.bloodPressureAfter, v.spo2Lowest, v.breathlessnessAfter].filter(Boolean).map((r) => r!.measuredAt).sort().pop();
  const empty = (
    <span className="font-normal text-slate-600">
      {view.measuresFailed ? "unavailable" : "-"}
    </span>
  );
  return (
    <section aria-label="Vitals" className={CARD} data-testid="vitals-strip">
      <h3 className="font-display text-base font-bold text-slate-900">{voice === "patient" ? "Your readings" : "Vitals"}</h3>
      <table className="mt-2 w-full table-fixed text-sm">
        <caption className="sr-only">Latest readings at rest and after the walk</caption>
        <thead>
          <tr className="text-left text-xs text-slate-700">
            <th scope="col" className="w-[40%] pb-1 font-semibold">
              <span className="sr-only">Reading</span>
            </th>
            <th scope="col" className="pb-1 font-semibold">
              At rest
              {restDate && <span className="block font-normal text-slate-600">{formatClinicDate(restDate)}</span>}
            </th>
            <th scope="col" className="pb-1 font-semibold">
              After the walk
              {afterDate && <span className="block font-normal text-slate-600">{formatClinicDate(afterDate)}</span>}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className="py-2 pr-2 text-left text-xs font-semibold text-slate-800 [overflow-wrap:anywhere]">
                {r.label}
              </th>
              <td className="py-2 font-display text-lg font-extrabold text-slate-900">{r.rest ?? empty}</td>
              <td className="py-2 font-display text-lg font-extrabold text-slate-900">{r.after ?? empty}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-xs text-slate-700">
        {voice === "patient" ? "After the walk, the oxygen shown is the lowest it went." : "After the walk: the lowest oxygen on exercise. The heart rate straight after a walk is not stored."}
      </p>
    </section>
  );
}

/** Breathlessness in daily life, the mMRC grade 0-4 in plain words. */
export function BreathlessnessGradeCard({ view, voice }: { view: CardioView; voice: Voice }) {
  const patient = voice === "patient";
  const m = view.mmrc;
  return (
    <section aria-label="Breathlessness in daily life" className={CARD} data-testid="mmrc-card">
      <h3 className="font-display text-base font-bold text-slate-900">{patient ? "Breathlessness in daily life" : "Breathlessness (mMRC)"}</h3>
      {m ? (
        <>
          <p className="mt-0.5 text-sm text-slate-800">
            <span className="font-display text-xl font-extrabold text-slate-900">Grade {m.grade}</span> of 4
          </p>
          <ol className="mt-2 grid grid-cols-5 gap-1" aria-label="mMRC grades 0 to 4">
            {CARDIO_MMRC_OPTIONS.map((_, i) => (
              <li key={i} className={`flex min-h-[36px] items-center justify-center rounded-lg border text-sm font-bold ${i === m.grade ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 text-slate-700"}`}>
                {i}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-sm text-slate-900">{CARDIO_MMRC_OPTIONS[m.grade]}</p>
          <p className="mt-1 text-xs text-slate-700">{m.source === "intake" ? (patient ? "From what you told us when you filled in your record." : "From the intake answer; a measured grade replaces it.") : "From the latest measured grade."}</p>
        </>
      ) : (
        <p className="mt-1 text-sm text-slate-700">Not asked yet.</p>
      )}
    </section>
  );
}

/** "Stop and tell your physiotherapist": gentle for the patient, never
 *  diagnostic, with their own oxygen limit named. */
export function StopBox({ view, voice }: { view: CardioView; voice: Voice }) {
  const patient = voice === "patient";
  const items = stopAtOnceItems(CARDIO_STOP_AT_ONCE, view.limit.percent, voice);
  return (
    <section aria-label="When to stop" className="min-w-0 rounded-xl border border-rose-200 bg-rose-50 p-3.5 sm:p-4" data-testid="stop-box">
      <h3 className="flex items-center gap-2 font-display text-base font-bold text-rose-950">
        <i aria-hidden className="fa-solid fa-hand text-sm" />
        {patient ? "Stop and tell your physiotherapist" : "Stop the exercise and review"}
      </h3>
      <p className="mt-0.5 text-sm text-rose-950">{patient ? "Please stop and rest if you notice any of these, then let your physiotherapist know:" : "Stop at once if the patient has any of these:"}</p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-rose-950">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The surgeon's breastbone precautions as a dated step beside the plan's
 * milestones: the day they end (clinic zone), how long is left, and that the
 * surgeon - not the profile - lifts them. Drawn only for a record that has
 * them (after open-heart surgery); "end date not clear" is said, never
 * assumed to have passed.
 */
export function PrecautionsStep({ view, voice }: { view: CardioView; voice: Voice }) {
  const p = view.precautions;
  if (p.status === "not_applicable") return null;
  const patient = voice === "patient";
  const head =
    p.status === "active"
      ? `Breastbone precautions end on ${formatClinicDate(p.until)}`
      : p.status === "ended"
        ? `Breastbone precautions ended on ${formatClinicDate(p.until)}`
        : "Breastbone precautions: the end date is not clear yet";
  const detail =
    p.status === "active"
      ? `${p.daysLeft} ${p.daysLeft === 1 ? "day" : "days"} to go. ${patient ? "Until then, keep to what your surgeon asked" : "Until then, keep to the surgeon's limits"}${p.text ? `: ${p.text}` : ""}.`
      : p.status === "ended"
        ? `${patient ? "Check with your surgeon before you lift heavier things" : "Check with the surgeon before lifting the limits"}${p.text ? ` (they were: ${p.text})` : ""}.`
        : `${patient ? "Ask your surgeon for the date" : "Ask the surgeon for the date"}${p.rawUntil ? `; it was written as "${p.rawUntil}"` : ""}.`;
  return (
    <div className="mt-4 flex min-w-0 items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5" data-testid="precautions-step">
      <i aria-hidden className="fa-solid fa-shield-heart mt-0.5 text-amber-900" />
      <div className="min-w-0">
        <p className="text-sm font-bold text-amber-950 [overflow-wrap:anywhere]">{head}</p>
        <p className="text-sm text-amber-950">{detail}</p>
      </div>
    </div>
  );
}
