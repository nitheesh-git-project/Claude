// Server-side promo code work: reading a campaign, previewing what it is
// worth, and claiming it.
//
// The split between this module and `claim_promo_code()` in schema.sql is
// the point of both. **Preview** is a read: it tells the patient what a code
// would do, and being a moment out of date costs nothing because nothing has
// been promised yet. **Claiming** is the authority: two patients at one
// checkout each are a race, and a race is settled by a row lock rather than
// by a count taken a moment earlier. So the cap is checked in both places
// and only the database's answer decides.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluatePromoCode,
  normalizePromoCode,
  promoOutcome,
  PROMO_NOT_FOR_PROGRAMMES_MESSAGE,
  type PromoCode,
  type PromoEvaluation,
} from "@/lib/promoCodes";
import type { DiscountOutcome } from "@/lib/discounts";
import { countPriorCommittedSessions } from "@/lib/priorSessionsServer";

type AdminClient = SupabaseClient;

type PromoRow = {
  id: string;
  code: string;
  kind: string;
  value: number;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | null;
  max_per_patient: number;
  min_spend_paise: number;
  first_session_only: boolean;
};

function toPromoCode(row: PromoRow): PromoCode {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind === "percent_off" ? "percent_off" : "amount_off",
    value: row.value,
    active: row.active,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    maxRedemptions: row.max_redemptions,
    maxPerPatient: row.max_per_patient,
    minSpendPaise: row.min_spend_paise,
    firstSessionOnly: row.first_session_only,
  };
}

const PROMO_SELECT =
  "id, code, kind, value, active, starts_at, ends_at, max_redemptions, max_per_patient, min_spend_paise, first_session_only";

/**
 * Which row a claim is for, so re-opening checkout on it is not counted as a
 * second claim. A booking is an appointment; a programme is the unpaid
 * purchase its checkout is paying for, or null before one exists.
 */
export type PromoClaimTarget =
  | { kind: "appointment"; id: string }
  | { kind: "programme"; purchaseId: string | null };

/**
 * What a code would do for this patient on this booking.
 *
 * Read-only. Counts a claim the same way `promo_code_claim_count()` does -- a
 * booking or programme that was paid for, plus one still inside its checkout
 * hold -- so the preview and the claim agree except under the race the claim
 * exists to settle.
 */
export async function previewPromoCode(
  admin: AdminClient,
  args: {
    code: string;
    /** Null for a visitor who has not signed up yet. The per-patient cap and
     *  the first-session restriction cannot be asked of somebody with no
     *  account, so both are answered as "a new patient" -- which is what
     *  they are about to be. The **claim** at checkout re-asks both against
     *  the real account and refuses if either does not hold, so the worst an
     *  anonymous preview can do is promise something the patient then does
     *  not get, which checkout reports rather than silently charging. */
    patientId: string | null;
    /** A booking's id. Kept as its own argument because every session
     *  caller already passes it; a programme passes `target` instead. */
    appointmentId?: string;
    target?: PromoClaimTarget;
    listPricePaise: number;
    now?: Date;
  }
): Promise<PromoEvaluation> {
  const code = normalizePromoCode(args.code);
  const unknown: PromoEvaluation = {
    ok: false,
    reason: "unknown",
    message: "That code isn't recognised.",
  };
  if (!code) return unknown;
  const target: PromoClaimTarget =
    args.target ?? { kind: "appointment", id: args.appointmentId ?? NO_ROW };

  try {
    const { data, error } = await admin
      .from("promo_codes")
      .select(PROMO_SELECT)
      .eq("code", code)
      .maybeSingle();
    if (error || !data) return unknown;

    const promo = toPromoCode(data as PromoRow);
    if (target.kind === "programme") {
      promo.validOnProgrammes = await readValidOnProgrammes(admin, promo.id);
    }
    const heldSince = new Date(Date.now() - PROMO_HOLD_MS).toISOString();

    const [total, mine, prior] = await Promise.all([
      countClaims(admin, promo.id, target, heldSince, null),
      args.patientId
        ? countClaims(admin, promo.id, target, heldSince, args.patientId)
        : Promise.resolve(0),
      args.patientId ? countPriorPaid(admin, args.patientId) : Promise.resolve(0),
    ]);

    return evaluatePromoCode(promo, {
      listPricePaise: args.listPricePaise,
      now: args.now ?? new Date(),
      totalRedemptions: total,
      patientRedemptions: mine,
      patientHasPaidBefore: prior > 0,
      target: target.kind === "programme" ? "programme" : "session",
    });
  } catch {
    return unknown;
  }
}

/** A uuid no row carries, for "nothing to exclude". */
const NO_ROW = "00000000-0000-0000-0000-000000000000";

/**
 * The programme switch, read on its own.
 *
 * The newest column on `promo_codes`, so it is not part of PROMO_SELECT: a
 * database one apply behind would otherwise refuse every code on every
 * single session too. Unreadable means off -- the safe direction for a
 * switch that gives money away.
 */
async function readValidOnProgrammes(admin: AdminClient, promoId: string): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from("promo_codes")
      .select("valid_on_programmes")
      .eq("id", promoId)
      .maybeSingle();
    if (error || !data) return false;
    return (data as { valid_on_programmes?: boolean | null }).valid_on_programmes === true;
  } catch {
    return false;
  }
}

export type PromoClaimResult =
  | { ok: true; promoCodeId: string; code: string; outcome: DiscountOutcome }
  | { ok: false; reason: string; message: string };

/**
 * The claim itself, through the locking function.
 *
 * Returns the outcome only when the database agreed, so a caller that gets
 * an outcome back can quote it. The minimum spend is checked here rather
 * than in SQL because it is arithmetic against a price the function is not
 * given -- everything the function does check is a fact about the campaign
 * and its claims, which is exactly what needs the lock.
 */
export async function claimPromoCode(
  admin: AdminClient,
  args: {
    code: string;
    patientId: string;
    appointmentId: string;
    listPricePaise: number;
    patientHasPaidBefore: boolean;
  }
): Promise<PromoClaimResult> {
  return claimThrough(admin, {
    code: args.code,
    listPricePaise: args.listPricePaise,
    noEffectMessage: "That code doesn't take anything off this booking.",
    rpc: "claim_promo_code",
    params: {
      p_patient_id: args.patientId,
      p_appointment_id: args.appointmentId,
      p_patient_has_paid_before: args.patientHasPaidBefore,
    },
    release: () => releasePromoCode(admin, args.appointmentId, args.patientId),
  });
}

/**
 * The same claim against a recommended programme's unpaid purchase.
 *
 * `claim_promo_code_for_purchase()` takes the same row lock and counts the
 * same claims (`promo_code_claim_count()`), so a code's cap is one number
 * across sessions and programmes. It also refuses a code whose
 * `valid_on_programmes` switch is off.
 */
export async function claimPromoCodeForPurchase(
  admin: AdminClient,
  args: {
    code: string;
    patientId: string;
    purchaseKind: "session_package" | "home_visit_package";
    purchaseId: string;
    listPricePaise: number;
    patientHasPaidBefore: boolean;
  }
): Promise<PromoClaimResult> {
  return claimThrough(admin, {
    code: args.code,
    listPricePaise: args.listPricePaise,
    noEffectMessage: "That code doesn't take anything off this programme.",
    rpc: "claim_promo_code_for_purchase",
    params: {
      p_patient_id: args.patientId,
      p_purchase_kind: args.purchaseKind,
      p_purchase_id: args.purchaseId,
      p_patient_has_paid_before: args.patientHasPaidBefore,
    },
    release: () =>
      releasePromoCodeForPurchase(admin, args.purchaseKind, args.purchaseId, args.patientId),
  });
}

async function claimThrough(
  admin: AdminClient,
  args: {
    code: string;
    listPricePaise: number;
    noEffectMessage: string;
    rpc: "claim_promo_code" | "claim_promo_code_for_purchase";
    params: Record<string, unknown>;
    release: () => Promise<void>;
  }
): Promise<PromoClaimResult> {
  const code = normalizePromoCode(args.code);
  const refuse = (reason: string, message: string) => ({ ok: false as const, reason, message });
  if (!code) return refuse("unknown", "That code isn't recognised.");

  let claimed: Record<string, unknown> | null = null;
  try {
    const { data, error } = await admin.rpc(args.rpc, { p_code: code, ...args.params });
    if (error) {
      console.error(`${args.rpc} failed`, error.message);
      return refuse("unknown", "That code couldn't be applied. Please try again.");
    }
    claimed = (data ?? null) as Record<string, unknown> | null;
  } catch (err) {
    console.error(`${args.rpc} threw`, err);
    return refuse("unknown", "That code couldn't be applied. Please try again.");
  }

  if (!claimed || claimed.ok !== true) {
    const reason = typeof claimed?.reason === "string" ? claimed.reason : "unknown";
    return refuse(reason, PROMO_CLAIM_MESSAGES[reason] ?? "That code isn't recognised.");
  }

  const minSpend = Number(claimed.min_spend_paise ?? 0);
  if (minSpend > 0 && args.listPricePaise < minSpend) {
    // Released rather than left attached: a code stamped on a booking it
    // does not apply to would go on counting against its own cap.
    await args.release();
    return refuse(
      "min_spend",
      `That code applies to bookings of ₹${Math.round(minSpend / 100).toLocaleString(
        "en-IN"
      )} or more.`
    );
  }

  const outcome = promoOutcome(
    {
      id: String(claimed.promo_code_id),
      code: String(claimed.code),
      kind: claimed.kind === "percent_off" ? "percent_off" : "amount_off",
      value: Number(claimed.value ?? 0),
      active: true,
      startsAt: null,
      endsAt: null,
      maxRedemptions: null,
      maxPerPatient: 1,
      minSpendPaise: minSpend,
      firstSessionOnly: claimed.first_session_only === true,
    },
    args.listPricePaise
  );

  if (!outcome.source || outcome.discountPaise <= 0) {
    await args.release();
    return refuse("no_effect", args.noEffectMessage);
  }

  return {
    ok: true,
    promoCodeId: String(claimed.promo_code_id),
    code: String(claimed.code),
    outcome,
  };
}

/** Taking a code back off a booking that has not been paid for. */
export async function releasePromoCode(
  admin: AdminClient,
  appointmentId: string,
  patientId: string
): Promise<void> {
  try {
    await admin.rpc("release_promo_code", {
      p_appointment_id: appointmentId,
      p_patient_id: patientId,
    });
  } catch (err) {
    console.error("release_promo_code failed", err);
  }
}

/** Taking a code back off a programme purchase that has not been paid for. */
export async function releasePromoCodeForPurchase(
  admin: AdminClient,
  purchaseKind: "session_package" | "home_visit_package",
  purchaseId: string,
  patientId: string
): Promise<void> {
  try {
    const { error } = await admin.rpc("release_promo_code_for_purchase", {
      p_purchase_kind: purchaseKind,
      p_purchase_id: purchaseId,
      p_patient_id: patientId,
    });
    if (error) console.error("release_promo_code_for_purchase failed", error.message);
  } catch (err) {
    console.error("release_promo_code_for_purchase threw", err);
  }
}

/** Kept in step with the 30-minute hold in `promo_code_claim_count()`. */
export const PROMO_HOLD_MS = 30 * 60 * 1000;

const PROMO_CLAIM_MESSAGES: Record<string, string> = {
  unknown: "That code isn't recognised.",
  inactive: "That code is no longer available.",
  not_started: "That code hasn't started yet.",
  expired: "That code has expired.",
  exhausted: "That code has been fully claimed.",
  already_used: "You've already used that code.",
  first_session_only: "That code is for a first session only.",
  not_for_programmes: PROMO_NOT_FOR_PROGRAMMES_MESSAGE,
};

async function countClaims(
  admin: AdminClient,
  promoCodeId: string,
  target: PromoClaimTarget,
  heldSince: string,
  patientId: string | null
): Promise<number> {
  const excludeAppointment = target.kind === "appointment" ? target.id : NO_ROW;
  const excludePurchase =
    target.kind === "programme" ? target.purchaseId ?? NO_ROW : NO_ROW;

  let appointments = admin
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("promo_code_id", promoCodeId)
    .neq("id", excludeAppointment)
    .neq("status", "cancelled")
    .or(`payment_status.eq.paid,payment_terms.eq.pay_later,promo_claimed_at.gt.${heldSince}`);
  if (patientId) appointments = appointments.eq("patient_id", patientId);

  // A programme's claim lives on its purchase. Counted here as
  // `promo_code_claim_count()` counts it, so a code half-used on sessions and
  // half on programmes reads the same total in the preview and at the claim.
  const purchases = (table: "patient_package_purchases" | "home_visit_package_purchases") => {
    let query = admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("promo_code_id", promoCodeId)
      .neq("id", excludePurchase)
      .not("status", "in", "(cancelled,refunded)")
      .or(`payment_status.eq.paid,promo_claimed_at.gt.${heldSince}`);
    if (patientId) query = query.eq("patient_id", patientId);
    return query;
  };

  const [a, p, h] = await Promise.all([
    appointments,
    purchases("patient_package_purchases"),
    purchases("home_visit_package_purchases"),
  ]);
  // A failed count reads as "fully claimed" rather than "none claimed": the
  // safe direction for an unreadable cap is to refuse the discount. The one
  // exception is a purchase table without the claim columns yet (42703, a
  // database one apply behind): no programme can have claimed anything
  // there, so it is a real zero rather than an unread one.
  if (a.error) return Number.MAX_SAFE_INTEGER;
  const purchaseCount = (r: { count: number | null; error: { code?: string } | null }) => {
    if (!r.error) return r.count ?? 0;
    return r.error.code === "42703" ? 0 : Number.MAX_SAFE_INTEGER;
  };
  const total = (a.count ?? 0) + purchaseCount(p) + purchaseCount(h);
  return Math.min(total, Number.MAX_SAFE_INTEGER);
}

/**
 * Whether a `first_session_only` code is still open to this patient.
 *
 * The same question the standing offer asks, so it reads the same query --
 * see `countPriorCommittedSessions`. Two readers of "is this patient new"
 * with two definitions is how one of them comes to say yes to a patient the
 * other has already turned down.
 *
 * Unreadable means "has been here before", which costs a first-session-only
 * code rather than giving one away.
 */
async function countPriorPaid(admin: AdminClient, patientId: string): Promise<number> {
  const prior = await countPriorCommittedSessions(admin, patientId);
  if (prior.failed) return 1;
  return prior.count ?? 0;
}
