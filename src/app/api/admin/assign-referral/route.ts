import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { referralId, therapistId, slotDateTime } = await request.json();
  if (!referralId || !therapistId || !slotDateTime) {
    return NextResponse.json(
      { error: "Missing referralId, therapistId, or slotDateTime" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: therapist } = await admin
    .from("profiles")
    .select("id")
    .eq("id", therapistId)
    .eq("role", "therapist")
    .eq("approved", true)
    .single();

  if (!therapist) {
    return NextResponse.json(
      { error: "That therapist is not an approved therapist" },
      { status: 400 }
    );
  }

  const inviteToken = crypto.randomUUID();

  const { error } = await admin
    .from("patient_referrals")
    .update({
      assigned_therapist_id: therapistId,
      assigned_slot_time: new Date(slotDateTime).toISOString(),
      invite_token: inviteToken,
      status: "invite_sent",
    })
    .eq("id", referralId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ inviteToken });
}
