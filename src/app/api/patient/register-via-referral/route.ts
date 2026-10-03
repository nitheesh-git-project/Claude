import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";
import { lookupServiceArea } from "@/lib/serviceAreaServer";
import { MIN_HOME_VISIT_ADDRESS_LENGTH } from "@/lib/referralLimits";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { parseJsonBody } from "@/lib/parseJsonBody";

export async function POST(request: NextRequest) {
  // Counted before the body is parsed, so a refused caller never gets
  // to drive this route's work.
  const limited = await enforceRateLimit(request, "registration");
  if (limited) return limited;

  const { data: body, error: parseError } = await parseJsonBody<{
    token?: string;
    fullName?: string;
    email?: string;
    password?: string;
  }>(request);
  if (parseError) return parseError;
  const { token, fullName, email, password } = body;
  if (!token || !fullName || !email || !password) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Everything that can refuse this conversion is checked BEFORE anything
  // is written. The referral used to be marked converted first and the
  // area looked up last -- so an unserviceable pincode, or a failed read,
  // booked a home visit at zero travel and no area, and a later failure
  // left the referral converted with no session behind it and its link
  // burned for good.
  const { data: preview, error: previewError } = await admin
    .from("patient_referrals")
    .select("id, visit_mode, address, pincode")
    .eq("invite_token", token)
    .eq("status", "invite_sent")
    .maybeSingle();
  if (previewError) {
    return NextResponse.json(
      { error: "We couldn't check this invite just now. Please try again." },
      { status: 503 }
    );
  }
  if (!preview) {
    return NextResponse.json(
      { error: "This invite link is invalid or has already been used." },
      { status: 400 }
    );
  }

  const isHomeVisit = preview.visit_mode === "home_visit";
  let travelFeePaise = 0;
  let areaId: string | null = null;
  if (isHomeVisit) {
    // A therapist needs a real address, and the clinic has to serve it.
    // Neither is waved through with a placeholder or a zero travel fee.
    const address = (preview.address ?? "").trim();
    if (address.length < MIN_HOME_VISIT_ADDRESS_LENGTH || !preview.pincode) {
      return NextResponse.json(
        {
          error:
            "We need the full home address for this visit before you can register. Please contact the clinic and we'll sort it out.",
        },
        { status: 409 }
      );
    }
    const lookup = await lookupServiceArea(admin, preview.pincode);
    if (!lookup.ok) {
      return NextResponse.json(
        { error: "We couldn't check your area just now. Please try again." },
        { status: 503 }
      );
    }
    if (!lookup.area) {
      return NextResponse.json(
        {
          error:
            "We don't visit that area at the moment. Please contact the clinic -- we can arrange an online session instead.",
        },
        { status: 409 }
      );
    }
    travelFeePaise = lookup.area.travel_fee_paise ?? 0;
    areaId = lookup.area.id;
  }

  // Atomically claim the referral by flipping its status in the same
  // statement that checks it's still "invite_sent" -- if the same link is
  // submitted twice at once (two tabs), only one request wins and the
  // other gets 0 rows back instead of both creating an account.
  const { data: referral, error: claimError } = await admin
    .from("patient_referrals")
    .update({ status: "converted" })
    .eq("invite_token", token)
    .eq("status", "invite_sent")
    .select(
      "id, hospital_id, assigned_therapist_id, assigned_slot_time, medical_issue, treatment_needed, visit_mode, address, pincode"
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
    // Account creation failed after the claim - release it so the same
    // link can be retried instead of being permanently burned.
    await releaseReferral(admin, referral.id);
    return NextResponse.json(
      { error: createError?.message ?? "Could not create account" },
      { status: 500 }
    );
  }
  const patientId = created.user.id;

  // From here every step the referral depends on either lands or the whole
  // conversion is undone: the account just created is removed and the link
  // works again. A converted referral with no patient linked, no partner
  // attribution or no session is worse than a link the patient can retry --
  // it was invisible to the attribution check (which only looked at linked
  // rows) and earned the partner nothing, permanently.
  const undo = async (step: string, cause: unknown) => {
    console.error(`register-via-referral: ${step} failed; rolling back`, referral.id, cause);
    const { error: deleteError } = await admin.auth.admin.deleteUser(patientId);
    if (deleteError) {
      console.error("register-via-referral: could not remove the half-created account", patientId, deleteError.message);
    }
    await releaseReferral(admin, referral.id);
    return NextResponse.json(
      {
        error:
          "We couldn't finish setting up your account, so nothing was kept. Please open your invite link and try again.",
      },
      { status: 503 }
    );
  };

  // The durable link from the referral to the patient, written first: it is
  // what Settings -> System Health -> Partner attribution compares against.
  const linked = await withRetry(() =>
    admin.from("patient_referrals").update({ converted_patient_id: patientId }).eq("id", referral.id)
  );
  if (linked) return undo("recording converted_patient_id", linked);

  // approved: true because a hospital-referred patient has already been
  // vetted by the admin (they assigned the therapist and issued this link).
  // referred_by_hospital_id is what every commission figure reads, so it is
  // required, not best-effort.
  const attributed = await withRetry(() =>
    admin
      .from("profiles")
      .update({ referred_by_hospital_id: referral.hospital_id, approved: true })
      .eq("id", patientId)
  );
  if (attributed) return undo("partner attribution", attributed);

  // Left as "requested"/unpaid on purpose - the therapist and slot are
  // already arranged, but the session isn't confirmed until the patient
  // actually pays. Payment verification (see /api/razorpay/verify) flips
  // this to "confirmed" once payment_status is set to "paid". A home visit
  // carries its own snapshot of the address and travel fee.
  const { data: appointment, error: appointmentError } = await admin
    .from("appointments")
    .insert({
      patient_id: patientId,
      therapist_id: referral.assigned_therapist_id,
      slot_time: referral.assigned_slot_time,
      concern: referral.medical_issue,
      duration_minutes: BASE_DURATION_MINUTES,
      notes: referral.treatment_needed,
      status: "requested",
      referral_id: referral.id,
      ...(isHomeVisit
        ? {
            visit_mode: "home_visit",
            visit_address_line1: (referral.address ?? "").trim(),
            visit_pincode: referral.pincode,
            visit_area_id: areaId,
            travel_fee_paise: travelFeePaise,
          }
        : {}),
    })
    .select("id")
    .single();

  if (appointmentError || !appointment) {
    return undo("creating the appointment", appointmentError);
  }

  // Best-effort: gives the patient a starting entry in their own address
  // book so a future home-visit booking doesn't start from a blank form.
  // The appointment's own snapshot above governs this first visit.
  if (isHomeVisit && referral.address && referral.pincode) {
    const { error: addressError } = await admin.from("patient_addresses").insert({
      patient_id: patientId,
      line1: referral.address,
      pincode: referral.pincode,
      area_id: areaId,
      is_default: true,
    });
    if (addressError) {
      console.error("Failed to save address for referred patient", patientId, addressError);
    }
  }

  return NextResponse.json({
    success: true,
    appointmentId: appointment.id,
    concern: referral.medical_issue,
  });
}

/** Puts a claimed referral back so its link works again. */
async function releaseReferral(admin: ReturnType<typeof createAdminClient>, referralId: string) {
  const { error } = await admin
    .from("patient_referrals")
    .update({ status: "invite_sent", converted_patient_id: null })
    .eq("id", referralId)
    .eq("status", "converted");
  if (error) console.error("register-via-referral: could not release referral", referralId, error.message);
}

/** One write, tried twice. Returns the last error, or null when it landed. */
async function withRetry(
  write: () => PromiseLike<{ error: { message: string } | null }>
): Promise<{ message: string } | null> {
  let last: { message: string } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await write();
    if (!error) return null;
    last = error;
  }
  return last;
}
