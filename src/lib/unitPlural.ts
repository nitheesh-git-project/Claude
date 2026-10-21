// A measure's unit as it follows ONE number. The registry stores units in the
// plural ("steps", "seconds", "episodes / week") because that is how most
// readings go; a reading of exactly 1 must say "1 step", not "1 steps".
// Dependency-free so a tile, a table, a graph, a PDF and a text summary all
// answer the same way. Stored data and registry keys are never touched.

const SINGULAR: Readonly<Record<string, string>> = {
  steps: "step",
  seconds: "second",
  minutes: "minute",
  episodes: "episode",
  stands: "stand",
  metres: "metre",
  meters: "meter",
  months: "month",
  weeks: "week",
  days: "day",
  hours: "hour",
  falls: "fall",
  sessions: "session",
  repetitions: "repetition",
  reps: "rep",
  points: "point",
};

/** "steps" -> "step"; "episodes / week" -> "episode / week"; "min / week",
 *  "m/s", "degrees" and range labels pass through unchanged. */
export function singularUnit(unit: string): string {
  if (unit === "near misses") return "near miss";
  return unit.replace(/^([A-Za-z]+)(?=\s|$)/, (word) => SINGULAR[word.toLowerCase()] ?? word);
}

/** The unit to print beside a value already formatted for display: singular
 *  when the shown number is exactly 1 (or -1), otherwise as given. */
export function unitForValue(unit: string, shownValue: string | number): string {
  const shown = typeof shownValue === "number" ? String(shownValue) : shownValue.trim();
  return shown === "1" || shown === "-1" ? singularUnit(unit) : unit;
}
