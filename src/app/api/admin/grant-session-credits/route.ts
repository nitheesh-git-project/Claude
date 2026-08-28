import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { adjustSessionCredits, creditErrorMessage } from "@/lib/sessionCredits";
import { GRANT_KINDS, isGrantKind, grantIsRevenue } from "@/lib/sessionGrants";

const MAX_REASON_LENGTH = 500;
const MIN_REASON_LENGTH = 10;
const MAX_CREDITS_PER_GRANT = 50;

// The admin's way to put sessions into a patient's account when the normal
// flow could not.
//
// This exists because things go wrong in ways no rule can anticipate: a
// therapist does not join the call, the connection drops ten minutes in, a
// Meet link never generated, the clinic simply decides to make something
// right. Before the ledger there was no honest way to do any of that --
// restore-package-session could only hand back a session that had been
// booked and cancelled, and everything else meant editing a counter by hand
// in the Supabase table editor, which left no reason, no actor and no trace.
//
// It is deliberately a first-class operation rather than a workaround. The
// safety is not that admins cannot do it; it is that every grant carries a
// reason, an actor and a ledger row, and shows up in the Activity Log and
// in the risk figures like anything else that moves money.
export async function POST(request: NextRequest) {
  const context = await requireAdminScope("money");
  if (!context) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    entitlementId?: string;
    count?: number;
    kind?: string;
    reason?: string;
    therapistPayable?: boolean;
  }>(request);
  if (parseError) return parseError;

  const { entitlementId, count, kind, reason, therapistPayable } = body;

  if (!entitlementId) {
    return NextResponse.json({ error: "Missing entitlementId" }, { status: 400 });
  }
  if (!isGrantKind(kind)) {
    return NextResponse.json(
      { error: `kind must be one of: ${GRANT_KINDS.join(", ")}` },
      { status: 400 }
    );
  }
  // Whole, positive, and bounded. The cap is not a policy about how generous
  // the clinic may be -- it is a typo guard, since "60" where "6" was meant
  // is a silent giveaway that only reconciliation would ever catch.
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > MAX_CREDITS_PER_GRANT
  ) {
    return NextResponse.json(
      { error: `Number of sessions must be a whole number between 1 and ${MAX_CREDITS_PER_GRANT}.` },
      { status: 400 }
    );
  }

  const trimmedReason = reason?.trim() ?? "";
  if (trimmedReason.length < MIN_REASON_LENGTH) {
    return NextResponse.json(
      {
        error:
          "Say why these sessions are being added, in a sentence. It is stored on the patient's ledger permanently.",
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
    .select("id, patient_id, status, sessions_granted, granted_count, reserved_count, consumed_count")
    .eq("id", entitlementId)
    .maybeSingle();

  if (!entitlement) {
    return NextResponse.json({ error: "That package doesn't exist." }, { status: 404 });
  }
  if (entitlement.status === "refunded") {
    return NextResponse.json(
      {
        error:
          "This package was refunded. Granting sessions onto it would leave the refund describing something that no longer happened — create a new grant instead.",
      },
      { status: 409 }
    );
  }

  // Keyed on the admin, the entitlement, the count and the reason. Two
  // identical grants a minute apart are almost certainly a double-submit;
  // an admin who genuinely means to grant twice can say so in the reason,
  // which changes the key.
  const idempotencyKey = `admin_grant:${context.id}:${count}:${hashReason(trimmedReason)}`;

  const result = await adjustSessionCredits(admin, {
    entitlementId,
    deltaGranted: count,
    reason: `[${kind}] ${trimmedReason}`,
    actorId: context.id,
    idempotencyKey,
  });

  if (!result.applied) {
    if (result.duplicate) {
      // Success-shaped, matching how the rest of this codebase answers a
      // repeated request: the admin asked for this and it is already true.
      return NextResponse.json({
        success: true,
        duplicate: true,
        available: result.available,
      });
    }
    return NextResponse.json({ error: creditErrorMessage(result.error) }, { status: 409 });
  }

  await recordAdminActivity(admin, context.id, {
    action: "credits.grant",
    targetId: entitlementId,
    targetLabel: entitlement.patient_id,
    details: {
      kind,
      count,
      reason: trimmedReason,
      // Service recovery is the clinic absorbing its own failure, so it
      // earns no revenue and by default earns the therapist no share.
      // Cash taken offline did earn both. The admin decides per grant,
      // because "the therapist no-showed" and "the network dropped" are
      // different situations that this one flag has to tell apart.
      countsAsRevenue: grantIsRevenue(kind),
      therapistPayable: therapistPayable === true,
      availableAfter: result.available,
    },
  });

  return NextResponse.json({
    success: true,
    available: result.available,
    granted: result.granted,
  });
}

// Short, stable digest of the reason, so the idempotency key changes when
// the admin genuinely means a different grant without putting free text
// into a key. Not a security primitive -- collisions here would only ever
// merge two identical-intent grants.
function hashReason(reason: string): string {
  let h = 0;
  for (let i = 0; i < reason.length; i += 1) {
    h = (h * 31 + reason.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}
