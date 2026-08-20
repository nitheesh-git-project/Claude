import { PAIN_MAP_REGIONS } from "@/lib/painMap";
import { isAnswered, parseAreaPain, type IntakeQuestion } from "@/lib/conditionIntake";

// A self-reported 0-10 maps onto the same three bands the clinical Pain
// Map uses (see painBand), so a patient's own "7" is colored the same as
// a therapist's 70% and the two layers read as one condition.
const selfBand = (pain: number) => (pain <= 3 ? "low" : pain <= 6 ? "mid" : "high");

const BAND_CHIP: Record<string, string> = {
  low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  mid: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-red-50 text-red-700 border-red-200",
};

const BAND_DOT: Record<string, string> = {
  low: "bg-emerald-500",
  mid: "bg-amber-500",
  high: "bg-red-500",
};

const SEVERITY_WORD = (value: number) => (value <= 3 ? "Mild" : value <= 6 ? "Moderate" : "Severe");

const regionLabel = (key: string) => PAIN_MAP_REGIONS.find((r) => r.key === key)?.label ?? key;

/** A question this card has no designed slot for -- shown as a plain
 *  labelled block so a future added question is never silently dropped
 *  from the patient's own view of their answers. */
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

/**
 * The patient's own answers, rendered as a piece of their chart rather
 * than as a filled-in form: the complaint reads as a headline, severity
 * as a gauge, painful areas as colored chips.
 *
 * This is what a completed profile looks like at rest. The form itself
 * only exists inside the wizard pop-up (ConditionIntakeWizard), so the
 * dashboard never shows input fields -- a page of inputs reads as unpaid
 * homework, a page of answers reads as care already taken.
 */
export default function ConditionSummaryCard({
  questions,
  data,
}: {
  questions: IntakeQuestion[];
  data: Record<string, string>;
}) {
  const byKey = new Map(questions.map((q) => [q.key, q]));
  const value = (key: string) => (data[key] ?? "").trim();

  const complaint = value("chief_complaint");
  const sinceWhen = value("since_when");
  const severityRaw = Number.parseInt(value("severity"), 10);
  const severity = Number.isFinite(severityRaw) ? severityRaw : null;
  const areas = parseAreaPain(data.area_pain);
  const worsens = value("worsens");
  const helps = value("helps");
  const notes = value("notes");

  const designedKeys = new Set([
    "chief_complaint",
    "since_when",
    "severity",
    "area_pain",
    "worsens",
    "helps",
    "notes",
  ]);
  const extras = questions.filter((q) => !designedKeys.has(q.key) && isAnswered(q, data));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-teal-50/80 via-white to-white p-4 sm:p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">
          {byKey.get("chief_complaint")?.shortLabel ?? "Main issue"}
        </p>
        {complaint ? (
          <p className="mt-1.5 font-display text-lg font-bold leading-snug text-slate-800">{complaint}</p>
        ) : (
          <p className="mt-1.5 text-sm text-slate-400">Not answered yet</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {sinceWhen && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
              title="How long this has been going on"
            >
              <i aria-hidden className="fa-solid fa-clock text-[10px] text-slate-400" />
              {sinceWhen}
            </span>
          )}
          {severity !== null && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${BAND_CHIP[selfBand(severity)]}`}
            >
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${BAND_DOT[selfBand(severity)]}`} />
              {SEVERITY_WORD(severity)} · {severity}/10 today
            </span>
          )}
        </div>

        {severity !== null && (
          <div className="mt-4">
            {/* The gauge is the one place a bare number gets context: a 6
                means nothing until you can see where it sits between "no
                pain" and "worst imaginable". */}
            <div className="relative h-2 rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500">
              <span
                className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-slate-800 shadow"
                style={{ left: `${(severity / 10) * 100}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <span>No pain</span>
              <span>Worst imaginable</span>
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {byKey.get("area_pain")?.shortLabel ?? "Painful areas"}
        </p>
        {areas.length === 0 ? (
          <p className="mt-1.5 text-sm text-slate-400">No areas marked on the body map yet</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {areas.map((a) => (
              <li
                key={`${a.region}:${a.side}`}
                className={`rounded-xl border px-3 py-2 ${BAND_CHIP[selfBand(a.pain)]}`}
                title={a.note ?? undefined}
              >
                <span className="flex items-center gap-2 text-xs font-bold">
                  <span aria-hidden className={`h-2 w-2 rounded-full ${BAND_DOT[selfBand(a.pain)]}`} />
                  {regionLabel(a.region)}
                  {a.side !== "na" ? ` (${a.side})` : ""}
                  <span className="font-semibold opacity-80">{a.pain}/10</span>
                </span>
                {a.note && <span className="mt-0.5 block text-[11px] font-medium opacity-80">“{a.note}”</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-white p-3.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-red-500">
            <i aria-hidden className="fa-solid fa-arrow-trend-up text-[10px]" />
            {byKey.get("worsens")?.shortLabel ?? "Makes it worse"}
          </p>
          <p className={`mt-1 text-sm ${worsens ? "text-slate-700" : "text-slate-400"}`}>
            {worsens || "Not answered yet"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-3.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
            <i aria-hidden className="fa-solid fa-arrow-trend-down text-[10px]" />
            {byKey.get("helps")?.shortLabel ?? "What helps"}
          </p>
          <p className={`mt-1 text-sm ${helps ? "text-slate-700" : "text-slate-400"}`}>
            {helps || "Not answered yet"}
          </p>
        </div>
      </div>

      {notes && (
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {byKey.get("notes")?.shortLabel ?? "Other notes"}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{notes}</p>
        </div>
      )}

      {extras.map((q) => (
        <GenericAnswer key={q.key} question={q} value={data[q.key]} />
      ))}
    </div>
  );
}
