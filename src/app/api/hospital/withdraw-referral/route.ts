import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Self-serve mirror of /api/admin/decline-referral, scoped to the caller's
// own hospital_id instead of admin-only. Same atomic guard: only while
// still pending_review/therapist_assigned, blocked once an invite has gone
// out, so a hospital can't withdraw a referral out from under a patient who
// already has a live registration link.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "hospital") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { referralId } = await request.json();
  if (!referralId) {
    return NextResponse.json({ error: "Missing referralId" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: referral } = await admin
    .from("patient_referrals")
    .select("status, hospital_id")
    .eq("id", referralId)
    .single();

  if (!referral || referral.hospital_id !== user.id) {
    return NextResponse.json({ error: "Referral not found" }, { status: 404 });
  }
  if (referral.status === "invite_sent" || referral.status === "converted") {
    return NextResponse.json(
      { error: "An invite has already been sent for this referral, so it can't be withdrawn" },
      { status: 400 }
    );
  }

  const { data: updated, error } = await admin
    .from("patient_referrals")
    .update({ status: "declined" })
    .eq("id", referralId)
    .eq("hospital_id", user.id)
    .in("status", ["pending_review", "therapist_assigned"])
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: "An invite has already been sent for this referral, so it can't be withdrawn" },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
