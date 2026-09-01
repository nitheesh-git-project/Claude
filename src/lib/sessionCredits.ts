import type { SupabaseClient } from "@supabase/supabase-js";

// Typed on SupabaseClient rather than ReturnType<typeof createAdminClient>
// so cancelAppointment.ts -- which has only ever taken the wider type --
// can call these without a cast. It must still be a service-role client:
// every function below reaches a database function that anon and
// authenticated have had EXECUTE revoked on.
type AdminClient = SupabaseClient;

// The credit ledger, from TypeScript.
//
// Every function here is a thin wrapper over a database function, because
// moving a credit means moving a `session_entitlements` row and a
// `session_credit_ledger` row together under a real `select ... for update`
// -- and supabase-js cannot express a transaction, so a route can only ever
// compare-and-swap one column. See the "credit RPCs" section of
// supabase/schema.sql for the reasoning in full.
//
// Two properties hold for all of them and are worth knowing before adding a
// caller:
//
//   * They are idempotent on a key derived from the thing that happened (an
//     appointment id, a payment id) -- never a random value. A retried
//     caller gets `duplicate: true` and the balance does not move.
//   * They never throw for an expected outcome. A refusal comes back as
//     `applied: false` with an `error` code, so a caller can report it
//     without a try/catch around each call. Same shape as
//     bookPackageSession.

/** Why a credit could not move. Every value is returned by the RPCs, not invented here. */
export type CreditError =
  | "no_such_entitlement"
  | "no_credits_available"
  | "entitlement_expired"
  | "entitlement_refunded"
  | "entitlement_cancelled"
  | "entitlement_expired_status"
  | "no_reservation_for_appointment"
  | "already_consumed"
  | "rpc_failed";

export type CreditResult = {
  applied: boolean;
  /** True when this exact movement had already been recorded. Not an error. */
  duplicate: boolean;
  error?: string;
  entitlementId?: string;
  granted?: number;
  reserved?: number;
  consumed?: number;
  available?: number;
  status?: string;
};

/** Human-readable copy for the refusals a person might actually see. */
export const CREDIT_ERROR_MESSAGES: Record<string, string> = {
  no_such_entitlement: "That package no longer exists.",
  no_credits_available: "No sessions remaining on this package.",
  entitlement_expired: "This package has expired. Ask the clinic to extend it before scheduling more sessions.",
  entitlement_refunded: "This package has been refunded.",
  entitlement_cancelled: "This package is no longer active.",
  no_reservation_for_appointment: "This session isn't covered by a package.",
  already_consumed: "This session has already been delivered, so its credit can't be handed back automatically.",
  rpc_failed: "Could not update the session balance. Please try again.",
};

export function creditErrorMessage(error: string | undefined): string {
  return (error && CREDIT_ERROR_MESSAGES[error]) ?? CREDIT_ERROR_MESSAGES.rpc_failed;
}

function toResult(data: unknown, error: { message: string } | null, label: string): CreditResult {
  if (error) {
    console.error(`${label} failed`, error.message);
    return { applied: false, duplicate: false, error: "rpc_failed" };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    applied: row.applied === true,
    duplicate: row.duplicate === true,
    error: (row.error as string | undefined) ?? undefined,
    entitlementId: (row.entitlement_id as string | undefined) ?? undefined,
    granted: (row.granted as number | undefined) ?? undefined,
    reserved: (row.reserved as number | undefined) ?? undefined,
    consumed: (row.consumed as number | undefined) ?? undefined,
    available: (row.available as number | undefined) ?? undefined,
    status: (row.status as string | undefined) ?? undefined,
  };
}

/** A booking claimed a credit. Keyed on the appointment, so a retry reserves once. */
export async function reserveSessionCredit(
  admin: AdminClient,
  {
    entitlementId,
    appointmentId,
    actorId,
    actorRole = "patient",
  }: {
    entitlementId: string;
    appointmentId: string;
    actorId?: string | null;
    actorRole?: "patient" | "therapist" | "admin" | "system";
  }
): Promise<CreditResult> {
  const { data, error } = await admin.rpc("reserve_session_credit", {
    p_entitlement_id: entitlementId,
    p_appointment_id: appointmentId,
    p_actor_id: actorId ?? null,
    p_actor_role: actorRole,
  });
  return toResult(data, error, "reserve_session_credit");
}

/**
 * The session was delivered -- or no-showed, which forfeits it, matching the
 * rule a late cancellation already follows. Moves the credit from reserved
 * to consumed rather than taking a second one.
 *
 * Returns `no_reservation_for_appointment` for a session that was paid for
 * directly rather than out of a package. That is the ordinary case for most
 * sessions and is not an error.
 */
export async function consumeSessionCredit(
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
): Promise<CreditResult> {
  const { data, error } = await admin.rpc("consume_session_credit", {
    p_appointment_id: appointmentId,
    p_actor_id: actorId ?? null,
    p_actor_role: actorRole,
  });
  return toResult(data, error, "consume_session_credit");
}

/**
 * Cancelled before delivery, outside the forfeit window -- the credit goes
 * back. Refuses on an already-consumed session: handing back a delivered
 * session's credit is an admin adjustment with a reason, not a release.
 */
export async function releaseSessionCredit(
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
): Promise<CreditResult> {
  const { data, error } = await admin.rpc("release_session_credit", {
    p_appointment_id: appointmentId,
    p_actor_id: actorId ?? null,
    p_actor_role: actorRole,
    p_reason: reason ?? null,
  });
  return toResult(data, error, "release_session_credit");
}

/**
 * Voids what is still available and nothing else -- consumed credits are
 * sessions that were delivered, and a refund does not un-deliver them.
 */
export async function voidSessionCredits(
  admin: AdminClient,
  {
    entitlementId,
    kind,
    idempotencyKey,
    actorId,
    reason,
  }: {
    entitlementId: string;
    kind: "refund" | "expire";
    idempotencyKey: string;
    actorId?: string | null;
    reason?: string | null;
  }
): Promise<CreditResult & { voided?: number }> {
  const { data, error } = await admin.rpc("void_session_credits", {
    p_entitlement_id: entitlementId,
    p_kind: kind,
    p_idempotency_key: idempotencyKey,
    p_actor_id: actorId ?? null,
    p_reason: reason ?? null,
  });
  const base = toResult(data, error, "void_session_credits");
  const row = (data ?? {}) as Record<string, unknown>;
  return { ...base, voided: (row.voided as number | undefined) ?? undefined };
}

/**
 * The admin override lane: grant goodwill or service-recovery credits,
 * reverse a wrong consume, claw back a mistaken grant.
 *
 * The reason is not optional and not decorative -- the database rejects an
 * adjustment whose reason is shorter than ten characters, because an
 * unexplained change to someone's balance is the thing the ledger exists to
 * prevent. The entitlement's own CHECK still binds the deltas, so even a
 * mistyped override cannot produce an impossible balance.
 */
export async function adjustSessionCredits(
  admin: AdminClient,
  {
    entitlementId,
    deltaGranted = 0,
    deltaReserved = 0,
    deltaConsumed = 0,
    reason,
    actorId,
    idempotencyKey,
  }: {
    entitlementId: string;
    deltaGranted?: number;
    deltaReserved?: number;
    deltaConsumed?: number;
    reason: string;
    actorId: string;
    idempotencyKey: string;
  }
): Promise<CreditResult> {
  const { data, error } = await admin.rpc("adjust_session_credits", {
    p_entitlement_id: entitlementId,
    p_delta_granted: deltaGranted,
    p_delta_reserved: deltaReserved,
    p_delta_consumed: deltaConsumed,
    p_reason: reason,
    p_actor_id: actorId,
    p_idempotency_key: idempotencyKey,
  });
  return toResult(data, error, "adjust_session_credits");
}

/**
 * Which entitlement, if any, a session's credit came out of. Read in its
 * own call rather than joined into a wider query, per the
 * migration-dependent-column rule -- these tables are new, and a database
 * that has not re-run schema.sql must degrade to "no entitlement" rather
 * than failing the whole read.
 */
export async function findEntitlementForAppointment(
  admin: AdminClient,
  appointmentId: string
): Promise<string | null> {
  try {
    const { data } = await admin
      .from("session_credit_ledger")
      .select("entitlement_id")
      .eq("appointment_id", appointmentId)
      .eq("entry_type", "reserve")
      .maybeSingle();
    return data?.entitlement_id ?? null;
  } catch {
    return null;
  }
}

/**
 * The entitlement mirroring a legacy purchase row, for as long as both are
 * being written. Same isolated-read reasoning as above.
 */
export async function findEntitlementForLegacyPurchase(
  admin: AdminClient,
  { packagePurchaseId, homeVisitPurchaseId }: {
    packagePurchaseId?: string | null;
    homeVisitPurchaseId?: string | null;
  }
): Promise<string | null> {
  const column = packagePurchaseId ? "legacy_purchase_id" : "legacy_home_visit_purchase_id";
  const value = packagePurchaseId ?? homeVisitPurchaseId;
  if (!value) return null;
  try {
    const { data } = await admin
      .from("session_entitlements")
      .select("id")
      .eq(column, value)
      .maybeSingle();
    return data?.id ?? null;
  } catch {
    return null;
  }
}
