// Has this patient ever committed to paying for a session before?
//
// One question, three readers, and until this module they were three
// queries that had quietly stopped agreeing:
//
//   * the standing first-session offer (`checkoutQuote.ts`)
//   * a `first_session_only` promo code (`promoCodesServer.ts`)
//   * an invite welcome (`claim_invite()` in `schema.sql`, whose own
//     comment says it is "the same test the first-session offer uses")
//
// All three asked `payment_status = 'paid'`, which was the whole truth
// until pay later existed. A session on terms sits at `unpaid` for its whole
// life by design, so that test answered "never paid for a session" for a
// trusted patient on **every** booking they ever made: the offer fired on
// session two, three and four, a first-session-only code was claimable
// repeatedly, and an invite welcome was claimable after they had already
// been treated. Silently, in all three cases.
//
// So the question counts a **commitment** rather than a capture, which is
// the same reasoning `claim_promo_code` was already given in the change that
// made pay-later bookings count against a cap: a confirmed booking on terms
// is not an abandoned checkout. The price and the discount are frozen on it
// and can never be taken back, so it makes the patient no longer new exactly
// as a paid one does.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PriorSessionLookup } from "@/lib/discounts";

/**
 * Counted as **two** queries rather than one `or(...)`, and that is the
 * point rather than an accident.
 *
 * The paid half is the query this replaced, byte-for-byte, so its answer on
 * a database with no pay-later bookings is exactly what it always was. The
 * terms half reads `payment_terms`, which is a migration-dependent column:
 * on a database that has not run the migration it errors with `42703`, and
 * swallowing that into a zero is correct -- a database with no such column
 * has no such booking either. Folding the two into one query would let that
 * one missing column fail the whole count, and this count fails **closed**,
 * so an unapplied migration would silently withdraw the first-session offer
 * from everybody.
 *
 * `failed` is carried rather than swallowed, because the two callers fail in
 * the same direction and say so differently: `isFirstSessionEligible` reads
 * it and refuses the offer, and the promo evaluation reads a non-zero count
 * as "has paid before". Both cost a discount rather than giving one away,
 * which is the safe direction for an answer nobody could read.
 */
export async function countPriorCommittedSessions(
  admin: SupabaseClient,
  patientId: string
): Promise<PriorSessionLookup> {
  const [paid, onTerms] = await Promise.all([
    countPaid(admin, patientId),
    countConfirmedOnTerms(admin, patientId),
  ]);
  if (paid.failed) return { count: null, failed: true };
  return { count: (paid.count ?? 0) + onTerms, failed: false };
}

async function countPaid(
  admin: SupabaseClient,
  patientId: string
): Promise<PriorSessionLookup> {
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

/**
 * A booking on terms that is still standing.
 *
 * `status <> 'cancelled'` is not decoration: a cancelled pay-later booking
 * was never delivered and owes nothing, so spending a once-ever offer on it
 * would charge somebody for a session that did not happen -- the same
 * exclusion `claim_promo_code` carries, for the same reason. The paid half
 * above deliberately does **not** get that exclusion, because it never had
 * it and widening it here would hand the offer back to every patient who
 * ever paid for a session and then cancelled it.
 *
 * `payment_status <> 'paid'` keeps a settled pay-later session from being
 * counted twice once Phase 4 stamps it paid. Nothing reads this number
 * except against zero, so the double count would be harmless -- but a count
 * that is wrong in a way nothing happens to notice is how it comes to be
 * read by something that does.
 */
async function countConfirmedOnTerms(
  admin: SupabaseClient,
  patientId: string
): Promise<number> {
  try {
    const { count, error } = await admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", patientId)
      .eq("payment_terms", "pay_later")
      .neq("payment_status", "paid")
      .neq("status", "cancelled");
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
