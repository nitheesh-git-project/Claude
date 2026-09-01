import type { SupabaseClient } from "@supabase/supabase-js";
import {
  reserveSessionCredit,
  consumeSessionCredit,
  releaseSessionCredit,
  voidSessionCredits,
  adjustSessionCredits,
  findEntitlementForLegacyPurchase,
} from "@/lib/sessionCredits";

// Mirrors every movement of the legacy `sessions_used` / `visits_used`
// counters into the credit ledger, while the counters are still the thing
// the app reads.
//
// This is deliberately transitional. There are exactly eight statements in
// `src/` that mutate either counter, and each one now has a mirror call
// beside it; when the ledger becomes authoritative the counter writes go
// away and these calls become the real ones. Keeping them in their own
// module rather than inlining the RPCs makes that removal a single file to
// reason about, and makes "which counter writes are mirrored?" answerable
// by reading one list.
//
// The contract every function here honours: **a mirror failure never fails
// the operation it mirrors.** The counter is still authoritative, the
// patient's booking has already happened, and refusing it because a
// shadow ledger was unhappy would be strictly worse than a logged
// discrepancy that verify_entitlement_balances will surface on Settings →
// System Health. Same posture as the Meet-sync and audit-log rules.
//
// Every log line starts with the same prefix so a disagreement is one grep
// away rather than buried among unrelated errors.

const LOG = "[credit-mirror]";

type AdminClient = SupabaseClient;

function note(what: string, detail: Record<string, unknown>) {
  console.error(`${LOG} ${what}`, JSON.stringify(detail));
}

/**
 * Creates the entitlement mirroring a purchase, if it does not have one yet,
 * and grants its credits.
 *
 * Called wherever a purchase becomes real: the two verify routes, and the
 * cash-on-visit booking. The backfill covers everything that existed when it
 * ran; without this the ledger would quietly stop describing new sales the
 * moment it finished, and every later booking against a fresh purchase would
 * find no entitlement. Idempotent, so calling it on every capture is free.
 */
export async function mirrorEnsureEntitlement(
  admin: AdminClient,
  {
    packagePurchaseId,
    homeVisitPurchaseId,
  }: { packagePurchaseId?: string | null; homeVisitPurchaseId?: string | null }
): Promise<string | null> {
  const purchaseId = packagePurchaseId ?? homeVisitPurchaseId;
  if (!purchaseId) return null;
  try {
    const { data, error } = await admin.rpc("ensure_entitlement_for_purchase", {
      p_purchase_id: purchaseId,
      p_kind: packagePurchaseId ? "session_package" : "home_visit_package",
    });
    if (error) {
      note("could not create an entitlement for a new purchase", {
        purchaseId,
        error: error.message,
      });
      return null;
    }
    return (data as string | null) ?? null;
  } catch (err) {
    note("ensure entitlement threw", { purchaseId, err: String(err) });
    return null;
  }
}

/**
 * A booking claimed a session. Resolves which entitlement mirrors the
 * legacy purchase, then reserves one credit against it.
 *
 * A purchase with no entitlement is not an error worth shouting about on
 * every booking: it means the backfill has not run against this database
 * yet. It is logged once per booking and left for reconciliation.
 */
export async function mirrorReserve(
  admin: AdminClient,
  {
    appointmentId,
    packagePurchaseId,
    homeVisitPurchaseId,
    actorId,
    actorRole = "patient",
  }: {
    appointmentId: string;
    packagePurchaseId?: string | null;
    homeVisitPurchaseId?: string | null;
    actorId?: string | null;
    actorRole?: "patient" | "therapist" | "admin" | "system";
  }
): Promise<void> {
  try {
    const entitlementId = await findEntitlementForLegacyPurchase(admin, {
      packagePurchaseId,
      homeVisitPurchaseId,
    });
    if (!entitlementId) {
      note("no entitlement for purchase; reserve not mirrored", {
        appointmentId,
        packagePurchaseId,
        homeVisitPurchaseId,
      });
      return;
    }

    const result = await reserveSessionCredit(admin, {
      entitlementId,
      appointmentId,
      actorId,
      actorRole,
    });

    // `duplicate` is the ordinary answer to a retry and needs no noise.
    // Anything else means the counter moved and the ledger did not, which
    // is exactly the disagreement reconciliation exists to catch -- but it
    // is worth knowing about at the moment it happens, not only later.
    if (!result.applied && !result.duplicate) {
      note("counter claimed a session but the ledger refused the reserve", {
        appointmentId,
        entitlementId,
        error: result.error,
      });
    }
  } catch (err) {
    note("reserve threw", { appointmentId, err: String(err) });
  }
}

/**
 * The booking that claimed a credit failed to become an appointment, so the
 * counter was decremented again. Give the credit back too.
 */
export async function mirrorReserveRollback(
  admin: AdminClient,
  { appointmentId, actorId }: { appointmentId: string; actorId?: string | null }
): Promise<void> {
  try {
    const result = await releaseSessionCredit(admin, {
      appointmentId,
      actorId,
      actorRole: "system",
      reason: "Booking failed after the credit was reserved",
    });
    // `no_reservation_for_appointment` is the common case here: the
    // appointment insert failed, so there may never have been a reserve to
    // undo. Not worth logging.
    if (!result.applied && !result.duplicate && result.error !== "no_reservation_for_appointment") {
      note("could not release a credit after a failed booking", {
        appointmentId,
        error: result.error,
      });
    }
  } catch (err) {
    note("reserve rollback threw", { appointmentId, err: String(err) });
  }
}

/**
 * The session was delivered, or no-showed. Either way the credit is spent:
 * a no-show forfeits, matching the rule a late cancellation already follows.
 */
export async function mirrorConsume(
  admin: AdminClient,
  {
    appointmentId,
    actorId,
    actorRole = "therapist",
  }: {
    appointmentId: string;
    actorId?: string | null;
    actorRole?: "patient" | "therapist" | "admin" | "system";
  }
): Promise<void> {
  try {
    const result = await consumeSessionCredit(admin, { appointmentId, actorId, actorRole });
    // Most sessions are paid for directly rather than out of a package, so
    // "no reservation" is the normal answer and says nothing is wrong.
    if (
      !result.applied &&
      !result.duplicate &&
      result.error !== "no_reservation_for_appointment"
    ) {
      note("session completed but the ledger would not consume its credit", {
        appointmentId,
        error: result.error,
      });
    }
  } catch (err) {
    note("consume threw", { appointmentId, err: String(err) });
  }
}

/**
 * A cancellation outside the forfeit window gave the session back to the
 * counter. Give the credit back too.
 */
export async function mirrorRelease(
  admin: AdminClient,
  {
    appointmentId,
    actorId,
    actorRole = "patient",
    reason,
  }: {
    appointmentId: string;
    actorId?: string | null;
    actorRole?: "patient" | "therapist" | "admin" | "system";
    reason?: string | null;
  }
): Promise<void> {
  try {
    const result = await releaseSessionCredit(admin, {
      appointmentId,
      actorId,
      actorRole,
      reason,
    });
    if (
      !result.applied &&
      !result.duplicate &&
      result.error !== "no_reservation_for_appointment"
    ) {
      note("counter restored a session but the ledger would not release it", {
        appointmentId,
        error: result.error,
      });
    }
  } catch (err) {
    note("release threw", { appointmentId, err: String(err) });
  }
}

/**
 * An admin waived a forfeiture: a late cancellation or a no-show whose
 * session is being handed back.
 *
 * Which ledger movement that is depends on what the credit did. A late
 * cancellation never spent its reserve, so the credit is released. A
 * no-show consumed it, and releasing is refused for exactly that reason --
 * so it takes an adjustment, which is right: handing back a delivered
 * session's credit is a decision someone made and belongs in the ledger
 * with their name and a reason on it.
 */
export async function mirrorAdminRestore(
  admin: AdminClient,
  {
    appointmentId,
    actorId,
    reason,
  }: { appointmentId: string; actorId: string; reason?: string | null }
): Promise<void> {
  try {
    const { data: consumed } = await admin
      .from("session_credit_ledger")
      .select("entitlement_id")
      .eq("appointment_id", appointmentId)
      .eq("entry_type", "consume")
      .maybeSingle();

    const statedReason =
      reason?.trim() || "Admin waived the forfeiture on this session.";

    if (consumed?.entitlement_id) {
      const result = await adjustSessionCredits(admin, {
        entitlementId: consumed.entitlement_id,
        deltaConsumed: -1,
        // The ten-character floor is enforced by the database, so a blank
        // admin reason must not be passed through as-is.
        reason: `[restore] ${statedReason}`,
        actorId,
        idempotencyKey: `admin_restore:${appointmentId}`,
      });
      if (!result.applied && !result.duplicate) {
        note("admin restored a forfeited session but the ledger refused", {
          appointmentId,
          error: result.error,
        });
      }
      return;
    }

    const result = await releaseSessionCredit(admin, {
      appointmentId,
      actorId,
      actorRole: "admin",
      reason: statedReason,
    });
    if (
      !result.applied &&
      !result.duplicate &&
      result.error !== "no_reservation_for_appointment"
    ) {
      note("admin restored a session but the ledger would not release it", {
        appointmentId,
        error: result.error,
      });
    }
  } catch (err) {
    note("admin restore threw", { appointmentId, err: String(err) });
  }
}

/**
 * A purchase was refunded or expired. Voids whatever is still unspent.
 *
 * Worth knowing: the refund routes deliberately never touch the legacy
 * counters -- they cancel the remaining appointments in place and leave
 * `sessions_used` where it was. So this is not mirroring a counter write at
 * all; it is the ledger recording something the counters never recorded,
 * which is the first place the ledger says more than they can.
 */
export async function mirrorVoid(
  admin: AdminClient,
  {
    packagePurchaseId,
    homeVisitPurchaseId,
    kind,
    actorId,
    reason,
  }: {
    packagePurchaseId?: string | null;
    homeVisitPurchaseId?: string | null;
    kind: "refund" | "expire";
    actorId?: string | null;
    reason?: string | null;
  }
): Promise<void> {
  try {
    const entitlementId = await findEntitlementForLegacyPurchase(admin, {
      packagePurchaseId,
      homeVisitPurchaseId,
    });
    if (!entitlementId) {
      note("no entitlement for purchase; void not mirrored", {
        packagePurchaseId,
        homeVisitPurchaseId,
        kind,
      });
      return;
    }

    const result = await voidSessionCredits(admin, {
      entitlementId,
      kind,
      // Keyed on the entitlement and the kind, so a re-run of the expiry
      // sweep -- which happens on every dashboard render -- voids once.
      idempotencyKey: `${kind}:${entitlementId}`,
      actorId,
      reason,
    });
    if (!result.applied && !result.duplicate) {
      note("could not void credits on a refunded or expired purchase", {
        entitlementId,
        kind,
        error: result.error,
      });
    }
  } catch (err) {
    note("void threw", { packagePurchaseId, homeVisitPurchaseId, kind, err: String(err) });
  }
}

/** Voids a batch, for the set-based expiry sweeps. */
export async function mirrorVoidExpiredBatch(
  admin: AdminClient,
  {
    packagePurchaseIds = [],
    homeVisitPurchaseIds = [],
  }: { packagePurchaseIds?: string[]; homeVisitPurchaseIds?: string[] }
): Promise<void> {
  for (const id of packagePurchaseIds) {
    await mirrorVoid(admin, {
      packagePurchaseId: id,
      kind: "expire",
      reason: "Package validity ended",
    });
  }
  for (const id of homeVisitPurchaseIds) {
    await mirrorVoid(admin, {
      homeVisitPurchaseId: id,
      kind: "expire",
      reason: "Package validity ended",
    });
  }
}
