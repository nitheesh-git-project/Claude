import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const { token, fullName, email, password } = await request.json();
  if (!token || !fullName || !email || !password) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: referral } = await admin
    .from("patient_referrals")
    .select(
      "id, hospital_id, assigned_therapist_id, assigned_slot_time, medical_issue, treatment_needed, status"
    )
    .eq("invite_token", token)
    .single();

  if (!referral || referral.status !== "invite_sent") {
    return NextResponse.json(
      { error: "This invite link is invalid or has already been used." },
      { status: 400 }
    );
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: "patient", full_name: fullName },
  });

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message ?? "Could not create account" },
      { status: 500 }
    );
  }

  const { error: attributionError } = await admin
    .from("profiles")
    .update({ referred_by_hospital_id: referral.hospital_id })
    .eq("id", created.user.id);
  if (attributionError) {
    // Not fatal to the patient's flow, but would silently break revenue
    // attribution for this hospital if it happened — worth knowing about.
    console.error("Failed to set referred_by_hospital_id for", created.user.id, attributionError);
  }

  // Left as "requested"/unpaid on purpose — the therapist and slot are
  // already arranged, but the session isn't confirmed until the patient
  // actually pays. Payment verification (see /api/razorpay/verify) flips
  // this to "confirmed" once payment_status is set to "paid".
  const { data: appointment, error: appointmentError } = await admin
    .from("appointments")
    .insert({
      patient_id: created.user.id,
      therapist_id: referral.assigned_therapist_id,
      slot_time: referral.assigned_slot_time,
      concern: referral.medical_issue,
      notes: referral.treatment_needed,
      status: "requested",
      referral_id: referral.id,
    })
    .select("id")
    .single();

  if (appointmentError || !appointment) {
    // The account was already created at this point, so don't leave the
    // patient stuck with no explanation — they can sign in and contact
    // support even though there's nothing to pay for yet.
    console.error("Failed to create appointment for referral", referral.id, appointmentError);
    return NextResponse.json(
      {
        error:
          "Your account was created, but we couldn't set up your booking. Please sign in and contact us.",
      },
      { status: 500 }
    );
  }

  const { error: referralUpdateError } = await admin
    .from("patient_referrals")
    .update({ status: "converted", converted_patient_id: created.user.id })
    .eq("id", referral.id);
  if (referralUpdateError) {
    console.error("Failed to mark referral converted", referral.id, referralUpdateError);
  }

  return NextResponse.json({
    success: true,
    appointmentId: appointment.id,
    concern: referral.medical_issue,
  });
}
