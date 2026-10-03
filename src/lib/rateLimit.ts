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
   * What happens when the limiter's OWN query fails.
   *
   * `"open"` allows the request, which is right wherever refusing costs the
   * clinic something real: a limiter whose database call hiccupped and then
   * refused a checkout has turned a blip into a lost booking, which is worse
   * than the burst it would have stopped.
   *
   * `"closed"` refuses it, which is right where the limit is the ONLY thing
   * standing between a caller and an unbounded lookup. For those, failing
   * open does not degrade gracefully -- it removes the protection entirely
   * for as long as the outage lasts, and nobody finds out, because a limiter
   * that allows everything looks exactly like a limiter with nothing to do.
   *
   * Stated per limit rather than as one global posture, so the direction is
   * a reviewable decision on each one instead of a property of the file.
   * Defaults to `"open"` when omitted, which is what every limit did before
   * this existed.
   */
  readonly onCheckFailure?: "open" | "closed";
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
    // Fails CLOSED, for the same reason: it answers "do you visit this
    // pincode", which is an enumerable space, and the honest answer when the
    // limiter cannot be asked is "we could not check" -- which the callers
    // already resolve as a third state rather than as "no".
    onCheckFailure: "closed",
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
    // Fails CLOSED. This answers "does this hospital referral code exist",
    // so the cap is the whole of the defence against walking the code space
    // -- and a partner checking their own code a handful of times a day
    // loses nothing by being asked to retry during an outage.
    onCheckFailure: "closed",
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
   * The booking wizards reporting how long a Pay tap took to open the
   * Razorpay sheet (see checkoutTiming). Its own scope on the
   * one-scope-per-flow rule: a measurement must never spend the allowance a
   * patient needs to actually pay. Loose, because one is sent per tap and a
   * patient retrying a declined card taps several times; the ceiling exists
   * to bound the table, not to judge anybody.
   */
  checkoutTiming: {
    scope: "checkout-timing",
    limit: 60,
    windowSeconds: 600,
    message: "That measurement was not recorded just now.",
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

  /**
   * A partner hospital filing a patient referral.
   *
   * Its own scope on the one-scope-per-flow rule -- folding it into
   * `publicWrite` would let a hospital's morning batch of referrals spend
   * the allowance a stranger needs to ask about a partnership, and the two
   * are refused for completely different reasons.
   *
   * Generous, because a hospital legitimately files several in a sitting
   * after a ward round, and keyed on the hospital's own account rather than
   * an address, so a shared hospital network cannot have one clinic lock
   * out another.
   */
  referralSubmit: {
    scope: "referral-submit",
    limit: 40,
    windowSeconds: 3600,
    message: "We've taken a lot of referrals from this account just now.",
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
 * `x-real-ip` is preferred over `x-forwarded-for`, because it is
 * single-valued and set by the platform rather than assembled from what the
 * caller sent.
 *
 * **The forwarded list is read from the RIGHT, not the left.** This used to
 * take the leftmost entry, and its own comment said why that was unsafe --
 * the header is a list a client can pad from the left -- and then did it
 * anyway as the fallback. A proxy *appends* the address it saw, so the
 * leftmost entry is whatever the original caller claimed and the rightmost
 * is the only one a trusted hop actually observed. On a host that does not
 * set `x-real-ip` -- which is precisely the case System Health's "Public
 * doors" check exists to detect -- every request was therefore keyed on a
 * value the caller chose, so each one got a fresh allowance and every public
 * cap was off while appearing to work.
 *
 * How many entries from the right to trust is the one thing only the
 * operator knows, because it depends on how many proxies sit in front of
 * this app. `RATE_LIMIT_TRUSTED_PROXY_HOPS` is that number and defaults to
 * 0, meaning "the last hop is the one I trust". Getting it wrong in the safe
 * direction puts several visitors in one bucket, which the Public doors
 * check reports; getting it wrong in the unsafe direction is what this
 * change removes, and no setting can reintroduce it -- the value is clamped
 * so it can never walk past the start of the list into caller-supplied
 * territory.
 *
 * Returns null when neither header is present, which is the local-dev case
 * and is handled by the caller rather than invented here -- a made-up
 * constant would put every visitor in one bucket and lock the app out of
 * itself the moment it ran somewhere without those headers.
 */
export function clientIdentifier(
  headers: { get(name: string): string | null },
  options: { trustedProxyHops?: number } = {}
): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const entries = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    if (entries.length > 0) {
      // Counted from the right. Clamped to the list, so a misconfigured hop
      // count degrades to the leftmost entry at worst *and only when the
      // whole list is that short* -- it can never index outside it.
      const hops = Math.max(0, Math.floor(options.trustedProxyHops ?? 0));
      const index = Math.max(0, entries.length - 1 - hops);
      return entries[index] ?? null;
    }
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
