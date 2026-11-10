import { OUTCOME_MEASURES, type OutcomeMeasure } from "@/lib/outcomeMeasures";

// The licensed outcome measures and the clinic's switch for them.
//
// A licensed scale (Barthel, Oswestry, MDS-UPDRS III...) exists in the
// registry and ships switched off; the clinic switches one on from
// Settings -> Clinical Questions once it has confirmed it holds the licence.
// The switch is `site_settings.enabled_licensed_measures` (a jsonb array of
// measure keys), written through /api/admin/update-setting and read in its
// own call by loadEnabledLicensedMeasures() in outcomeServer.ts -- failing
// CLOSED: a value that cannot be read switches nothing on.
//
// Dependency-free, so the route's validation, the Settings control and the
// loaders agree on what a valid selection is.

/** Every licensed measure in the registry, in registry order. */
export const LICENSED_MEASURES: readonly OutcomeMeasure[] = OUTCOME_MEASURES.filter((m) => m.licence === "licensed");

const LICENSED_KEYS = new Set(LICENSED_MEASURES.map((m) => m.key));

export function isLicensedMeasureKey(key: unknown): key is string {
  return typeof key === "string" && LICENSED_KEYS.has(key);
}

/** What the stored value switches on: known licensed keys only, once each,
 *  in registry order. Anything else -- a key a later release removed, a
 *  free measure, a non-array -- switches nothing on. */
export function parseEnabledLicensedMeasures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const picked = new Set(raw.filter(isLicensedMeasureKey));
  return LICENSED_MEASURES.map((m) => m.key).filter((k) => picked.has(k));
}

/** A selection an admin sent, normalised -- or refused when it names
 *  something that is not a licensed measure (a typo must not read as
 *  "saved" while switching nothing on). */
export function normaliseLicensedMeasureSelection(
  raw: unknown
): { ok: true; keys: string[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "value must be a list of measures" };
  for (const entry of raw) {
    if (!isLicensedMeasureKey(entry)) return { ok: false, error: "Unknown licensed measure." };
  }
  return { ok: true, keys: parseEnabledLicensedMeasures(raw) };
}

/** The read of the switch: what it holds, or that it could not be read.
 *  "Unreadable" is not "none switched on" -- a route asked to record a
 *  licensed scale says it could not check, rather than that the scale is
 *  off -- but it enables nothing either way. */
export type LicensedMeasuresRead = { status: "ok"; keys: string[] } | { status: "unreadable" };

/** The set validateMeasurement() takes. Fails closed. */
export function enabledLicensedSet(read: LicensedMeasuresRead): ReadonlySet<string> {
  return read.status === "ok" ? new Set(read.keys) : new Set();
}
