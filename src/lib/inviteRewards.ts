// Invites: a patient tells a friend about the clinic, and both are thanked
// for it.
//
// **The word is "invite", never "referral".** This app already has
// referrals, and they are a different thing entirely: a hospital sending a
// patient to the clinic under a commercial agreement, with its own tables,
// its own dashboard and its own revenue share (`patient_referrals`). One
// patient telling another is not that, and giving the two one word would
// mean every screen, query and conversation has to say which kind it means.
// See the "one word for one concept" rules -- this is that rule applied
// before the second meaning gets in rather than after.
//
// Two halves, both amounts an admin configured:
//
//   * the **welcome** comes off the invited friend's first booking, and
//   * the **reward** comes off the inviter's next one, once that friend has
//     actually paid for a session.
//
// The order matters. The reward is earned by a paid session and not by a
// signup, because a reward that pays out on signups is a reward for creating
// accounts, and somebody will. The welcome is given up front, because that
// is the half doing the persuading.

import { applyConfiguredAmountOff, type DiscountOutcome } from "@/lib/discounts";

export type InviteSettings = {
  enabled: boolean;
  /** Off the inviter's next booking, once their friend has paid. */
  rewardPaise: number;
  /** Off the invited friend's first booking. */
  welcomePaise: number;
  /** How many rewards one patient may earn, ever. */
  maxRewardsPerPatient: number;
};

export const INVITE_SETTINGS_DEFAULTS: InviteSettings = {
  // Off by default, like the first-session offer: a clinic that has not
  // decided what an introduction is worth should not be paying for them on
  // the first deploy.
  enabled: false,
  rewardPaise: 0,
  welcomePaise: 0,
  // A ceiling rather than none. Somebody who genuinely sends the clinic ten
  // patients is worth ten rewards; somebody sending a hundred is running a
  // scheme, and the difference is worth an admin looking at rather than a
  // standing invitation to find out.
  maxRewardsPerPatient: 10,
};

export const INVITE_CODE_LENGTH = 8;

/**
 * The alphabet a code is drawn from.
 *
 * No I, O, 0 or 1. A code is read off a phone screen and typed into another
 * one, often by somebody who was told it over the phone, and those four
 * characters are the ones that get read as each other. Losing them costs
 * nothing -- 32 characters over 8 places is still more than a thousand
 * million codes.
 */
export const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** The one spelling of an invite code. */
export function normalizeInviteCode(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase().replace(/[\s-]+/g, "");
}

export function isWellFormedInviteCode(raw: string | null | undefined): boolean {
  const code = normalizeInviteCode(raw);
  if (code.length !== INVITE_CODE_LENGTH) return false;
  return code.split("").every((char) => INVITE_CODE_ALPHABET.includes(char));
}

/**
 * A new code.
 *
 * The randomness is injected rather than reached for, so the generator is a
 * pure function this module's tests can pin. Callers pass
 * `crypto.getRandomValues`-backed bytes; nothing here reaches for a global.
 */
export function generateInviteCode(randomBytes: Uint8Array): string {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    const byte = randomBytes[i] ?? 0;
    code += INVITE_CODE_ALPHABET[byte % INVITE_CODE_ALPHABET.length];
  }
  return code;
}

/** How a code is shown, as opposed to how it is stored and compared. */
export function formatInviteCode(code: string): string {
  const normalized = normalizeInviteCode(code);
  if (normalized.length !== INVITE_CODE_LENGTH) return normalized;
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

/** Why an invite could not be claimed. */
export const INVITE_REJECTIONS = [
  "disabled",
  "unknown_code",
  "self",
  "already_claimed",
  "not_new",
  "inviter_capped",
] as const;
export type InviteRejection = (typeof INVITE_REJECTIONS)[number];

export type InviteClaimContext = {
  /** The profile whose code was typed. Null when no code matched. */
  inviterId: string | null;
  inviteeId: string;
  /** Whether the invited patient has ever paid for a session. */
  inviteeHasPaidBefore: boolean;
  /** Whether they have already claimed somebody's code. */
  inviteeAlreadyClaimed: boolean;
  /** How many rewards the inviter has earned so far. */
  inviterRewardsEarned: number;
};

export type InviteClaimResult =
  | { ok: true; inviterId: string; welcomePaise: number; rewardPaise: number }
  | { ok: false; reason: InviteRejection; message: string };

/**
 * Whether this patient may claim this invite.
 *
 * Every refusal here is an abuse rule as much as a business one, and the
 * three that matter are the three that would otherwise turn an invite into
 * a way of printing discounts:
 *
 *   * **self** -- a patient claiming their own code is one account paying
 *     itself, and it is the first thing anybody tries.
 *   * **not_new** -- an invite is claimable only before the invited patient
 *     has ever paid, so an established patient cannot collect a welcome by
 *     asking a friend for a code. A patient is new exactly once, the same
 *     test the first-session offer uses.
 *   * **inviter_capped** -- a ceiling on what one account may earn, so a
 *     scheme is bounded before an admin notices rather than after.
 *
 * The messages are deliberately plain. This runs in front of a discount, not
 * a fraud review, and a patient who mistyped a code should be told that
 * rather than accused of something.
 */
export function evaluateInviteClaim(
  ctx: InviteClaimContext,
  settings: InviteSettings
): InviteClaimResult {
  if (!settings.enabled) {
    return { ok: false, reason: "disabled", message: "Invites aren't running at the moment." };
  }
  if (!ctx.inviterId) {
    return { ok: false, reason: "unknown_code", message: "That invite code isn't recognised." };
  }
  if (ctx.inviterId === ctx.inviteeId) {
    return { ok: false, reason: "self", message: "That's your own invite code." };
  }
  if (ctx.inviteeAlreadyClaimed) {
    return {
      ok: false,
      reason: "already_claimed",
      message: "You've already used an invite code.",
    };
  }
  if (ctx.inviteeHasPaidBefore) {
    return {
      ok: false,
      reason: "not_new",
      message: "An invite code can only be used before your first session.",
    };
  }
  const cap = Math.max(0, Math.floor(settings.maxRewardsPerPatient));
  if (ctx.inviterRewardsEarned >= cap) {
    // Refused on the invitee's screen, and worded so it does not accuse the
    // person whose code it is -- the patient typing it did nothing wrong,
    // and telling them why somebody else's account is capped would be
    // telling them about somebody else's account.
    return {
      ok: false,
      reason: "inviter_capped",
      message: "That invite code can't be used at the moment.",
    };
  }
  return {
    ok: true,
    inviterId: ctx.inviterId,
    welcomePaise: Math.max(0, Math.floor(settings.welcomePaise)),
    rewardPaise: Math.max(0, Math.floor(settings.rewardPaise)),
  };
}

/**
 * What an unspent invite half takes off one booking.
 *
 * Both halves are flat amounts an admin configured, so they go through the
 * shared floor rather than goodwill's refusal -- see
 * `applyConfiguredAmountOff`.
 */
export function applyInviteDiscount(
  listPricePaise: number,
  amountPaise: number,
  half: "reward" | "welcome"
): DiscountOutcome {
  return applyConfiguredAmountOff(
    listPricePaise,
    amountPaise,
    half === "reward" ? "invite_reward" : "invite_welcome"
  );
}

/**
 * What an invite is worth to the person sharing it, in words.
 *
 * Written from the inviter's side because that is the only screen it
 * appears on, and it states the condition rather than burying it: a reward
 * that arrives on a signup and one that arrives on a paid session are
 * different promises, and the patient should hear the real one before they
 * send the code to anybody.
 */
export function describeInviteOffer(settings: InviteSettings): string | null {
  if (!settings.enabled) return null;
  const reward = Math.floor(settings.rewardPaise);
  const welcome = Math.floor(settings.welcomePaise);
  if (reward <= 0 && welcome <= 0) return null;
  const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
  if (reward > 0 && welcome > 0) {
    return `They get ${rupees(welcome)} off their first session. You get ${rupees(
      reward
    )} off your next one, once they've had it.`;
  }
  if (welcome > 0) return `They get ${rupees(welcome)} off their first session.`;
  return `You get ${rupees(reward)} off your next session, once they've had theirs.`;
}
