// What one booking actually costs, resolved once.
//
// Three places need this answer and they must not be able to disagree: the
// **quote** the patient reads on the payment screen, the **order** that is
// minted from it, and the **free confirmation** that stands in for an order
// when a discount has taken the price to nothing. Before this module the
// wizard printed the category price on a button while create-order silently
// resolved a first-session offer behind it -- so a patient owed ₹499 read
// "Pay ₹1,200 Now" and watched a different figure appear in the Razorpay
// sheet. Quoting one number and charging another is the one thing a payment
// screen must never do.
//
// Two modes, and the difference is only whether anything is claimed:
//
//   * `claim: false` -- a read. Used by the quote route while the patient is
//     still deciding. Being a moment stale costs nothing, because nothing
//     has been promised yet.
//   * `claim: true` -- the authority. A promo code is claimed under the row
//     lock in `claim_promo_code()`, an invite half is attached under
//     `claim_invite_half()`, and whichever candidate loses is released so it
//     does not count against its own cap for nothing.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  describeDiscount,
  isFirstSessionEligible,
  resolveDiscount,
  type DiscountOutcome,
  type DiscountSource,
  type FirstSessionOffer,
  type PriorPaidLookup,
} from "@/lib/discounts";
import { applyInviteDiscount } from "@/lib/inviteRewards";
import { claimPromoCode, previewPromoCode, releasePromoCode } from "@/lib/promoCodesServer";
import { claimInviteHalf, readInviteHalves } from "@/lib/inviteRewardsServer";
import { readPromoCodesEnabled } from "@/lib/acquisitionSettings";
import { readAppointmentServicePrice } from "@/lib/appointmentPriceServer";

type AdminClient = SupabaseClient;

export type QuotedAppointment = {
  id: string;
  /** Null for a visitor who has not signed up yet -- see the "unidentified"
   *  note on `resolveCheckoutQuote`. */
  patient_id: string | null;
  category_id: string | null;
  visit_mode: string | null;
  travel_fee_paise: number | null;
};

export type CheckoutQuote = {
  /** The service line before anything came off. */
  listPricePaise: number;
  discountPaise: number;
  /** The service line after the discount. */
  payablePaise: number;
  /** Never discounted -- a pass-through paid to the therapist in full. */
  travelFeePaise: number;
  /** What the patient is actually asked for. */
  totalPaise: number;
  source: DiscountSource | null;
  /** How the discount reads on the screen, or null when there is none. */
  label: string | null;
  /** Set when a code the patient supplied could not be applied. The caller
   *  decides what that means: the quote route shows it beside the field, and
   *  the order route refuses the whole checkout rather than quietly charging
   *  list price for a booking that was quoted lower. */
  promoError: string | null;
  /** Whether the clinic is running any campaign at all. */
  promoCodesEnabled: boolean;
};

/**
 * **Unidentified quotes.** `patient_id` may be null, because the booking
 * wizard shows a price to a visitor who has not signed up yet — the account,
 * the booking and the payment are all created by one tap further down the
 * screen. That is exactly the patient a first-session offer exists for, so
 * quoting them list price and then charging the offer would be the same
 * quote-versus-charge bug in the one place it matters most.
 *
 * Such a quote answers for a **new** patient, which is what they are about
 * to be: the first-session offer applies, and the three things that need an
 * identity — a goodwill adjustment, an invite half, a promo code's
 * per-patient cap — are simply not part of it. It is never authoritative.
 * The wizard re-quotes against the real appointment once the account exists,
 * and `create-order` resolves everything again under a row lock before a
 * rupee moves.
 *
 * `claim: true` requires an identified patient: nothing may be claimed on
 * behalf of an account that does not exist yet.
 */
export async function resolveCheckoutQuote(
  admin: AdminClient,
  args: {
    appointment: QuotedAppointment;
    promoCode?: string | null;
    /** True at the moment of payment, false while the patient is deciding. */
    claim: boolean;
  }
): Promise<CheckoutQuote> {
  const { appointment } = args;
  const patientId = appointment.patient_id;
  const typedCode = (args.promoCode ?? "").trim();
  // Claiming needs an account to claim against. A caller asking for one
  // without a patient is a bug, not a request to invent an identity.
  const claim = args.claim && Boolean(patientId);

  const listPricePaise = await readAppointmentServicePrice(admin, appointment.category_id);

  // A home-visit referral appointment carries its own travel fee on top of
  // the session price. Charged to the patient, added back after the
  // discount, and never reduced by it -- discounting travel makes the
  // therapist fund their own transport to subsidise the clinic's marketing.
  const travelFeePaise =
    appointment.visit_mode === "home_visit" ? Math.max(0, appointment.travel_fee_paise ?? 0) : 0;

  // A visitor with no account has never paid for a session, so the offer
  // they are being shown is the one they will actually get.
  const priorPaid: PriorPaidLookup = patientId
    ? await countPriorPaidSessions(admin, patientId)
    : { count: 0, failed: false };
  const [offer, goodwillPaise, promoCodesEnabled, halves] = await Promise.all([
    readFirstSessionOffer(admin),
    patientId ? readGoodwillOnAppointment(admin, appointment.id) : Promise.resolve(null),
    readPromoCodesEnabled(admin),
    patientId
      ? readInviteHalves(admin, patientId)
      : Promise.resolve({ welcomePaise: 0, rewardPaise: 0 }),
  ]);

  // An unspent invite half is honoured whether or not invites are still
  // switched on. The switch stops new claims; it does not withdraw a promise
  // the clinic already made to somebody who has already sent a friend.
  //
  // Reward before welcome, so a tie goes to the older promise.
  const candidates: DiscountOutcome[] = [];
  if (halves.rewardPaise > 0) {
    candidates.push(applyInviteDiscount(listPricePaise, halves.rewardPaise, "reward"));
  }
  if (halves.welcomePaise > 0) {
    candidates.push(applyInviteDiscount(listPricePaise, halves.welcomePaise, "welcome"));
  }

  let promoError: string | null = null;
  let promoClaimed = false;
  if (typedCode) {
    if (!promoCodesEnabled) {
      promoError = "That code isn't recognised.";
    } else if (claim && patientId) {
      const claimResult = await claimPromoCode(admin, {
        code: typedCode,
        patientId,
        appointmentId: appointment.id,
        listPricePaise,
        patientHasPaidBefore: (priorPaid.count ?? 1) > 0,
      });
      if (claimResult.ok) {
        promoClaimed = true;
        candidates.unshift(claimResult.outcome);
      } else {
        promoError = claimResult.message;
      }
    } else {
      const preview = await previewPromoCode(admin, {
        code: typedCode,
        patientId,
        appointmentId: appointment.id,
        listPricePaise,
      });
      if (preview.ok) {
        candidates.unshift(preview.outcome);
      } else {
        promoError = preview.message;
      }
    }
  }

  const resolveWith = (list: DiscountOutcome[]) =>
    resolveDiscount({
      listPricePaise,
      offer,
      offerEligible: isFirstSessionEligible(priorPaid),
      goodwillPaise,
      candidates: list,
    });

  let discount = resolveWith(candidates);

  if (claim && patientId) {
    // Claim whichever invite half won, and fall back if another open
    // checkout is holding it. The loop terminates because each pass removes
    // one candidate.
    while (discount.source === "invite_reward" || discount.source === "invite_welcome") {
      const half = discount.source === "invite_reward" ? "reward" : "welcome";
      const claimed = await claimInviteHalf(admin, patientId, appointment.id, half);
      if (claimed !== null) break;
      const dropped = discount.source;
      const remaining = candidates.filter((candidate) => candidate.source !== dropped);
      candidates.length = 0;
      candidates.push(...remaining);
      discount = resolveWith(candidates);
    }

    // A code that was claimed but lost to a larger discount is given back,
    // so it does not go on counting against its own cap.
    if (promoClaimed && discount.source !== "promo_code") {
      await releasePromoCode(admin, appointment.id, patientId);
    }
  }

  return {
    listPricePaise,
    discountPaise: discount.discountPaise,
    payablePaise: discount.payablePaise,
    travelFeePaise,
    totalPaise: discount.payablePaise + travelFeePaise,
    source: discount.source,
    label: describeDiscount(discount.source, discount.discountPaise),
    promoError,
    promoCodesEnabled,
  };
}

/**
 * The standing offer, read in its own call.
 *
 * Migration-dependent columns, and failing to read them must cost the offer
 * rather than the booking -- so an error here returns a disabled offer and
 * the patient pays list price, which is the safe direction.
 */
async function readFirstSessionOffer(admin: AdminClient): Promise<FirstSessionOffer> {
  const off: FirstSessionOffer = { enabled: false, type: "fixed", value: 0 };
  try {
    const { data, error } = await admin
      .from("site_settings")
      .select("first_session_offer_enabled, first_session_offer_type, first_session_offer_value")
      .maybeSingle();
    if (error || !data) return off;
    return {
      enabled: data.first_session_offer_enabled === true,
      type: data.first_session_offer_type === "percent" ? "percent" : "fixed",
      value: typeof data.first_session_offer_value === "number" ? data.first_session_offer_value : 0,
    };
  } catch {
    return off;
  }
}

/**
 * Has this patient ever paid for a session before?
 *
 * The whole eligibility rule, asked of the database rather than of anything
 * the browser sent. `failed` is carried rather than swallowed so
 * `isFirstSessionEligible` can fail closed on it -- an unreadable answer
 * must not become a discount for everybody.
 */
async function countPriorPaidSessions(
  admin: AdminClient,
  patientId: string
): Promise<PriorPaidLookup> {
  try {
    const { count, error } = await admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", patientId)
      .eq("payment_status", "paid");
    if (error) return { count: null, failed: true };
    return { count: count ?? 0, failed: false };
  } catch {
    return { count: null, failed: true };
  }
}

/** Any adjustment an admin already wrote onto this booking. */
async function readGoodwillOnAppointment(
  admin: AdminClient,
  appointmentId: string
): Promise<number | null> {
  try {
    const { data } = await admin
      .from("appointments")
      .select("discount_paise, discount_source")
      .eq("id", appointmentId)
      .maybeSingle();
    const row = data as { discount_paise?: number | null; discount_source?: string | null } | null;
    if (!row || row.discount_source !== "goodwill") return null;
    return row.discount_paise ?? null;
  } catch {
    return null;
  }
}
