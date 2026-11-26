/**
 * What a rate refresh does with each new rate: use it, or hold it for an
 * admin.
 *
 * Rates used to change only when an admin tapped Refresh. They now also
 * refresh by themselves once a day (maintenanceSweep -> refreshExchangeRates),
 * and a rate is the one input to a foreign price nobody types. So a new rate
 * that would move a switched-on country's price by more than
 * RATE_HOLD_PERCENT is not used straight away: it is kept beside the current
 * one as pending, the country keeps charging what it charged, and admin Home
 * asks someone to look. A country that is switched off charges nobody, so
 * its rate is simply updated.
 *
 * The price moves with the rate (raise, convert, round up), so the rate's
 * own change is the price's change before rounding -- the measure used here.
 *
 * Dependency-free so the rule can be tested without a database or a network.
 */

/** A move bigger than this, either way, waits for an admin (the owner's 10%). */
export const RATE_HOLD_PERCENT = 10;

/** Refresh by itself once the newest rate is this old. The sweep runs every
 *  half hour; this keeps it to one fetch a day. */
export const AUTO_REFRESH_AFTER_HOURS = 20;

export type StoredRate = {
  code: string;
  enabled: boolean;
  unitsPerInr: number | null;
};

export type FetchedRate = { code: string; currency: string; rate: number };

export type HeldRate = FetchedRate & {
  /** The rate still in use. */
  current: number;
  /** The move, as a signed percentage of the current rate (12.5, -11). */
  movePercent: number;
};

export type RatePlan = {
  /** Used now: rate and its time are written as today. */
  apply: FetchedRate[];
  /** Kept as pending; the country keeps its current rate. */
  hold: HeldRate[];
};

/** The move from one rate to another, as a signed percentage, one decimal. */
export function rateMovePercent(current: number, next: number): number {
  return Math.round(((next - current) / current) * 1000) / 10;
}

export function planRateRefresh(stored: readonly StoredRate[], fetched: readonly FetchedRate[]): RatePlan {
  const byCode = new Map(stored.map((s) => [s.code, s]));
  const plan: RatePlan = { apply: [], hold: [] };
  for (const f of fetched) {
    const was = byCode.get(f.code);
    const current = was?.unitsPerInr ?? null;
    if (was?.enabled && typeof current === "number" && current > 0) {
      const move = rateMovePercent(current, f.rate);
      if (Math.abs(move) > RATE_HOLD_PERCENT) {
        plan.hold.push({ ...f, current, movePercent: move });
        continue;
      }
    }
    plan.apply.push(f);
  }
  return plan;
}

/** Whether the daily refresh is due: never fetched counts as not set up
 *  (the admin fetches the first rates themselves), not as due. */
export function autoRefreshDue(newestFetchedAt: string | null | undefined, nowMs: number): boolean {
  if (!newestFetchedAt) return false;
  const t = Date.parse(newestFetchedAt);
  if (!Number.isFinite(t)) return false;
  return nowMs - t >= AUTO_REFRESH_AFTER_HOURS * 3_600_000;
}

/**
 * Admin Home's "Exchange rates to check" row: the switched-on countries
 * whose rate is waiting on a decision, plus -- when the stored rates are
 * older than the stale line (a week, RATE_STALE_AFTER_HOURS) -- every
 * switched-on country, since each is priced from an old rate. Nothing while
 * local prices are off: nobody is charged from these rates then.
 */
export function ratesNeedingAttention(args: {
  internationalEnabled: boolean;
  rows: readonly { code: string; enabled: boolean; pendingUnitsPerInr: number | null }[];
  stale: boolean;
}): { count: number; pending: number; stale: boolean } {
  if (!args.internationalEnabled) return { count: 0, pending: 0, stale: false };
  const on = args.rows.filter((r) => r.enabled);
  const pending = on.filter((r) => r.pendingUnitsPerInr !== null).length;
  const count = args.stale && on.length > 0 ? on.length : pending;
  return { count, pending, stale: args.stale && on.length > 0 };
}
