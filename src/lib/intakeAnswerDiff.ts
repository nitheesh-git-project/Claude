// How an intake answer reads as one line, and what changed between two sets of
// answers.
//
// `answerText` lived inside the admin's condition screen; the "Edit answers"
// confirmation needs the same reading on the client, and a second copy would
// drift (an area-pain list is JSON in storage and must never reach a person as
// JSON). Dependency-free beyond conditionIntake, so both are unit-tested.

import {
  formatAreaPainForText,
  parseAreaPain,
  parseMultiSelect,
  visibleQuestions,
  type IntakeQuestion,
} from "@/lib/conditionIntake";

/** One answer as a line of text, whatever its input type; null when empty. */
export function answerText(
  question: Pick<IntakeQuestion, "inputType">,
  raw: string | undefined,
  regionLabel: (region: string) => string = (r) => r
): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (question.inputType === "area_pain_list") {
    const lines = formatAreaPainForText(parseAreaPain(value), regionLabel);
    return lines.length > 0 ? lines.join(" · ") : null;
  }
  if (question.inputType === "multi_select") {
    const picked = parseMultiSelect(value);
    return picked.length > 0 ? picked.join(", ") : null;
  }
  if (question.inputType === "scale_0_10") return `${value}/10`;
  return value;
}

export type AnswerChange = { key: string; label: string; before: string | null; after: string | null };

/**
 * The questions whose answer differs between `before` and `after`, among the
 * ones these answers actually ask (a closed follow-up keeps its stored answer
 * and is sent back unchanged, so it is not a change anybody made). Compared as
 * the person would read them: stored text that differs only by surrounding
 * whitespace is not a change.
 */
export function diffIntakeAnswers(
  questions: readonly IntakeQuestion[],
  before: Readonly<Record<string, string | undefined>>,
  after: Readonly<Record<string, string | undefined>>,
  regionLabel: (region: string) => string = (r) => r
): AnswerChange[] {
  const changes: AnswerChange[] = [];
  for (const q of visibleQuestions(questions, after)) {
    const b = answerText(q, before[q.key], regionLabel);
    const a = answerText(q, after[q.key], regionLabel);
    if (b !== a) changes.push({ key: q.key, label: q.label, before: b, after: a });
  }
  return changes;
}

/** The confirmation text for a direct edit, one line per change. */
export function describeAnswerChanges(patientName: string, changes: readonly AnswerChange[]): string {
  const shown = changes.slice(0, 8).map((c) => `${c.label}: ${c.before ?? "(blank)"} → ${c.after ?? "(cleared)"}`);
  const more = changes.length > shown.length ? `\n...and ${changes.length - shown.length} more` : "";
  return `Save ${changes.length} change${changes.length === 1 ? "" : "s"} to ${patientName}'s Health Profile? It applies straight away, without the review queue.\n\n${shown.join("\n")}${more}`;
}
