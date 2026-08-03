import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { referralId } = await request.json();
  if (!referralId) {
    return NextResponse.json({ error: "Missing referralId" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: referral } = await admin
    .from("patient_referrals")
    .select("status")
    .eq("id", referralId)
    .single();

  if (!referral) {
    return NextResponse.json({ error: "Referral not found" }, { status: 404 });
  }
  if (referral.status === "invite_sent" || referral.status === "converted") {
    return NextResponse.json(
      { error: "An invite has already been sent for this referral, so it can't be declined" },
      { status: 400 }
    );
  }

  // Atomic claim: the read above could be stale by the time this write
  // lands — e.g. an admin sends an invite (assign-referral) in the moment
  // between this route's read and write, which would otherwise let this
  // write silently flip status back to 'declined' even though a live
  // invite link now exists for the patient. Requiring status still be in
  // the pre-invite set at write time closes that.
  const { data: updated, error } = await admin
    .from("patient_referrals")
    .update({ status: "declined" })
    .eq("id", referralId)
    .in("status", ["pending_review", "therapist_assigned"])
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: "An invite has already been sent for this referral, so it can't be declined" },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
