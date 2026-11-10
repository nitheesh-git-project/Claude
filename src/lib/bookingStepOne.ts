// What Step 1 of the booking wizard is still waiting for, in the words the
// patient reads beside a disabled Continue button.
//
// Step 1 used to preselect the earliest hour, so Continue was always lit and a
// patient could move on having never looked at the time they were "choosing".
// Now the date is preselected (it is only a starting point on a calendar the
// patient can see) and the hour is left for them to tap. Continue is always
// on screen; while something is unanswered it is disabled and the reason is
// printed next to it, because a dead button with no explanation reads as
// broken.
//
// Dependency-free so the order and the wording are testable without rendering.

export type StepOneAnswers = {
  serviceChosen: boolean;
  dateKey: string;
  hour: number | "";
  language: string;
  /** How many languages the clinic offers. With exactly one there is nothing
   *  to choose, so it is never asked. */
  languageCount: number;
};

/** The first unanswered thing, or null when Continue may go. The order is the
 *  order on the screen: service, date, time, language. */
export function stepOneBlocker(a: StepOneAnswers): string | null {
  if (!a.serviceChosen) return "Choose what you'd like help with to continue";
  if (!a.dateKey) return "Pick a date to continue";
  if (a.hour === "") return "Pick a time to continue";
  if (a.languageCount > 1 && !a.language) return "Pick a language to continue";
  return null;
}

/** The language to start on: the only one when there is one, otherwise none,
 *  so a patient who is offered a choice makes it. */
export function initialLanguage(languages: readonly string[]): string {
  return languages.length === 1 ? languages[0] : "";
}
