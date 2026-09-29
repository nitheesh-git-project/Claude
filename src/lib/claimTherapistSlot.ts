import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The one way a therapist is reserved for a session.
 *
 * Six paths used to do this for themselves -- admin assignment, referral
 * assignment, the booking editor, auto-assignment on payment (twice, once
 * per payment path), package booking and home-visit booking -- and every one
 * of them was a read, a write, and at best a re-read with a hand-rolled
 * revert. That sequence cannot hold the property it exists for: two requests
 * both pass the check before either write lands, and the clinic owes two
 * patients the same hour. The revert made it worse on the admin path, since
 * it rewrote `therapist_id` with no compare-and-set and so could stamp over
 * a third admin's assignment.
 *
 * `claim_therapist_slot` in schema.sql does all of it inside one transaction
 * under a row lock on the therapist, so there is no window and nothing to
 * revert. This is the thin wrapper; the rules live in the function, and
 * `scripts/therapist-slot-sql-checks.sql` is what proves them.
 *
 * It never throws. A booking must not fail because a reservation helper
 * raised, so a transport error resolves as `unavailable` and each caller
 * decides what that means for it -- which is the same three-way split the
 * admin guard and the rate limiter already use, for the same reason: a check
 * that could not be run is not a check that came back negative.
 */
export type ClaimSlotOutcome =
  | {
      ok: true;
      previousTherapistId: string | null;
      previousStatus: string | null;
      previousSlotTime: string | null;
    }
  | {
      ok: false;
      reason: "conflict" | "reassigned" | "no_appointment" | "no_therapist" | "bad_request" | "unavailable";
      currentTherapistId?: string | null;
    };

export type ClaimSlotInput = {
  appointmentId: string;
  therapistId: string;
  /**
   * What the caller believes is on the row right now. Pass
   * `expectUnassigned: true` for "I read this as having nobody on it", or
   * `expectedTherapistId` for "I read this as being on that person". They
   * are separate because `null` would otherwise have to mean both "nobody"
   * and "don't care", and those are different assertions -- conflating them
   * is how a stale read silently overwrites a live assignment.
   */
  expectedTherapistId?: string | null;
  expectUnassigned?: boolean;
  /** Travel padding for a home visit; 0 for an online session. */
  bufferMinutes?: number;
  /** Move the session to `confirmed` in the same statement. */
  confirm?: boolean;
  /** The referral being converted, so its own held slot is not a clash. */
  excludeReferralId?: string | null;
  /**
   * A reschedule: the time the session is moving TO, tested and written
   * inside the same lock. Omitted, the session keeps the slot it has and
   * that is what the overlap test judges. Passing the new time is what lets
   * a reschedule be atomic at all -- the alternative is writing it first
   * and re-checking afterwards, which is the sequence this replaces.
   */
  newSlotTime?: string | null;
  newDurationMinutes?: number | null;
  newCategoryId?: string | null;
};

export async function claimTherapistSlot(
  admin: SupabaseClient,
  input: ClaimSlotInput
): Promise<ClaimSlotOutcome> {
  const { data, error } = await admin.rpc("claim_therapist_slot", {
    p_appointment_id: input.appointmentId,
    p_therapist_id: input.therapistId,
    p_expected_therapist_id: input.expectedTherapistId ?? null,
    p_expect_unassigned: input.expectUnassigned ?? false,
    p_buffer_minutes: input.bufferMinutes ?? 0,
    p_confirm: input.confirm ?? false,
    p_exclude_referral_id: input.excludeReferralId ?? null,
    p_new_slot_time: input.newSlotTime ?? null,
    p_new_duration_minutes: input.newDurationMinutes ?? null,
    p_new_category_id: input.newCategoryId ?? null,
  });

  if (error) {
    // Includes the case where the migration has not been applied yet
    // (PGRST202 / 42883). Reported rather than swallowed, because the
    // callers refuse the assignment on it -- silently falling back to the
    // old unlocked path would reinstate the double-booking this replaced.
    console.error("claim_therapist_slot failed", error.message);
    return { ok: false, reason: "unavailable" };
  }

  const result = data as {
    ok?: boolean;
    reason?: string;
    current_therapist_id?: string | null;
    previous_therapist_id?: string | null;
    previous_status?: string | null;
    previous_slot_time?: string | null;
  } | null;

  if (!result) return { ok: false, reason: "unavailable" };

  if (result.ok) {
    return {
      ok: true,
      previousTherapistId: result.previous_therapist_id ?? null,
      previousStatus: result.previous_status ?? null,
      previousSlotTime: result.previous_slot_time ?? null,
    };
  }

  const reason = result.reason;
  if (
    reason === "conflict" ||
    reason === "reassigned" ||
    reason === "no_appointment" ||
    reason === "no_therapist" ||
    reason === "bad_request"
  ) {
    return { ok: false, reason, currentTherapistId: result.current_therapist_id ?? null };
  }
  return { ok: false, reason: "unavailable" };
}

/**
 * What to tell somebody, per refusal. One mapping rather than a sentence per
 * caller, so two screens cannot describe the same race two ways -- and the
 * two that read alike to a developer ("conflict" and "reassigned") send an
 * admin to genuinely different places, so they must not share wording.
 */
export function describeClaimFailure(
  outcome: Extract<ClaimSlotOutcome, { ok: false }>
): { status: number; error: string } {
  switch (outcome.reason) {
    case "conflict":
      return {
        status: 409,
        error:
          "That therapist already has another session overlapping this time. Pick a different therapist or move the slot.",
      };
    case "reassigned":
      return {
        status: 409,
        error:
          "Someone else changed who is on this session a moment ago. Refresh to see who has it before reassigning.",
      };
    case "no_appointment":
      return { status: 404, error: "That session no longer exists." };
    case "no_therapist":
      return { status: 404, error: "That therapist no longer exists." };
    case "bad_request":
      return { status: 400, error: "Missing the session or the therapist." };
    case "unavailable":
      return {
        status: 503,
        error: "We couldn't reserve that slot just now. Nothing has been changed - please try again.",
      };
  }
}
