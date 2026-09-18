/**
 * What a rate limit *is*, with no database and no request object in it.
 *
 * Split from `rateLimitServer.ts` for the reason `promoCodes.ts` is split
 * from `promoCodesServer.ts`: the judgements -- which caller a request
 * counts against, how long they are held off, what they are told -- are
 * worth unit-testing, and none of them needs a round trip to find out.
 */

/** A named limit. One per kind of thing being protected, never per route. */
export type RateLimit = {
  /** Goes into the bucket key, so renaming one resets its counters. */
  readonly scope: string;
  /** Hits allowed per window. */
  readonly limit: number;
  /** Window length in seconds. */
  readonly windowSeconds: number;
  /** What the refused caller is told. Never mentions the limit's numbers. */
  readonly message: string;
};

/**
 * The limits, in one place.
 *
 * They are deliberately coarse. A per-route number is a number nobody
 * revisits, and the interesting question is not "how many calls may this
 * route take" but "what does this protect and who is accountable for the
 * call" -- an unauthenticated lookup has nothing but an IP behind it, while
 * a checkout has a real account.
 *
 * Every one of these is generous next to what a person does by hand and
 * mean next to what a script does, which is the only band worth aiming for.
 */
export const RATE_LIMITS = {
  /**
   * A patient's name and medical issue, keyed on a token, with no account
   * needed -- the most sensitive unauthenticated read in the app. Tight,
   * because the honest use is one person opening one link they were sent.
   */
  referralPreview: {
    scope: "referral-preview",
    limit: 10,
    windowSeconds: 600,
    message: "Too many attempts. Please wait a few minutes and try again.",
  },

  /**
   * Hospital referral codes and pincode serviceability. Both answer a
   * yes/no about data somebody else owns, so both are enumerable; both are
   * also typed into a form by a real visitor who may well correct a typo
   * several times.
   */
  publicLookup: {
    scope: "public-lookup",
    limit: 30,
    windowSeconds: 300,
    message: "Too many attempts. Please wait a few minutes and try again.",
  },

  /**
   * A public INSERT with no account behind it -- the waitlist and the
   * hospital lead form. The ceiling exists as much to bound the table as to
   * stop abuse: nothing in this deployment sweeps it.
   */
  publicWrite: {
    scope: "public-write",
    limit: 5,
    windowSeconds: 3600,
    message: "We have your details. Please contact us directly if you need to reach us again.",
  },

  /** Creating an account from a referral link. */
  registration: {
    scope: "registration",
    limit: 5,
    windowSeconds: 3600,
    message: "Too many attempts. Please wait a while and try again.",
  },

  /**
   * Quoting and ordering. Keyed on the account where there is one, so this
   * is the one limit an attacker cannot get round by changing address --
   * and it is loose, because a patient comparing a promo code against the
   * list price legitimately re-quotes several times on one screen.
   */
  checkout: {
    scope: "checkout",
    limit: 40,
    windowSeconds: 600,
    message: "Too many attempts in a row. Please wait a moment and try again.",
  },
} as const satisfies Record<string, RateLimit>;

export type RateLimitName = keyof typeof RATE_LIMITS;

/**
 * Which caller this request counts against.
 *
 * An account id where there is one, because it cannot be changed by the
 * person being limited. An IP otherwise -- which is evadable, and that is a
 * property of IP limiting rather than a bug here: the point is to stop
 * casual enumeration and accidental floods, and somebody who rotates
 * addresses buys themselves one fresh bucket per address rather than an
 * unlimited one.
 *
 * `x-real-ip` is preferred over `x-forwarded-for`. Both are set by the
 * platform in front of this app, but the forwarded header is a *list* that
 * a client can pad from the left, and reading the leftmost entry of a
 * padded list is how an IP limiter ends up counting a value the caller
 * chose. Taking the single-valued header first means the list is only
 * consulted where there is no better answer.
 *
 * Returns null when neither header is present, which is the local-dev case
 * and is handled by the caller rather than invented here -- a made-up
 * constant would put every visitor in one bucket and lock the app out of
 * itself the moment it ran somewhere without those headers.
 */
export function clientIdentifier(headers: {
  get(name: string): string | null;
}): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return null;
}

/**
 * The key a counter is kept under.
 *
 * The scope is part of it so one caller hitting two different limits keeps
 * two counters -- otherwise a patient re-quoting a price would spend the
 * allowance that exists to protect the referral lookup.
 */
export function rateLimitBucket(scope: string, identifier: string): string {
  return `${scope}:${identifier}`;
}

/**
 * How long to tell a refused caller to wait.
 *
 * Never zero and never fractional: `Retry-After: 0` invites an immediate
 * retry that is certain to be refused again, which turns one refusal into a
 * loop. The database returns the same figure; this is the guard for a
 * malformed or missing answer rather than a second implementation.
 */
export function retryAfterSeconds(value: unknown, windowSeconds: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) return windowSeconds;
  return Math.ceil(n);
}
