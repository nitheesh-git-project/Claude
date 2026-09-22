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
  /**
   * What the refused caller is told.
   *
   * Two rules, both enforced by `rateLimit.test.ts`. It carries **no
   * numbers**: the cap and the window are configuration, and a sentence
   * quoting them goes stale the moment either moves -- the concrete wait is
   * composed by the caller from `retryAfterSeconds` instead, which is
   * measured rather than configured. So a message says **what happened** and
   * stops: one that also said "please wait and try again" produced "Please
   * wait a few minutes and try again. You can try again in about 9 minutes",
   * the two halves talking over each other. And it does not **blame** the person
   * reading it: a limit is reached by a shared office address, a flaky
   * connection retrying, or somebody correcting a form, far more often than
   * by anybody doing anything wrong. "Too many attempts" reads as an
   * accusation to all three.
   */
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
    message: "We couldn't check your link just now.",
  },

  /**
   * Pincode serviceability, typed into the home-visit wizard and read again
   * by the care-plan offer card.
   *
   * Its own bucket rather than sharing one with the referral-code lookup:
   * they belong to different flows, and one scope for both means a partner
   * hospital checking codes can spend the allowance a patient needs to find
   * out whether we come to their street. Two cheap counters beat one shared
   * one whose exhaustion is somebody else's fault.
   */
  areaLookup: {
    scope: "area-lookup",
    limit: 40,
    windowSeconds: 300,
    message: "We couldn't check that pincode just now.",
  },

  /**
   * A hospital referral code, typed on the signup form. Enumerable, so it is
   * limited -- but a whole hospital sits behind one office address, and every
   * one of those staff shares this bucket, which is why the cap is well above
   * what one person types.
   */
  referralCodeLookup: {
    scope: "referral-code-lookup",
    limit: 40,
    windowSeconds: 300,
    message: "We couldn't check that code just now.",
  },

  /**
   * A public INSERT with no account behind it -- the waitlist and the
   * hospital partnership form. The ceiling exists as much to bound the table
   * as to stop abuse: nothing in this deployment sweeps it.
   *
   * Ten rather than five because these are the two forms where being refused
   * costs the clinic the enquiry, and because a caller only reaches this
   * counter once their submission is *valid* -- see the ordering note in
   * `rateLimitServer.ts`. Five was a number that a person correcting a phone
   * number could reach.
   */
  publicWrite: {
    scope: "public-write",
    limit: 10,
    windowSeconds: 3600,
    message: "We already have your details from a moment ago.",
  },

  /** Creating an account from a referral link. */
  registration: {
    scope: "registration",
    limit: 5,
    windowSeconds: 3600,
    message: "We couldn't finish setting up your account just now.",
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
    message: "We couldn't start that payment just now.",
  },

  /**
   * A patient telling the clinic they have paid what they owe.
   *
   * Its own scope rather than `checkout`, on the one-scope-per-flow rule: a
   * patient comparing a promo code re-quotes several times on one screen, and
   * spending that allowance would leave somebody who has genuinely sent money
   * unable to say so. Tight, because there is nothing to re-try -- one
   * declaration is refused outright while it is waiting to be checked, so a
   * second attempt is a correction rather than a retry.
   */
  settlementDeclaration: {
    scope: "settlement-declaration",
    limit: 6,
    windowSeconds: 3600,
    message: "We couldn't record that just now.",
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


/**
 * The wait, in words a person can act on.
 *
 * `retryAfterSeconds` was being returned by every refusal and read by
 * nothing, so "please wait a few minutes" was the whole of what anybody was
 * told -- vaguer than the answer we already had. The message stays
 * number-free because it describes a policy; this describes a measurement,
 * which is exactly the half that can be specific.
 *
 * Rounds **up** to the next whole unit, so the advice is never earlier than
 * the door actually opens: telling somebody "1 minute" when 90 seconds
 * remain earns a second refusal and teaches them the number is a guess.
 */
export function describeRetryAfter(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "in a moment";
  if (seconds < 60) return "in under a minute";
  const minutes = Math.ceil(seconds / 60);
  if (minutes === 1) return "in about a minute";
  if (minutes < 60) return `in about ${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? "in about an hour" : `in about ${hours} hours`;
}

/**
 * The whole sentence a refused caller reads: what happened, then when to
 * come back. Built here so five forms cannot word it five ways.
 */
export function rateLimitNotice(message: string, retryAfterSeconds?: number): string {
  const wait = typeof retryAfterSeconds === "number" ? describeRetryAfter(retryAfterSeconds) : null;
  if (!wait) return message;
  // The message already ends in a full stop, so this reads as a second
  // sentence rather than a clause bolted on.
  return `${message} You can try again ${wait}.`;
}
