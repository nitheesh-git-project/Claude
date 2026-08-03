import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SESSION_FEE_PAISE } from "@/lib/pricing";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, active, revenue_share_percent")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "therapist") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (profile.active === false) {
    return NextResponse.json({ error: "Your account has been suspended." }, { status: 403 });
  }
  if (profile.revenue_share_percent === null) {
    return NextResponse.json(
      { error: "Ask admin to set your revenue share % before requesting a payout." },
      { status: 400 }
    );
  }

  // Recomputed here, server-side -- never trust a client-sent amount for
  // real money. Same filter as settle-therapist-payout's own owed query:
  // status: 'completed' matters, not just payment_status: 'paid' -- a
  // still-upcoming paid session hasn't been delivered yet.
  const { data: unsettled } = await admin
    .from("appointments")
    .select("amount_paid_paise")
    .eq("therapist_id", user.id)
    .eq("payment_status", "paid")
    .eq("status", "completed")
    .is("therapist_payout_paid_at", null);

  const owedPaise = (unsettled ?? []).reduce(
    (sum, a) =>
      sum +
      Math.round(
        ((a.amount_paid_paise ?? SESSION_FEE_PAISE) * profile.revenue_share_percent!) / 100
      ),
    0
  );
  if (owedPaise <= 0) {
    return NextResponse.json(
      { error: "There's nothing currently owed to you yet." },
      { status: 400 }
    );
  }

  const { data: inserted, error } = await admin
    .from("therapist_payout_requests")
    .insert({ therapist_id: user.id, requested_amount_paise: owedPaise })
    .select("id")
    .single();

  if (error) {
    // Unique violation on payout_requests_one_pending_idx -- a request is
    // already open for this therapist.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "You already have a pending payout request." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, requestId: inserted.id, requestedAmountPaise: owedPaise });
}
