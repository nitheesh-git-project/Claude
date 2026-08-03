import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { SESSION_FEE_PAISE } from "@/lib/pricing";

// Online payouts aren't wired up yet — this route only ever actually
// settles anything for method "cash". "online" is accepted so the client
// can distinguish the tap for its own UI, but it's rejected here rather
// than silently doing nothing, so nothing can ever look "paid" without
// money having actually changed hands.
const IMPLEMENTED_METHODS = ["cash"];

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { therapistId, method, note } = await request.json();
  if (!therapistId || !method) {
    return NextResponse.json(
      { error: "Missing therapistId or method" },
      { status: 400 }
    );
  }
  if (!IMPLEMENTED_METHODS.includes(method)) {
    return NextResponse.json(
      { error: "Online payouts aren't available yet — use cash for now." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: therapist } = await admin
    .from("profiles")
    .select("id, revenue_share_percent")
    .eq("id", therapistId)
    .eq("role", "therapist")
    .single();

  if (!therapist) {
    return NextResponse.json({ error: "Therapist not found" }, { status: 404 });
  }
  if (therapist.revenue_share_percent === null) {
    return NextResponse.json(
      { error: "Set this therapist's revenue share % before paying out." },
      { status: 400 }
    );
  }

  const { data: unsettled } = await admin
    .from("appointments")
    .select("id, amount_paid_paise")
    .eq("therapist_id", therapistId)
    .eq("payment_status", "paid")
    .is("therapist_payout_paid_at", null);

  if (!unsettled || unsettled.length === 0) {
    return NextResponse.json(
      { error: "There's nothing currently owed to this therapist." },
      { status: 400 }
    );
  }

  const paidAt = new Date().toISOString();
  const results = await Promise.all(
    unsettled.map((a) => {
      const paidPaise = a.amount_paid_paise ?? SESSION_FEE_PAISE;
      const payoutPaise = Math.round((paidPaise * therapist.revenue_share_percent!) / 100);
      return admin
        .from("appointments")
        .update({
          therapist_payout_paid_at: paidAt,
          therapist_payout_amount_paise: payoutPaise,
          therapist_payout_method: method,
          therapist_payout_note: note || null,
        })
        .eq("id", a.id);
    })
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, settledCount: unsettled.length });
}
