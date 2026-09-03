// Promo codes: a campaign an admin sets up, claimed by a patient typing its
// name at checkout.
//
// This is the one discount in the app where something the patient sends
// takes money off the bill, so it is worth being exact about what is being
// sent. The browser sends an **identifier**, never an amount: the code names
// a row an admin created, and every figure -- what comes off, the window it
// runs in, how many times it may be claimed -- is read from that row
// server-side. That keeps the standing rule intact ("a discount is a rule an
// admin configured, never a number a browser sent") while still letting the
// clinic run a campaign it can print on a poster.
//
// Two things live here and nothing else does: what a code works out to, and
// whether this patient may claim it. The redemption **cap** is checked here
// too, but the authoritative check is `claim_promo_code()` in schema.sql --
// two patients at one checkout each are one race, and a race is settled by a
// row lock, not by a count taken a moment earlier. This module's cap check
// is what produces the honest message on the preview screen; the database's
// is what makes "100 uses" mean 100.

import { applyConfiguredAmountOff, type DiscountOutcome } from "@/lib/discounts";

/**
 * How a code takes money off.
 *
 * Deliberately **not** the first-session offer's `fixed` / `percent`, even
 * though the shapes rhyme. That offer's `fixed` sets the price outright
 * ("first session ₹499"), because that is what a clinic advertises. A promo
 * code's `amount_off` takes an amount off ("₹200 off with WELCOME200"),
 * because that is what a coupon means. Naming both "fixed" would put two
 * different rules behind one word, which is exactly the mistake the money
 * vocabulary rules exist to stop.
 */
export const PROMO_CODE_KINDS = ["amount_off", "percent_off"] as const;
export type PromoCodeKind = (typeof PROMO_CODE_KINDS)[number];

/** The shape of one campaign, as stored. */
export type PromoCode = {
  id: string;
  code: string;
  kind: PromoCodeKind;
  /** Paise off when `amount_off`, whole percent 1-100 when `percent_off`. */
  value: number;
  active: boolean;
  /** ISO timestamps. Null on either end means "no bound that way". */
  startsAt: string | null;
  endsAt: string | null;
  /** Total claims allowed across every patient. Null means unlimited. */
  maxRedemptions: number | null;
  /** Claims allowed by any one patient. Always at least 1. */
  maxPerPatient: number;
  /** The service line must be at least this much before the code applies. */
  minSpendPaise: number;
  /** Restrict to a patient who has never paid for a session. */
  firstSessionOnly: boolean;
};

export const PROMO_CODE_MIN_LENGTH = 3;
export const PROMO_CODE_MAX_LENGTH = 24;

/**
 * The one spelling of a code.
 *
 * A code is printed on a poster, read aloud on a call and typed on a phone
 * keyboard, so "welcome200", " WELCOME200 " and "Welcome200" are the same
 * code and the patient should never learn otherwise. Normalised on the way
 * in **and** on the way out, so the stored spelling and the typed one are
 * compared as the same string rather than nearly.
 */
export function normalizePromoCode(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

/** Whether a code is a shape this app will store. */
export function isWellFormedPromoCode(raw: string | null | undefined): boolean {
  const code = normalizePromoCode(raw);
  if (code.length < PROMO_CODE_MIN_LENGTH || code.length > PROMO_CODE_MAX_LENGTH) return false;
  // Letters and digits only. A code with punctuation in it is a code someone
  // will mistype, and a hyphen in particular reads as optional to everyone
  // who has ever typed a licence key.
  return /^[A-Z0-9]+$/.test(code);
}

/** Why a code did not apply. */
export const PROMO_REJECTIONS = [
  "unknown",
  "inactive",
  "not_started",
  "expired",
  "exhausted",
  "already_used",
  "first_session_only",
  "min_spend",
  "no_effect",
] as const;
export type PromoRejection = (typeof PROMO_REJECTIONS)[number];

export type PromoEvaluation =
  | { ok: true; code: string; outcome: DiscountOutcome }
  | { ok: false; reason: PromoRejection; message: string };

export type PromoContext = {
  /** The service line, before travel. Travel is never discounted. */
  listPricePaise: number;
  /** Evaluated at this instant, passed in so the maths is testable. */
  now: Date;
  /** How many times this code has been claimed by anyone. */
  totalRedemptions: number;
  /** How many times this patient has claimed it. */
  patientRedemptions: number;
  /** Whether this patient has ever paid for a session. */
  patientHasPaidBefore: boolean;
};

/**
 * What a code is worth to this patient, right now.
 *
 * Every rejection carries a sentence the patient can act on. "That code
 * isn't valid" is the message that generates a support call: a patient who
 * is told the code ran out last week stops trying, and one who is told they
 * have already used it knows they are not being cheated.
 */
export function evaluatePromoCode(promo: PromoCode, ctx: PromoContext): PromoEvaluation {
  const code = normalizePromoCode(promo.code);

  if (!promo.active) {
    return { ok: false, reason: "inactive", message: "That code is no longer available." };
  }

  const now = ctx.now.getTime();
  const startsAt = promo.startsAt ? Date.parse(promo.startsAt) : null;
  const endsAt = promo.endsAt ? Date.parse(promo.endsAt) : null;
  if (startsAt !== null && Number.isFinite(startsAt) && now < startsAt) {
    return { ok: false, reason: "not_started", message: "That code hasn't started yet." };
  }
  if (endsAt !== null && Number.isFinite(endsAt) && now >= endsAt) {
    return { ok: false, reason: "expired", message: "That code has expired." };
  }

  if (
    promo.maxRedemptions !== null &&
    Number.isFinite(promo.maxRedemptions) &&
    ctx.totalRedemptions >= promo.maxRedemptions
  ) {
    return { ok: false, reason: "exhausted", message: "That code has been fully claimed." };
  }

  const perPatient = Math.max(1, Math.floor(promo.maxPerPatient || 1));
  if (ctx.patientRedemptions >= perPatient) {
    return {
      ok: false,
      reason: "already_used",
      message:
        perPatient === 1
          ? "You've already used that code."
          : `You've used that code the maximum ${perPatient} times.`,
    };
  }

  if (promo.firstSessionOnly && ctx.patientHasPaidBefore) {
    return {
      ok: false,
      reason: "first_session_only",
      message: "That code is for a first session only.",
    };
  }

  if (promo.minSpendPaise > 0 && ctx.listPricePaise < promo.minSpendPaise) {
    return {
      ok: false,
      reason: "min_spend",
      message: `That code applies to bookings of ${formatRupees(promo.minSpendPaise)} or more.`,
    };
  }

  const outcome = promoOutcome(promo, ctx.listPricePaise);
  if (!outcome.source || outcome.discountPaise <= 0) {
    // A code that works out to nothing off is refused rather than "applied"
    // for zero. Showing a green tick beside an unchanged total is how a
    // patient concludes the payment screen is lying to them.
    return {
      ok: false,
      reason: "no_effect",
      message: "That code doesn't take anything off this booking.",
    };
  }

  return { ok: true, code, outcome };
}

/** What the code takes off, with no eligibility asked. */
export function promoOutcome(promo: PromoCode, listPricePaise: number): DiscountOutcome {
  const none: DiscountOutcome = {
    listPricePaise,
    discountPaise: 0,
    payablePaise: listPricePaise,
    source: null,
  };
  if (!Number.isFinite(listPricePaise) || listPricePaise <= 0) return none;
  if (!Number.isFinite(promo.value) || promo.value <= 0) return none;

  if (promo.kind === "percent_off") {
    const percent = Math.min(100, promo.value);
    // Rounded down, so the rounding favours the patient -- same rule the
    // first-session offer follows, for the same reason.
    // Floored at zero, not at the gateway minimum: a 100%-off campaign is a
    // free session, and charging ₹1 for one would quote a figure and take
    // another. Checkout answers a zero payable by not going to a gateway at
    // all -- see isGatewayPayable and /api/appointments/confirm-free.
    const payable = Math.max(0, Math.floor(listPricePaise * (1 - percent / 100)));
    if (payable >= listPricePaise) return none;
    return {
      listPricePaise,
      discountPaise: listPricePaise - payable,
      payablePaise: payable,
      source: "promo_code",
    };
  }

  return applyConfiguredAmountOff(listPricePaise, promo.value, "promo_code");
}

/** How a campaign reads on the admin's own list. */
export function describePromoCode(promo: PromoCode): string {
  const off =
    promo.kind === "percent_off"
      ? `${Math.min(100, Math.max(0, Math.floor(promo.value)))}% off`
      : `${formatRupees(promo.value)} off`;
  const cap =
    promo.maxRedemptions === null ? "unlimited uses" : `${promo.maxRedemptions} uses`;
  return `${off} · ${cap}`;
}

/**
 * Whether a campaign is running at this instant.
 *
 * Nothing writes an "expired" status on a promo code, deliberately -- the
 * same rule session suggestions follow. A window that has closed is a fact
 * about the clock, and a status column recording it would need a sweep to
 * keep true, which this deployment has no worker to run.
 */
export function promoCodeState(
  promo: Pick<PromoCode, "active" | "startsAt" | "endsAt">,
  now: Date
): "scheduled" | "running" | "ended" | "paused" {
  if (!promo.active) return "paused";
  const at = now.getTime();
  const startsAt = promo.startsAt ? Date.parse(promo.startsAt) : null;
  const endsAt = promo.endsAt ? Date.parse(promo.endsAt) : null;
  if (startsAt !== null && Number.isFinite(startsAt) && at < startsAt) return "scheduled";
  if (endsAt !== null && Number.isFinite(endsAt) && at >= endsAt) return "ended";
  return "running";
}

function formatRupees(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}
