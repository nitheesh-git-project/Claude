import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";

// Admin confirming that cash a therapist collected has actually reached the
// business. Between record-cash-collection and this route, the therapist is
// holding company money on nothing but their own assertion -- this is the
// other half of that reconciliation, and the whole reason the Cash Ledger
// tracks the two timestamps separately instead of just one "paid" flag.
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
    .select("id, cash_collected_at, cash_remitted_at, home_visit_purchase_id, cash_collected_amount_paise")
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appointment) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }
  if (!appointment.cash_collected_at) {
    return NextResponse.json(
      { error: "No cash has been recorded as collected on this visit." },
      { status: 400 }
    );
  }

  // CAS on cash_remitted_at staying null -- an admin double-clicking, or
  // two admins working the same ledger, must not both count the same cash
  // as remitted twice in whatever downstream reconciliation reads this.
  const { data: claimed, error } = await admin
    .from("appointments")
    .update({ cash_remitted_at: new Date().toISOString() })
    .eq("id", appointmentId)
    .is("cash_remitted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json(
      { error: "This cash was already marked as remitted." },
      { status: 409 }
    );
  }

  if (appointment.home_visit_purchase_id) {
    try {
      await admin.from("home_visit_purchase_events").insert({
        purchase_id: appointment.home_visit_purchase_id,
        event_type: "cash_remitted",
        actor_id: adminUser.id,
        appointment_id: appointmentId,
        detail: { amountPaise: appointment.cash_collected_amount_paise },
      });
    } catch (eventError) {
      console.error("Failed to log cash_remitted event", appointmentId, eventError);
    }
  }

  return NextResponse.json({ success: true });
}
