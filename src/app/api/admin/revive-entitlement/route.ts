import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { adjustSessionCredits, creditErrorMessage } from "@/lib/sessionCredits";

const MAX_REASON_LENGTH = 500;
const MIN_REASON_LENGTH = 10;
const MAX_EXTENSION_DAYS = 365;

// Brings a package back that expired or was cancelled, and optionally gives
// it a new validity date.
//
// An expiry is a deadline, and deadlines are sometimes wrong: the patient
// was in hospital, the clinic was closed, an admin set a validity nobody
// meant. extend-package-expiry already handles a package that is still
// active; this handles one that has already lapsed, which that route
// cannot, and restores the credits the expiry sweep voided.
//
// It refuses a refunded package outright. Reviving one would leave the
// refund describing something that did not happen -- the money went back,
// and the honest fix is a new grant, not resurrecting the old row.
export async function POST(request: NextRequest) {
  const context = await requireAdminScope("money");
  if (!context) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    entitlementId?: string;
    extendDays?: number;
    reason?: string;
  }>(request);
  if (parseError) return parseError;

  const { entitlementId, extendDays, reason } = body;
  if (!entitlementId) {
    return NextResponse.json({ error: "Missing entitlementId" }, { status: 400 });
  }
  if (
    extendDays !== undefined &&
    (typeof extendDays !== "number" ||
      !Number.isInteger(extendDays) ||
      extendDays < 1 ||
      extendDays > MAX_EXTENSION_DAYS)
  ) {
    return NextResponse.json(
      { error: `Extension must be a whole number of days between 1 and ${MAX_EXTENSION_DAYS}.` },
      { status: 400 }
    );
  }

  const trimmedReason = reason?.trim() ?? "";
  if (trimmedReason.length < MIN_REASON_LENGTH) {
    return NextResponse.json(
      {
        error:
          "Say why this package is being reopened, in a sentence. It is stored on the patient's ledger permanently.",
      },
      { status: 400 }
    );
  }
  if (trimmedReason.length > MAX_REASON_LENGTH) {
    return NextResponse.json(
      { error: `Reason must be ${MAX_REASON_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: entitlement } = await admin
    .from("session_entitlements")
    .select(
      "id, patient_id, status, sessions_granted, granted_count, reserved_count, consumed_count, expires_at"
    )
    .eq("id", entitlementId)
    .maybeSingle();

  if (!entitlement) {
    return NextResponse.json({ error: "That package doesn't exist." }, { status: 404 });
  }
  if (entitlement.status === "refunded") {
    return NextResponse.json(
      {
        error:
          "This package was refunded — the money has gone back. Grant new sessions instead of reopening it.",
      },
      { status: 409 }
    );
  }
  if (entitlement.status === "active" || entitlement.status === "exhausted") {
    return NextResponse.json(
      {
        error:
          "This package is already open. To move its end date, use Extend expiry.",
      },
      { status: 409 }
    );
  }

  // How many credits the expiry (or cancellation) voided. Reviving restores
  // exactly that many -- never more, and never the consumed ones, which
  // were real delivered sessions and stay spent.
  const voided =
    entitlement.sessions_granted - entitlement.granted_count > 0
      ? entitlement.sessions_granted - entitlement.granted_count
      : 0;

  if (voided > 0) {
    const result = await adjustSessionCredits(admin, {
      entitlementId,
      deltaGranted: voided,
      reason: `[revive] ${trimmedReason}`,
      actorId: context.id,
      idempotencyKey: `revive:${entitlementId}:${entitlement.granted_count}`,
    });
    if (!result.applied && !result.duplicate) {
      return NextResponse.json({ error: creditErrorMessage(result.error) }, { status: 409 });
    }
  }

  const newExpiry = extendDays
    ? new Date(Date.now() + extendDays * 86_400_000).toISOString()
    : entitlement.expires_at;

  // Claimed on the status it was read at, so two admins reviving the same
  // package concurrently cannot both restore credits.
  const { data: revived, error: updateError } = await admin
    .from("session_entitlements")
    .update({ status: "active", expires_at: newExpiry, updated_at: new Date().toISOString() })
    .eq("id", entitlementId)
    .eq("status", entitlement.status)
    .select("id")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
  if (!revived) {
    return NextResponse.json(
      { error: "This package changed while you were working on it — refresh and try again." },
      { status: 409 }
    );
  }

  await recordAdminActivity(admin, context.id, {
    action: "credits.revive",
    targetId: entitlementId,
    targetLabel: entitlement.patient_id,
    details: {
      previousStatus: entitlement.status,
      creditsRestored: voided,
      extendDays: extendDays ?? null,
      newExpiresAt: newExpiry,
      reason: trimmedReason,
    },
  });

  return NextResponse.json({ success: true, creditsRestored: voided, expiresAt: newExpiry });
}
