import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";

const MAX_REASON_LENGTH = 500;

// Hands a session back to a package's balance after it was forfeited --
// a late cancellation (inside the 24-hour window) or a no-show, both of
// which deliberately leave sessions_used untouched (see the
// counter-semantics comment in schema.sql). This is the admin override for
// "the patient had a genuine emergency, waive the forfeiture" -- it never
// happens automatically.
export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
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
      .from("patient_package_purchases")
      .select("id, sessions_used, session_count, status")
      .eq("id", purchaseId)
      .single(),
    admin
      .from("appointments")
      .select("id, package_purchase_id, status")
      .eq("id", appointmentId)
      .single(),
  ]);

  if (!purchase) {
    return NextResponse.json({ error: "Package purchase not found" }, { status: 404 });
  }
  if (!appointment || appointment.package_purchase_id !== purchaseId) {
    return NextResponse.json(
      { error: "That session doesn't belong to this package purchase." },
      { status: 400 }
    );
  }
  if (appointment.status !== "cancelled" && appointment.status !== "completed") {
    return NextResponse.json(
      { error: "Only a cancelled or completed (no-show) session can be restored." },
      { status: 400 }
    );
  }

  // Idempotency: a specific appointment can only ever be restored once --
  // there's no other natural key to prevent a double-click from handing
  // back two free sessions for one forfeiture.
  const { data: existingRestore } = await admin
    .from("package_purchase_events")
    .select("id")
    .eq("purchase_id", purchaseId)
    .eq("appointment_id", appointmentId)
    .eq("event_type", "session_restored")
    .maybeSingle();
  if (existingRestore) {
    return NextResponse.json({ error: "This session has already been restored." }, { status: 409 });
  }

  if (purchase.sessions_used <= 0) {
    return NextResponse.json(
      { error: "This package has no claimed sessions to restore." },
      { status: 400 }
    );
  }

  const { data: claimed, error: updateError } = await admin
    .from("patient_package_purchases")
    .update({
      sessions_used: purchase.sessions_used - 1,
      // A fully "completed" purchase (every session used) now has one
      // pending session again.
      ...(purchase.status === "completed" ? { status: "active" } : {}),
    })
    .eq("id", purchaseId)
    .eq("sessions_used", purchase.sessions_used)
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

  const { error: eventError } = await admin.from("package_purchase_events").insert({
    purchase_id: purchaseId,
    event_type: "session_restored",
    actor_id: adminUser.id,
    appointment_id: appointmentId,
    detail: { reason: reason?.trim() || null },
  });
  if (eventError) {
    console.error("Failed to log session_restored event for purchase", purchaseId, eventError);
  }

  return NextResponse.json({ success: true });
}
