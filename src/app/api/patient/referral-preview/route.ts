import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Public, unauthenticated lookup by invite token — lets the registration
// page validate the link and show the patient who referred them and what
// was arranged *before* they fill out the whole signup form, instead of
// only finding out it's invalid/expired after submitting.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: referral } = await admin
    .from("patient_referrals")
    .select(
      "patient_name, medical_issue, assigned_slot_time, status, hospital_id, assigned_therapist_id"
    )
    .eq("invite_token", token)
    .single();

  if (!referral || referral.status !== "invite_sent") {
    return NextResponse.json({ valid: false });
  }

  const [{ data: hospital }, { data: therapist }] = await Promise.all([
    admin
      .from("profiles")
      .select("organization_name")
      .eq("id", referral.hospital_id)
      .single(),
    referral.assigned_therapist_id
      ? admin
          .from("profiles")
          .select("full_name")
          .eq("id", referral.assigned_therapist_id)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  return NextResponse.json({
    valid: true,
    patientName: referral.patient_name,
    medicalIssue: referral.medical_issue,
    assignedSlotTime: referral.assigned_slot_time,
    // Registration still succeeds either way (see register-via-referral) --
    // this only lets the invite page warn the patient up front instead of
    // silently booking them against a time that's already gone.
    isPastSlot: !!referral.assigned_slot_time && new Date(referral.assigned_slot_time) < new Date(),
    hospitalName: hospital?.organization_name ?? "our partner hospital",
    therapistName: therapist?.full_name ?? null,
  });
}
