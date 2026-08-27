import { isAnswered, parseMultiSelect, type IntakeQuestion } from "@/lib/conditionIntake";

// The NEUROLOGICAL summary. Its vocabulary is function and independence,
// not pain: the headline is the event and when it happened, the gauge is
// how much of the day the patient can manage alone, and the chips are
// which symptoms are present and how they get about.
//
// It deliberately imports nothing from painMap.ts. The Pain Map is an
// ortho-only layer, and that import boundary is what keeps it so in
// practice rather than only in intent.

const INDEPENDENCE_WORD = (value: number) =>
  value <= 3 ? "Needs a lot of help" : value <= 6 ? "Partly independent" : "Mostly independent";

// Higher is better here, the opposite of a pain score, so the colours run
// the other way: green at ten, red at zero.
const INDEPENDENCE_CHIP = (value: number) =>
  value <= 3
    ? "bg-red-50 text-red-700 border-red-200"
    : value <= 6
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-emerald-50 text-emerald-700 border-emerald-200";

const INDEPENDENCE_DOT = (value: number) =>
  value <= 3 ? "bg-red-500" : value <= 6 ? "bg-amber-500" : "bg-emerald-500";

const FALLS_IS_CONCERNING = (falls: string) =>
  falls.startsWith("Two") || falls.startsWith("More");

/** Any question this card has no designed slot for, so a question added
 *  later is never silently dropped from the patient's own view. */
function GenericAnswer({ question, value }: { question: IntakeQuestion; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {question.shortLabel ?? question.label}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{value}</p>
    </div>
  );
}

export default function NeuroSummaryCard({
  questions,
  data,
}: {
  questions: IntakeQuestion[];
  data: Record<string, string>;
}) {
  const byKey = new Map(questions.map((q) => [q.key, q]));
  const value = (key: string) => (data[key] ?? "").trim();

  const diagnosis = value("neuro_diagnosis");
  const affectedSide = value("neuro_affected_side");
  const mobility = value("neuro_mobility");
  const independenceRaw = Number.parseInt(value("neuro_independence"), 10);
  const independence = Number.isFinite(independenceRaw) ? independenceRaw : null;
  const symptoms = parseMultiSelect(data.neuro_symptoms);
  const falls = value("neuro_falls");
  const goal = value("neuro_goal");

  const designedKeys = new Set([
    "neuro_diagnosis",
    "neuro_affected_side",
    "neuro_mobility",
    "neuro_independence",
    "neuro_symptoms",
    "neuro_falls",
    "neuro_goal",
  ]);
  const extras = questions.filter((q) => !designedKeys.has(q.key) && isAnswered(q, data));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-violet-50/80 via-white to-white p-4 sm:p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
          {byKey.get("neuro_diagnosis")?.shortLabel ?? "Condition & onset"}
        </p>
        {diagnosis ? (
          <p className="mt-1.5 font-display text-lg font-bold leading-snug text-slate-800">
            {diagnosis}
          </p>
        ) : (
          <p className="mt-1.5 text-sm text-slate-400">Not answered yet</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {affectedSide && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
              title="Which part of the body is affected"
            >
              <i aria-hidden className="fa-solid fa-person-half-dress text-[10px] text-slate-400" />
              {affectedSide}
            </span>
          )}
          {mobility && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
              title="How they move around indoors"
            >
              <i aria-hidden className="fa-solid fa-person-walking text-[10px] text-slate-400" />
              {mobility}
            </span>
          )}
          {independence !== null && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${INDEPENDENCE_CHIP(independence)}`}
            >
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${INDEPENDENCE_DOT(independence)}`} />
              {INDEPENDENCE_WORD(independence)} · {independence}/10
            </span>
          )}
        </div>

        {independence !== null && (
          <div className="mt-4">
            {/* The gauge runs the opposite way to the orthopaedic pain
                slider on purpose: ten is the good end here, so red sits at
                "needs help with everything" and green at "fully
                independent". A bare number cannot carry that. */}
            <div className="relative h-2 rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400">
              <span
                className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-slate-800 shadow"
                style={{ left: `${(independence / 10) * 100}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <span>Needs help with everything</span>
              <span>Fully independent</span>
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {byKey.get("neuro_symptoms")?.shortLabel ?? "Symptoms"}
        </p>
        {symptoms.length === 0 ? (
          <p className="mt-1.5 text-sm text-slate-400">Nothing ticked yet</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {symptoms.map((symptom) => (
              <li
                key={symptom}
                className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700"
              >
                {symptom}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div
          className={`rounded-xl border p-3.5 ${
            falls && FALLS_IS_CONCERNING(falls)
              ? "border-red-200 bg-red-50/70"
              : "border-slate-100 bg-white"
          }`}
        >
          <p
            className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${
              falls && FALLS_IS_CONCERNING(falls) ? "text-red-600" : "text-slate-400"
            }`}
          >
            <i aria-hidden className="fa-solid fa-triangle-exclamation text-[10px]" />
            {byKey.get("neuro_falls")?.shortLabel ?? "Falls"}
          </p>
          <p className={`mt-1 text-sm ${falls ? "text-slate-700" : "text-slate-400"}`}>
            {falls ? `${falls} in the last three months` : "Not answered yet"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-3.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
            <i aria-hidden className="fa-solid fa-flag-checkered text-[10px]" />
            {byKey.get("neuro_goal")?.shortLabel ?? "Main goal"}
          </p>
          <p className={`mt-1 whitespace-pre-wrap text-sm ${goal ? "text-slate-700" : "text-slate-400"}`}>
            {goal || "Not answered yet"}
          </p>
        </div>
      </div>

      {extras.map((q) => (
        <GenericAnswer key={q.key} question={q} value={data[q.key]} />
      ))}
    </div>
  );
}
