import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rateLimitServer";

// Public, unauthenticated lookup by invite token - lets the registration
// page validate the link and show the patient who referred them and what
// was arranged *before* they fill out the whole signup form, instead of
// only finding out it's invalid/expired after submitting.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  // Counted after the request's shape is checked, not before.
  //
  // This is the reverse of where a limiter usually goes, and the reason is
  // that the limiter is the expensive half: it costs a database round trip,
  // where the checks above it are a trim and a regex. Counting first meant
  // every malformed request bought a write, and made the app *less* able to
  // absorb junk than validating first does. It also meant a person
  // correcting a typo spent an allowance meant for abuse, and then met a
  // refusal written for somebody who had already succeeded.
  //
  // Nothing has been read or written at this point, so a refusal here still
  // costs a caller nothing beyond what they sent.
  const limited = await enforceRateLimit(request, "referralPreview");
  if (limited) return limited;

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
