import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * A therapist's cut is computed in exactly one place.
 *
 * Item 126 was closed in the first pass as "a direction rather than a task",
 * which is the shape of finding that never gets acted on. Turning it into a
 * walk is what made it a task -- and the walk immediately found two live money
 * bugs that four separate readings of these files had missed:
 *
 *   - `/api/therapist/request-payout` reduced over
 *     `amount_paid_paise * revenue_share_percent`, so a therapist who does
 *     home visits requested a figure that disagreed with Money -> Payouts and
 *     with what the Pay button transfers -- no home-visit rate, no travel fee,
 *     and its `payment_status = 'paid'` filter silently dropped every
 *     delivered pay-later session.
 *   - `PatientDetailContent`'s profit chart did the same multiplication, so a
 *     home visit's profit was overstated by exactly the travel fee the clinic
 *     passes straight through.
 *
 * Both are the therapist profile's own corrected bug, surviving elsewhere
 * because the arithmetic lived in more than one place. This is the same shape
 * and the same reasoning as `formatDateTime.test.ts`'s walk for unzoned dates:
 * a mistake that produces no error, no failed request and no wrong row -- only
 * a wrong number that every screen agrees on.
 */

const SRC = path.join(process.cwd(), "src");

/**
 * Files allowed to multiply by a share percentage: the modules that own the
 * rule, and their tests. Adding a file here is a deliberate decision and
 * wants the reason written down beside it.
 */
const ALLOWED = new Set([
  // The one implementation.
  "lib/therapistPayouts.ts",
  // Home-visit pricing owns the travel/share split for a *visit*, and
  // therapistPayouts composes it rather than the other way round.
  "lib/homeVisitPricing.ts",
  // The clinic-wide split, which divides net revenue rather than paying one
  // person -- a different question over the same percentages.
  "lib/adminMetrics.ts",
  // Settling is the write that pays it, and re-derives server-side by design.
  "app/api/admin/settle-therapist-payout/route.ts",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("a therapist's cut has one implementation", () => {
  it("nothing outside the owning modules multiplies by a share percentage", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = path.relative(SRC, file).split(path.sep).join("/");
      if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;
      if (ALLOWED.has(rel)) continue;
      const text = readFileSync(file, "utf8");
      for (const [i, raw] of text.split("\n").entries()) {
        const line = raw.trim();
        // A comment naming the column -- including one explaining why this
        // rule exists -- is not an implementation of it. Without this the
        // walk flags its own documentation, which is how a check earns a
        // reputation for crying wolf.
        if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
        // `x * <something>share_percent` or the same divided by 100 -- the
        // shape both live bugs took. A mention of the column is fine; doing
        // arithmetic with it is what this forbids.
        if (/\*\s*[^;]*share_percent/.test(line) || /share_percent[^;]*\)\s*\/\s*100/.test(line)) {
          offenders.push(`${rel}:${i + 1}`);
        }
      }
    }
    expect(
      offenders,
      `These compute a therapist's cut themselves. Call sessionTherapistCutPaise() ` +
        `or computeTherapistPayoutSummary() instead -- an inline version has no ` +
        `home-visit rate and no travel fee, which is how two screens came to quote ` +
        `a therapist a different figure from the one the Pay button transfers.`
    ).toEqual([]);
  });
});
