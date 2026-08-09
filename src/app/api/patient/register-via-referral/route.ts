import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";

export async function POST(request: NextRequest) {
  const { token, fullName, email, password } = await request.json();
  if (!token || !fullName || !email || !password) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Atomically claim the referral by flipping its status in the same
  // statement that checks it's still "invite_sent" — the update's WHERE
  // clause is evaluated and applied under a row lock in Postgres, so if
  // the same link is submitted twice at once (e.g. opened in two tabs),
  // only one request can win this update; the other gets 0 rows back
  // here instead of both racing past a separate SELECT check and each
  // creating their own account/appointment for the same referral.
  const { data: referral, error: claimError } = await admin
    .from("patient_referrals")
    .update({ status: "converted" })
    .eq("invite_token", token)
    .eq("status", "invite_sent")
    .select(
      "id, hospital_id, assigned_therapist_id, assigned_slot_time, medical_issue, treatment_needed"
    )
    .maybeSingle();

  if (claimError || !referral) {
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
    // Account creation failed after the claim — release it so the same
    // link can be retried instead of being permanently burned.
    await admin
      .from("patient_referrals")
      .update({ status: "invite_sent" })
      .eq("id", referral.id);
    return NextResponse.json(
      { error: createError?.message ?? "Could not create account" },
      { status: 500 }
    );
  }

  // approved: true is set here because self-serve patient signups now start
  // unapproved and wait on the admin (same gate therapist applications go
  // through). A hospital-referred patient has already been vetted by the
  // admin — they assigned the therapist and issued this invite link — so
  // making them wait again would strand a patient who is about to pay for a
  // session that's already scheduled.
  const { error: attributionError } = await admin
    .from("profiles")
    .update({ referred_by_hospital_id: referral.hospital_id, approved: true })
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
      duration_minutes: BASE_DURATION_MINUTES,
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
    .update({ converted_patient_id: created.user.id })
    .eq("id", referral.id);
  if (referralUpdateError) {
    console.error("Failed to record converted_patient_id", referral.id, referralUpdateError);
  }

  return NextResponse.json({
    success: true,
    appointmentId: appointment.id,
    concern: referral.medical_issue,
  });
}
