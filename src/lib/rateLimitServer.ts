import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  RATE_LIMITS,
  clientIdentifier,
  rateLimitBucket,
  retryAfterSeconds,
  type RateLimitName,
} from "@/lib/rateLimit";

/**
 * Counts one hit and returns a 429 when the caller has had enough, or null
 * to carry on.
 *
 * Used at the top of a route, before the body is parsed and before anything
 * is read -- the same placement as the `auth.getUser()` check, and for the
 * same reason: a caller being refused should not get to drive the route's
 * parsing first.
 *
 * Three decisions are load-bearing.
 *
 * **It fails open.** A limiter whose own database call fails and then
 * refuses the request has turned a blip into a checkout outage, which is
 * far worse than the burst it would have stopped -- the same direction
 * `contact_scan_mode` fails, and the opposite of `contact_masking_enabled`,
 * because the safe answer genuinely differs by what is at stake. The
 * failure is logged so it is not silent.
 *
 * **It counts before it decides.** The database increments on every call
 * including refused ones, so a caller who keeps hammering cannot hold their
 * own window open; see the note on `check_rate_limit`.
 *
 * **No identifier means no limit.** With neither `x-real-ip` nor
 * `x-forwarded-for` -- local dev, or any host that does not set them -- this
 * allows the request rather than inventing a constant. A made-up key would
 * put every visitor on earth in one bucket, and the first thirty of them
 * would lock out the thirty-first.
 */
/**
 * How many limited requests this process has seen, split by whether it could
 * tell who was asking.
 *
 * This exists because "no identifier means no limit" is correct and silent.
 * With neither `x-real-ip` nor `x-forwarded-for` every public door in the
 * app is open: `enforceRateLimit` returns null before it counts anything,
 * every caller carries on, and there is no 429, no log line and no row in
 * `rate_limit_counters` to notice the absence by. A deployment behind a host
 * that does not set either header therefore has the whole limiter installed,
 * documented and inert, and nothing anywhere says so.
 *
 * It is a counter in memory rather than a table because the question is
 * about the *hosting*, not about any one request: the answer is the same for
 * every request this deployment serves, so one process observing a few of
 * them settles it. That also means it costs nothing -- no write, no read, no
 * round trip -- which matters for something consulted on a page render.
 *
 * Two consequences of it being per process, both acceptable and neither
 * hidden: it resets when the server does, and under `npm run start:cluster`
 * the dashboard reads whichever worker rendered it. Both are fine for a fact
 * that does not vary between requests; `observed` is what says whether the
 * answer is worth anything yet.
 */
/**
 * It hangs off `globalThis` rather than being a plain module variable, and
 * that is not a style choice -- it was measured. Next bundles the App Router
 * per entry, so a module imported by both a route handler and a page can end
 * up as two copies in one process, each with its own state. Written as
 * `let identifiedHits = 0` the counter incremented in the route's copy and
 * the dashboard read the page's copy, which never left zero: the screen said
 * "nothing has used a capped page yet" after fifteen requests that had. One
 * well-known key on the global is the one place both copies can agree.
 */
type IdentifierStats = {
  identified: number;
  anonymous: number;
  /**
   * The first identifier this server saw, and whether it has ever seen a
   * different one. Two fields rather than a set because the only question is
   * "one address, or more than one" -- and because an IP address is a
   * visitor's, so the fewer of them held in memory the better. It is never
   * exposed: `rateLimitIdentifierStats` returns the verdict, not the value.
   */
  firstIdentifier: string | null;
  sawDifferent: boolean;
};
const STATS_KEY = Symbol.for("drpooja.rateLimitIdentifierStats");

function stats(): IdentifierStats {
  const holder = globalThis as unknown as Record<symbol, IdentifierStats | undefined>;
  return (holder[STATS_KEY] ??= {
    identified: 0,
    anonymous: 0,
    firstIdentifier: null,
    sawDifferent: false,
  });
}

/**
 * Below this, "every request came from one address" is just a quiet server
 * rather than a misconfigured one -- so it is reported as not yet knowable
 * instead of as a fault.
 */
export const MIN_SAMENESS_OBSERVATIONS = 20;

export function rateLimitIdentifierStats(): {
  observed: number;
  identified: number;
  anonymous: number;
  /**
   * True when enough requests have been seen to judge and every one of them
   * arrived as the same caller.
   *
   * This is the failure that matters on a Node host, and it is not the one
   * the absence check finds. Next fills in `x-forwarded-for` from the socket
   * itself, so a request that reached the app through a proxy which does not
   * forward the original address still carries an identifier -- the proxy's.
   * Every visitor then shares one bucket, thirty of them exhaust the cap and
   * the thirty-first is refused for something somebody else did. It looks
   * exactly like a working limiter from the inside, which is why it needs
   * stating rather than testing for.
   */
  allOneCaller: boolean;
} {
  const s = stats();
  const observed = s.identified + s.anonymous;
  return {
    observed,
    identified: s.identified,
    anonymous: s.anonymous,
    allOneCaller:
      s.identified >= MIN_SAMENESS_OBSERVATIONS && !s.sawDifferent && s.anonymous === 0,
  };
}

/** Test seam. Never called by the app. */
export function __resetRateLimitIdentifierStats(): void {
  const s = stats();
  s.identified = 0;
  s.anonymous = 0;
  s.firstIdentifier = null;
  s.sawDifferent = false;
}

export async function enforceRateLimit(
  request: NextRequest,
  name: RateLimitName,
  options: { identifier?: string | null } = {}
): Promise<NextResponse | null> {
  const rule = RATE_LIMITS[name];

  const identifier = options.identifier?.trim() || clientIdentifier(request.headers);
  const seen = stats();
  if (!identifier) {
    seen.anonymous++;
    return null;
  }
  seen.identified++;
  if (seen.firstIdentifier === null) seen.firstIdentifier = identifier;
  else if (!seen.sawDifferent && identifier !== seen.firstIdentifier) seen.sawDifferent = true;

  try {
    const { data, error } = await createAdminClient().rpc("check_rate_limit", {
      p_bucket: rateLimitBucket(rule.scope, identifier),
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });

    if (error) {
      console.error("Rate limit check failed, allowing request", rule.scope, error.message);
      return null;
    }

    const verdict = data as { allowed?: boolean; retry_after_seconds?: number } | null;
    if (verdict?.allowed !== false) return null;

    const retryAfter = retryAfterSeconds(verdict.retry_after_seconds, rule.windowSeconds);
    return NextResponse.json(
      { error: rule.message, retryAfterSeconds: retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  } catch (err) {
    console.error(
      "Rate limit check threw, allowing request",
      rule.scope,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
