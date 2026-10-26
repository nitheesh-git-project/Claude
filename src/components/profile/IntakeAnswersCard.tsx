import { isAnswered, parseMultiSelect, visibleQuestions, type IntakeQuestion } from "@/lib/conditionIntake";

// Every answered, visible question as a labelled tile: the summary card for a
// condition type whose designed card has not shipped yet (Strength and
// balance care and Heart and lung rehabilitation, phase 6a; their designed
// cards are phase 6b). A plain list rather than nothing, so an answer on
// file is never hidden from the patient or the clinician. A hidden
// follow-up (`showWhen`) is not listed - the same visibleQuestions() rule
// every other surface applies.
export default function IntakeAnswersCard({
  questions,
  data,
}: {
  questions: IntakeQuestion[];
  data: Record<string, string>;
}) {
  const answered = visibleQuestions(questions, data).filter((q) => isAnswered(q, data));
  if (answered.length === 0) {
    return <p className="text-sm text-slate-500">Nothing has been recorded yet.</p>;
  }
  return (
    <dl className="grid gap-2.5 sm:grid-cols-2">
      {answered.map((q) => {
        const raw = (data[q.key] ?? "").trim();
        const value = q.inputType === "multi_select" ? parseMultiSelect(raw).join(", ") : raw;
        return (
          <div key={q.key} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {q.shortLabel ?? q.label}
            </dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{value}</dd>
          </div>
        );
      })}
    </dl>
  );
}
