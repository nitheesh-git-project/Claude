import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { mirrorAdminRestore } from "@/lib/sessionCreditMirror";
import { parseJsonBody } from "@/lib/parseJsonBody";

const MAX_REASON_LENGTH = 500;

// The home-visit twin of /api/admin/restore-package-session -- hands a
// visit back to a programme's balance after it was forfeited (a late
// cancellation or a no-show, both of which deliberately leave visits_used
// untouched, same counter semantics as sessions_used). Admin override only;
// never happens automatically.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("catalog");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    purchaseId?: string;
    appointmentId?: string;
    reason?: string;
  }>(request);
  if (parseError) return parseError;
  const { purchaseId, appointmentId, reason } = body;

  if (!purchaseId || !appointmentId) {
    return NextResponse.json({ error: "Missing purchaseId or appointmentId" }, { status: 400 });
  }
  if (reason && reason.length > MAX_REASON_LENGTH) {
    return NextResponse.json(
      { error: `Reason must be ${MAX_REASON_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const [{ data: purchase }, { data: appointment }] = await Promise.all([
    admin
      .from("home_visit_package_purchases")
      .select("id, visits_used, visit_count, status")
      .eq("id", purchaseId)
      .single(),
    admin
      .from("appointments")
      .select("id, home_visit_purchase_id, status")
      .eq("id", appointmentId)
      .single(),
  ]);

  if (!purchase) {
    return NextResponse.json({ error: "Home visit package purchase not found" }, { status: 404 });
  }
  if (!appointment || appointment.home_visit_purchase_id !== purchaseId) {
    return NextResponse.json(
      { error: "That visit doesn't belong to this package purchase." },
      { status: 400 }
    );
  }
  if (appointment.status !== "cancelled" && appointment.status !== "completed") {
    return NextResponse.json(
      { error: "Only a cancelled or completed (no-show) visit can be restored." },
      { status: 400 }
    );
  }

  const { data: existingRestore } = await admin
    .from("home_visit_purchase_events")
    .select("id")
    .eq("purchase_id", purchaseId)
    .eq("appointment_id", appointmentId)
    .eq("event_type", "visit_restored")
    .maybeSingle();
  if (existingRestore) {
    return NextResponse.json({ error: "This visit has already been restored." }, { status: 409 });
  }

  if (purchase.visits_used <= 0) {
    return NextResponse.json(
      { error: "This package has no claimed visits to restore." },
      { status: 400 }
    );
  }

  const { data: claimed, error: updateError } = await admin
    .from("home_visit_package_purchases")
    .update({
      visits_used: purchase.visits_used - 1,
      ...(purchase.status === "completed" ? { status: "active" } : {}),
    })
    .eq("id", purchaseId)
    .eq("visits_used", purchase.visits_used)
    .select("id")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json(
      { error: "This package changed concurrently — please try again." },
      { status: 409 }
    );
  }

  const { error: eventError } = await admin.from("home_visit_purchase_events").insert({
    purchase_id: purchaseId,
    event_type: "visit_restored",
    actor_id: adminUser.id,
    appointment_id: appointmentId,
    detail: { reason: reason?.trim() || null },
  });
  if (eventError) {
    console.error("Failed to log visit_restored event for home visit purchase", purchaseId, eventError);
  }

  // The purchase event above is the programme's own timeline; this is the
  // clinic-wide one. Restoring hands a forfeited session back, so the
  // patient keeps value they had lost and recognised revenue moves with it
  // -- isMoneyAction counts session.restore for exactly that reason.
  // The ledger equivalent of the decrement above. Which movement that is
  // depends on what the credit did: a late cancellation never spent its
  // reserve and is released, while a no-show consumed it and takes an
  // adjustment instead -- handing back a spent credit is a decision, and
  // belongs in the ledger with a name and a reason on it.
  await mirrorAdminRestore(admin, {
    appointmentId,
    actorId: adminUser.id,
    reason: reason?.trim() || null,
  });

  await recordAdminActivity(admin, adminUser.id, {
    action: "session.restore",
    targetId: appointmentId,
    targetLabel: purchaseId,
    details: { purchaseId, reason: reason?.trim() || null },
  });

  return NextResponse.json({ success: true });
}
