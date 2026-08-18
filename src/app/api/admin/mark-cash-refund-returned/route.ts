import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";

// Admin confirming that cash owed back to a patient (a cancelled cash-on-
// visit booking, flagged refund_status 'manual_pending' by
// cancelAppointmentAndRefund) has actually been handed back. There is no
// Razorpay payment behind cash, so nothing can refund itself -- this is the
// human step that clears the action queue on the Cash Ledger.
export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    appointmentId?: string;
  }>(request);
  if (parseError) return parseError;

  const { appointmentId } = body;
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: appointment } = await admin
    .from("appointments")
    .select("id, home_visit_purchase_id, refund_amount_paise")
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appointment) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  // CAS on refund_status staying 'manual_pending' -- an admin double-click,
  // or two admins working the same ledger, must not both count the same
  // cash hand-back as cleared twice.
  const { data: claimed, error } = await admin
    .from("appointments")
    .update({ refund_status: "processed" })
    .eq("id", appointmentId)
    .eq("refund_status", "manual_pending")
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json(
      { error: "This refund was already cleared." },
      { status: 409 }
    );
  }

  if (appointment.home_visit_purchase_id) {
    try {
      await admin.from("home_visit_purchase_events").insert({
        purchase_id: appointment.home_visit_purchase_id,
        event_type: "refunded",
        actor_id: adminUser.id,
        appointment_id: appointmentId,
        detail: { amountPaise: appointment.refund_amount_paise, method: "cash" },
      });
    } catch (eventError) {
      console.error("Failed to log refunded event", appointmentId, eventError);
    }
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "cash.mark_refund_returned",
    targetId: appointmentId,
  });

  return NextResponse.json({ success: true });
}
