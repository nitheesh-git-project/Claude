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
  type PromoCode,
  type PromoEvaluation,
} from "@/lib/promoCodes";
import type { DiscountOutcome } from "@/lib/discounts";

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
 * What a code would do for this patient on this booking.
 *
 * Read-only. Counts a claim the same way `claim_promo_code()` does -- a
 * booking that was paid for, plus one still inside its checkout hold -- so
 * the preview and the claim agree except under the race the claim exists to
 * settle.
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
    appointmentId: string;
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

  try {
    const { data, error } = await admin
      .from("promo_codes")
      .select(PROMO_SELECT)
      .eq("code", code)
      .maybeSingle();
    if (error || !data) return unknown;

    const promo = toPromoCode(data as PromoRow);
    const heldSince = new Date(Date.now() - PROMO_HOLD_MS).toISOString();

    const [total, mine, prior] = await Promise.all([
      countClaims(admin, promo.id, args.appointmentId, heldSince, null),
      args.patientId
        ? countClaims(admin, promo.id, args.appointmentId, heldSince, args.patientId)
        : Promise.resolve(0),
      args.patientId ? countPriorPaid(admin, args.patientId) : Promise.resolve(0),
    ]);

    return evaluatePromoCode(promo, {
      listPricePaise: args.listPricePaise,
      now: args.now ?? new Date(),
      totalRedemptions: total,
      patientRedemptions: mine,
      patientHasPaidBefore: prior > 0,
    });
  } catch {
    return unknown;
  }
}

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
): Promise<
  | { ok: true; promoCodeId: string; code: string; outcome: DiscountOutcome }
  | { ok: false; reason: string; message: string }
> {
  const code = normalizePromoCode(args.code);
  const refuse = (reason: string, message: string) => ({ ok: false as const, reason, message });
  if (!code) return refuse("unknown", "That code isn't recognised.");

  let claimed: Record<string, unknown> | null = null;
  try {
    const { data, error } = await admin.rpc("claim_promo_code", {
      p_code: code,
      p_patient_id: args.patientId,
      p_appointment_id: args.appointmentId,
      p_patient_has_paid_before: args.patientHasPaidBefore,
    });
    if (error) {
      console.error("claim_promo_code failed", error.message);
      return refuse("unknown", "That code couldn't be applied. Please try again.");
    }
    claimed = (data ?? null) as Record<string, unknown> | null;
  } catch (err) {
    console.error("claim_promo_code threw", err);
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
    await releasePromoCode(admin, args.appointmentId, args.patientId);
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
    await releasePromoCode(admin, args.appointmentId, args.patientId);
    return refuse("no_effect", "That code doesn't take anything off this booking.");
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

/** Kept in step with `v_hold` in claim_promo_code(). */
export const PROMO_HOLD_MS = 30 * 60 * 1000;

const PROMO_CLAIM_MESSAGES: Record<string, string> = {
  unknown: "That code isn't recognised.",
  inactive: "That code is no longer available.",
  not_started: "That code hasn't started yet.",
  expired: "That code has expired.",
  exhausted: "That code has been fully claimed.",
  already_used: "You've already used that code.",
  first_session_only: "That code is for a first session only.",
};

async function countClaims(
  admin: AdminClient,
  promoCodeId: string,
  excludeAppointmentId: string,
  heldSince: string,
  patientId: string | null
): Promise<number> {
  let query = admin
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("promo_code_id", promoCodeId)
    .neq("id", excludeAppointmentId)
    .neq("status", "cancelled")
    .or(`payment_status.eq.paid,promo_claimed_at.gt.${heldSince}`);
  if (patientId) query = query.eq("patient_id", patientId);
  const { count, error } = await query;
  // A failed count reads as "fully claimed" rather than "none claimed": the
  // safe direction for an unreadable cap is to refuse the discount.
  if (error) return Number.MAX_SAFE_INTEGER;
  return count ?? 0;
}

async function countPriorPaid(admin: AdminClient, patientId: string): Promise<number> {
  const { count, error } = await admin
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", patientId)
    .eq("payment_status", "paid");
  // Unreadable means "has paid before", which costs a first-session-only
  // code rather than giving one away.
  if (error) return 1;
  return count ?? 0;
}
