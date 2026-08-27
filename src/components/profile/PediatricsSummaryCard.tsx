import { isAnswered, parseMultiSelect, type IntakeQuestion } from "@/lib/conditionIntake";

// The PAEDIATRIC summary. Its vocabulary is milestones, not pain: the
// headline is the caregiver's concern in their own words, the meter is
// how many milestones the child has reached, and the chips are the birth
// history and any diagnosis.
//
// The respondent line is prominent rather than tucked away. A paediatric
// record is somebody speaking for someone else, and a chart that does not
// say who is speaking is a chart a second clinician cannot read.
//
// Like NeuroSummaryCard, it imports nothing from painMap.ts -- that
// boundary is what keeps the Pain Map an ortho-only layer in practice.

/** Any question this card has no designed slot for, so a question added
 *  later is never silently dropped from the caregiver's own view. */
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

export default function PediatricsSummaryCard({
  questions,
  data,
}: {
  questions: IntakeQuestion[];
  data: Record<string, string>;
}) {
  const byKey = new Map(questions.map((q) => [q.key, q]));
  const value = (key: string) => (data[key] ?? "").trim();

  const concern = value("peds_concern");
  const birthHistory = value("peds_birth_history");
  const diagnosis = value("peds_diagnosis");
  const equipment = value("peds_equipment");
  const difficulty = value("peds_daily_difficulty");
  const goal = value("peds_goal");
  const caregiverName = value("peds_caregiver_name");
  const caregiverRelationship = value("peds_caregiver_relationship");

  const allMilestones = byKey.get("peds_milestones")?.options ?? [];
  const reached = new Set(parseMultiSelect(data.peds_milestones));

  const designedKeys = new Set([
    "peds_caregiver_name",
    "peds_caregiver_relationship",
    "peds_concern",
    "peds_birth_history",
    "peds_milestones",
    "peds_diagnosis",
    "peds_equipment",
    "peds_daily_difficulty",
    "peds_goal",
  ]);
  const extras = questions.filter((q) => !designedKeys.has(q.key) && isAnswered(q, data));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-amber-50/80 via-white to-white p-4 sm:p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
          {byKey.get("peds_concern")?.shortLabel ?? "Main concern"}
        </p>
        {concern ? (
          <p className="mt-1.5 font-display text-lg font-bold leading-snug text-slate-800">
            {concern}
          </p>
        ) : (
          <p className="mt-1.5 text-sm text-slate-400">Not answered yet</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {birthHistory && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
              title="How the child was born"
            >
              <i aria-hidden className="fa-solid fa-baby text-[10px] text-slate-400" />
              {birthHistory}
            </span>
          )}
          {diagnosis && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700"
              title="What a doctor has said"
            >
              <i aria-hidden className="fa-solid fa-stethoscope text-[10px]" />
              {diagnosis}
            </span>
          )}
          {equipment && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
              title="Braces, splints, walkers or special footwear"
            >
              <i aria-hidden className="fa-solid fa-wheelchair-move text-[10px] text-slate-400" />
              {equipment}
            </span>
          )}
        </div>
        {caregiverName && (
          <p className="mt-3 text-xs text-slate-500">
            Answered by <span className="font-semibold text-slate-700">{caregiverName}</span>
            {caregiverRelationship ? ` (${caregiverRelationship.toLowerCase()})` : ""}
          </p>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {byKey.get("peds_milestones")?.shortLabel ?? "Milestones"}
          </p>
          {allMilestones.length > 0 && (
            <p className="text-xs font-semibold text-slate-600">
              {reached.size} of {allMilestones.length} reached
            </p>
          )}
        </div>
        {/* The milestone list stands where the orthopaedic pain gauge
            stands: it is what this specialty measures progress by, so
            every milestone is shown, reached or not. Hiding the ones not
            yet reached would turn a progress line into a list of
            achievements and lose the "what comes next" the caregiver is
            actually looking for. */}
        {allMilestones.length === 0 ? (
          <p className="mt-1.5 text-sm text-slate-400">Not answered yet</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {allMilestones.map((milestone) => {
              const done = reached.has(milestone);
              return (
                <li
                  key={milestone}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold ${
                    done
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-dashed border-slate-200 bg-slate-50/60 text-slate-400"
                  }`}
                >
                  <i
                    aria-hidden
                    className={`fa-solid ${done ? "fa-check" : "fa-hourglass-half"} text-[10px]`}
                  />
                  {milestone}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-white p-3.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-red-500">
            <i aria-hidden className="fa-solid fa-hand text-[10px]" />
            {byKey.get("peds_daily_difficulty")?.shortLabel ?? "Hardest day-to-day"}
          </p>
          <p
            className={`mt-1 whitespace-pre-wrap text-sm ${difficulty ? "text-slate-700" : "text-slate-400"}`}
          >
            {difficulty || "Not answered yet"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-3.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
            <i aria-hidden className="fa-solid fa-flag-checkered text-[10px]" />
            {byKey.get("peds_goal")?.shortLabel ?? "Your goal"}
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
