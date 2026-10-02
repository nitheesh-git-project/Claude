import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isValidStoredPhone } from "@/lib/phoneNumber";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import {
  describeProfileStanding,
  getProfileStanding,
} from "@/lib/supabase/requireActiveProfile";
import { readHomeVisitEnabled } from "@/lib/homeVisitFlag";
import {
  MIN_HOME_VISIT_ADDRESS_LENGTH,
  OPEN_REFERRAL_STATUSES,
  REFERRAL_LIMITS,
} from "@/lib/referralLimits";
import { lookupServiceArea } from "@/lib/serviceAreaServer";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";

/** Clinically relevant text is accepted whole or refused, never cut. */
function tooLong(value: string, max: number, label: string): NextResponse | null {
  return value.length > max
    ? NextResponse.json(
        { error: `${label} is too long (${value.length} characters; the limit is ${max}). Please shorten it.` },
        { status: 400 }
      )
    : null;
}

const VISIT_MODES = ["online", "home_visit"] as const;

/**
 * A partner hospital files a referral.
 *
 * This replaces a direct browser insert into `patient_referrals`, and the
 * reasons are the ones that put `/api/hospitals/inquiry` in front of
 * `b2b_leads`, plus one that is sharper here because these rows carry a
 * named patient and their medical issue:
 *
 * 1. **`patient_referrals_insert_own` checked `auth.uid() = hospital_id`
 *    and nothing else.** That is an ownership test, not a lifecycle one, so
 *    a hospital that had been suspended -- or one whose account had never
 *    been approved -- could keep filing referrals indefinitely, and the rows
 *    landed in the admin's queue looking exactly like a live partner's.
 *    Suspending a partner is meant to stop them sending patients; it did
 *    not, because nothing between the browser and the table asked.
 * 2. **Every rule was in the form's own JavaScript.** The pincode regex,
 *    the phone check, the "home visit needs a pincode" pairing and the
 *    home-visit master switch were all client-side, so a session cookie and
 *    a direct POST bypassed all four -- including the switch, which meant a
 *    home-visit referral could be filed against a service the clinic had
 *    turned off, and nothing downstream would catch it until an admin tried
 *    to staff it.
 * 3. **There was no door to put a rate limit on.** Same sentence as the
 *    inquiry route: a browser insert has no server-side handler, so the
 *    table was unbounded and nothing in this deployment sweeps it.
 *
 * The policy and the insert grant are dropped at the end of `schema.sql`,
 * the same move `appointments_insert_own` and `b2b_leads_insert_public` got.
 */
export async function POST(request: NextRequest) {
  // Who is asking, before anything they sent is read.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Role, suspension and approval in one named check. A referral is the one
  // thing a partner account exists to do, so this is the gate that makes
  // suspending one mean anything.
  const standing = await getProfileStanding(user.id, "hospital");
  if (!standing.ok) {
    const { status, error } = describeProfileStanding(standing.reason);
    return NextResponse.json({ error }, { status });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    patientName?: string;
    patientPhone?: string;
    address?: string;
    preferredLanguage?: string;
    medicalIssue?: string;
    treatmentNeeded?: string;
    visitMode?: string;
    pincode?: string;
  }>(request);
  if (parseError) return parseError;

  const patientName = typeof body.patientName === "string" ? body.patientName.trim() : "";
  if (!patientName) {
    return NextResponse.json(
      { error: "Enter the patient's full name." },
      { status: 400 }
    );
  }

  // Required, because the clinic phones this patient before sending a
  // registration link -- a referral with no reachable number is one the
  // admin has to go back to the hospital for.
  const patientPhone = typeof body.patientPhone === "string" ? body.patientPhone.trim() : "";
  if (!isValidStoredPhone(patientPhone)) {
    return NextResponse.json(
      { error: "Enter the patient's phone number so our team can reach them." },
      { status: 400 }
    );
  }

  const medicalIssue = typeof body.medicalIssue === "string" ? body.medicalIssue.trim() : "";
  if (!medicalIssue) {
    return NextResponse.json(
      { error: "Describe the patient's medical issue." },
      { status: 400 }
    );
  }

  // CHECKed on the column, so an unknown value would be a Postgres 500
  // rather than a sentence the hospital can act on.
  const visitMode = typeof body.visitMode === "string" ? body.visitMode : "online";
  if (!VISIT_MODES.includes(visitMode as (typeof VISIT_MODES)[number])) {
    return NextResponse.json({ error: "Choose how the patient is seen." }, { status: 400 });
  }

  let pincode: string | null = null;
  if (visitMode === "home_visit") {
    // Re-derived rather than trusted: the form hides the option when home
    // visits are off, and hiding a control is presentation. A referral for
    // a service the clinic has withdrawn reaches an admin who cannot staff
    // it and a patient who was told somebody is coming.
    if (!(await readHomeVisitEnabled())) {
      return NextResponse.json(
        {
          error:
            "Home visits aren't being offered at the moment. Please refer this patient for an online session.",
        },
        { status: 409 }
      );
    }
    const raw = typeof body.pincode === "string" ? body.pincode.trim() : "";
    if (!/^[1-9]\d{5}$/.test(raw)) {
      return NextResponse.json(
        { error: "Enter the patient's 6-digit pincode for a home visit referral." },
        { status: 400 }
      );
    }
    pincode = raw;
  }

  const address = typeof body.address === "string" ? body.address.trim() : "";
  const preferredLanguageRaw =
    typeof body.preferredLanguage === "string" ? body.preferredLanguage.trim() : "";
  const treatmentNeeded =
    typeof body.treatmentNeeded === "string" ? body.treatmentNeeded.trim() : "";

  const lengthRefusal =
    tooLong(patientName, REFERRAL_LIMITS.patientName, "The patient's name") ??
    tooLong(address, REFERRAL_LIMITS.address, "The address") ??
    tooLong(medicalIssue, REFERRAL_LIMITS.medicalIssue, "The medical issue") ??
    tooLong(treatmentNeeded, REFERRAL_LIMITS.treatmentNeeded, "Treatment needed");
  if (lengthRefusal) return lengthRefusal;

  const admin = createAdminClient();

  // Only a language the clinic actually books in. Any string used to be
  // stored, so a referral could ask for a language no therapist or booking
  // workflow supports.
  let preferredLanguage: string | null = null;
  if (preferredLanguageRaw) {
    const { data: settingsRow } = await admin.from("site_settings").select(SITE_SETTINGS_SELECT).maybeSingle();
    const offered = parseAdminSettings(settingsRow).bookingLanguages;
    const match = offered.find((l) => l.toLowerCase() === preferredLanguageRaw.toLowerCase());
    if (!match) {
      return NextResponse.json(
        { error: `Choose one of the languages we offer: ${offered.join(", ")}.` },
        { status: 400 }
      );
    }
    preferredLanguage = match;
  }

  if (visitMode === "home_visit") {
    // A therapist needs somewhere to go. A pincode alone used to be enough,
    // and conversion then booked the visit at "Address on file with
    // referring hospital".
    if (address.length < MIN_HOME_VISIT_ADDRESS_LENGTH) {
      return NextResponse.json(
        { error: "Enter the patient's full address for a home visit referral." },
        { status: 400 }
      );
    }
    // And somewhere the clinic goes. The format alone used to be checked.
    const lookup = await lookupServiceArea(admin, pincode as string);
    if (!lookup.ok) {
      return NextResponse.json(
        { error: "We couldn't check that pincode just now. Please try again." },
        { status: 503 }
      );
    }
    if (!lookup.area) {
      return NextResponse.json(
        {
          error:
            "We don't visit that pincode yet. Please refer this patient for an online session instead.",
        },
        { status: 409 }
      );
    }
  }

  // One open referral per patient per partner. A second for the same phone
  // number while the first is still with the clinic meant duplicate calls,
  // duplicate therapist assignments and two registration links.
  const { data: open, error: openError } = await admin
    .from("patient_referrals")
    .select("id")
    .eq("hospital_id", user.id)
    .eq("patient_phone", patientPhone)
    .in("status", [...OPEN_REFERRAL_STATUSES])
    .limit(1);
  if (openError) {
    return NextResponse.json(
      { error: "We couldn't check your existing referrals just now. Please try again." },
      { status: 503 }
    );
  }
  if ((open ?? []).length > 0) {
    return NextResponse.json(
      {
        error:
          "You've already referred this patient and the clinic is still working on it. You can follow it under Your Referrals.",
      },
      { status: 409 }
    );
  }

  // Counted after the shape is checked, per the ordering rule: the limiter
  // costs a round trip where the checks above cost a trim and a regex, and
  // a hospital correcting a typo must not spend an allowance meant for
  // abuse. Keyed on the account rather than the address -- a hospital
  // network behind one egress IP would otherwise have its clinics spending
  // each other's allowance.
  const limited = await enforceRateLimit(request, "referralSubmit", {
    identifier: user.id,
  });
  if (limited) return limited;

  // Service role for the insert: `hospital_id` is taken from the session
  // rather than the body, so there is nothing a caller could point at
  // somebody else's account.
  const { error } = await admin.from("patient_referrals").insert({
    hospital_id: user.id,
    patient_name: patientName,
    patient_phone: patientPhone,
    address: address || null,
    preferred_language: preferredLanguage,
    medical_issue: medicalIssue,
    treatment_needed: treatmentNeeded || null,
    visit_mode: visitMode,
    pincode,
  });

  if (error) {
    console.error("Could not record a patient referral", error.message);
    return NextResponse.json(
      { error: "Could not submit the referral. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
