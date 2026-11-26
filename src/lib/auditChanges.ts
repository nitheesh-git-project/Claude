/**
 * What an edit changed, in the shape the audit log reads as before/after.
 *
 * An edit route used to log only that something was edited -- the condition
 * editor wrote "catalog.update · Treatment category" for a price change and
 * kept neither price -- so the log could say who touched a record but not
 * what it used to be. Each such route now reads the row before it writes and
 * passes both to this, and the log's detail dialog (activityDetails.ts)
 * pairs every `previousX` with its `x` into a "What changed" row: a key
 * ending in `paise` prints as rupees, one ending in `percent` as a
 * percentage.
 *
 * Only fields that actually changed are returned, so a save that touched
 * nothing logs nothing misleading. Column names may be snake_case; the keys
 * come back camelCase (`price_paise` -> `previousPricePaise`, `pricePaise`).
 *
 * Dependency-free so the rule can be tested without a database.
 */

function camel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function pascal(key: string): string {
  const c = camel(key);
  return c.length > 0 ? c[0].toUpperCase() + c.slice(1) : c;
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // Null and undefined are one "not set"; numbers from numeric columns can
  // come back as strings ("12.50"), so compare those by value.
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  if (typeof a === "string" && typeof b === "number") return Number(a) === b;
  if (typeof a === "number" && typeof b === "string") return a === Number(b);
  return JSON.stringify(a) === JSON.stringify(b);
}

export function auditChanges(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>,
  fields: readonly string[] = Object.keys(after)
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (!(field in after)) continue;
    const was = before ? before[field] : undefined;
    const now = after[field];
    if (before && same(was, now)) continue;
    out[`previous${pascal(field)}`] = was === undefined ? null : was;
    out[camel(field)] = now === undefined ? null : now;
  }
  return out;
}
