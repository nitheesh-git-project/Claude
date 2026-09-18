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
export async function enforceRateLimit(
  request: NextRequest,
  name: RateLimitName,
  options: { identifier?: string | null } = {}
): Promise<NextResponse | null> {
  const rule = RATE_LIMITS[name];

  const identifier = options.identifier?.trim() || clientIdentifier(request.headers);
  if (!identifier) return null;

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
