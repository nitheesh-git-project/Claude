import {
  SIX_MINUTE_WALK_EQUATIONS,
  SIX_MINUTE_WALK_EQUATION_NOT_CHOSEN,
  type SixMinuteWalkEquationKey,
} from "@/lib/clinicalCalculators";

// Which predicted-distance equation the six-minute walk's "% of predicted"
// uses -- the clinic's choice, not a constant (the handbook: pick one and use
// it consistently, and name it under the figure).
//
// The setting is `site_settings.six_minute_walk_equation` (nullable text),
// written through /api/admin/update-setting from Settings -> Clinical
// Questions and read in its own call by loadSixMinuteWalkEquation()
// (outcomeServer.ts), never through SITE_SETTINGS_SELECT. Null, a key a
// later release removed, the placeholder key and an unreadable read all mean
// the same thing on screen: the formula has not been chosen, so no
// percentage is shown. **Nothing here falls back to the US equation**: it is
// selectable, labelled "US adults", and used only once an admin picks it.
//
// Dependency-free, so the route's validation, the Settings control, the
// loader and the guide agree on what a valid choice is.

export const SIX_MINUTE_WALK_EQUATION_SETTING = "six_minute_walk_equation";

/** An equation the clinic can actually choose: one that predicts. The
 *  placeholder (no formula yet) is not a choice; clearing the setting is. */
export function isChoosableSixMinuteWalkEquation(key: unknown): key is SixMinuteWalkEquationKey {
  if (typeof key !== "string" || !Object.prototype.hasOwnProperty.call(SIX_MINUTE_WALK_EQUATIONS, key)) return false;
  return SIX_MINUTE_WALK_EQUATIONS[key as SixMinuteWalkEquationKey].predict !== null;
}

/** The options the Settings control lists, in table order. */
export function sixMinuteWalkEquationOptions(): { key: SixMinuteWalkEquationKey; label: string; population: string }[] {
  return (Object.keys(SIX_MINUTE_WALK_EQUATIONS) as SixMinuteWalkEquationKey[])
    .filter(isChoosableSixMinuteWalkEquation)
    .map((key) => ({ key, label: SIX_MINUTE_WALK_EQUATIONS[key].label, population: SIX_MINUTE_WALK_EQUATIONS[key].population }));
}

/** What the stored value means. Anything that is not a choosable key --
 *  null, a removed key, the placeholder -- is "not chosen". */
export function parseSixMinuteWalkEquationSetting(raw: unknown): { key: SixMinuteWalkEquationKey; chosen: boolean } {
  return isChoosableSixMinuteWalkEquation(raw) ? { key: raw, chosen: true } : { key: SIX_MINUTE_WALK_EQUATION_NOT_CHOSEN, chosen: false };
}

/** A choice an admin sent, normalised: a choosable key, or null (blank,
 *  null or the placeholder key) to go back to "not chosen yet". Anything
 *  else is refused -- a typo must not read as saved while changing nothing. */
export function normaliseSixMinuteWalkEquationChoice(raw: unknown): { ok: true; value: SixMinuteWalkEquationKey | null } | { ok: false; error: string } {
  if (raw === null || raw === "" || raw === SIX_MINUTE_WALK_EQUATION_NOT_CHOSEN) return { ok: true, value: null };
  if (isChoosableSixMinuteWalkEquation(raw)) return { ok: true, value: raw };
  return { ok: false, error: "Unknown six-minute walk equation." };
}

/** The read of the setting: what it holds, or that it could not be read. */
export type SixMinuteWalkEquationRead =
  | { status: "ok"; key: SixMinuteWalkEquationKey; chosen: boolean }
  | { status: "unreadable" };

/** The key a screen passes to the guide: the placeholder unless the read
 *  succeeded and holds a choice. */
export function sixMinuteWalkEquationKeyFor(read: SixMinuteWalkEquationRead): SixMinuteWalkEquationKey {
  return read.status === "ok" ? read.key : SIX_MINUTE_WALK_EQUATION_NOT_CHOSEN;
}
