import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverError } from "@/lib/apiError";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { readPayLaterEnabled } from "@/lib/payLaterSettingsServer";
import { normalizeTrustedCode, trustedCodeMatches } from "@/lib/trustedPatientCode";

// One answer for "no such code", "used", "cancelled" and "made for someone
// else": a patient probing codes learns nothing about which exist.
const NOT_FOR_YOU = "That code isn't valid for this account. Check it, or ask the clinic.";

/**
 * A patient redeems a trusted-patient code: the same pay-later grant an admin
 * makes on the profile (set-patient-pay-later), with the code's reason and
 * the admin who made it as the grantor. Only the account whose email or
 * phone the code was locked to; never a hospital-referred patient; refused
 * while pay later is off. The profile is written first and the code spent
 * second, and a code somebody else spent in between puts the profile back,
 * so a code is never spent on a grant that did not happen.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Your session has expired. Sign in again and retry." }, { status: 401 });

  const limited = await enforceRateLimit(request, "trustedCodeRedeem", { identifier: `user:${user.id}` });
  if (limited) return limited;

  const { data: body, error: parseError } = await parseJsonBody<{ code?: unknown }>(request);
  if (parseError) return parseError;
  const code = normalizeTrustedCode(body.code);
  if (!code) return NextResponse.json({ error: NOT_FOR_YOU }, { status: 400 });

  const admin = createAdminClient();
  if (!(await readPayLaterEnabled(admin))) return NextResponse.json({ error: NOT_FOR_YOU }, { status: 400 });

  const { data: patient, error: patientError } = await admin
    .from("profiles")
    .select("id, role, email, phone, active, pay_later_enabled, referred_by_hospital_id")
    .eq("id", user.id)
    .maybeSingle();
  if (patientError) return serverError("patient/redeem-trusted-code (profile)", patientError);
  if (!patient || patient.role !== "patient" || patient.active === false) {
    return NextResponse.json({ error: "Only an active patient account can use this code." }, { status: 403 });
  }

  const { data: row, error: codeError } = await admin
    .from("trusted_patient_codes")
    .select("id, code, reason, created_by, status, match_email, match_phone")
    .eq("code", code)
    .maybeSingle();
  if (codeError) return serverError("patient/redeem-trusted-code (code)", codeError);
  if (!row || row.status !== "active" || !trustedCodeMatches(row, { email: patient.email ?? user.email ?? null, phone: patient.phone })) {
    return NextResponse.json({ error: NOT_FOR_YOU }, { status: 400 });
  }
  if (patient.referred_by_hospital_id) {
    return NextResponse.json(
      {
        error:
          "Your account came through a partner hospital, so pay later isn't available on it. Please speak to the clinic.",
      },
      { status: 409 }
    );
  }
  if (patient.pay_later_enabled) {
    // Already on terms: the code is left unspent for the clinic to cancel.
    return NextResponse.json({ success: true, alreadyOnTerms: true });
  }

  const nowIso = new Date().toISOString();
  const { data: granted, error: grantError } = await admin
    .from("profiles")
    .update({
      pay_later_enabled: true,
      pay_later_reason: `Trusted-patient code ${row.code}: ${row.reason}`,
      pay_later_granted_by: row.created_by,
      pay_later_granted_at: nowIso,
      pay_later_code_id: row.id,
    })
    .eq("id", user.id)
    .eq("role", "patient")
    .eq("pay_later_enabled", false)
    .select("id")
    .maybeSingle();
  if (grantError) return serverError("patient/redeem-trusted-code (grant)", grantError);
  if (!granted) return NextResponse.json({ success: true, alreadyOnTerms: true });

  const { data: spent, error: spendError } = await admin
    .from("trusted_patient_codes")
    .update({ status: "redeemed", redeemed_by: user.id, redeemed_at: nowIso })
    .eq("id", row.id)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (spendError || !spent) {
    await admin
      .from("profiles")
      .update({ pay_later_enabled: false, pay_later_code_id: null })
      .eq("id", user.id)
      .eq("pay_later_code_id", row.id);
    if (spendError) return serverError("patient/redeem-trusted-code (spend)", spendError);
    return NextResponse.json({ error: NOT_FOR_YOU }, { status: 400 });
  }

  await recordAdminActivity(admin, user.id, {
    action: "trusted_code.redeem",
    targetId: row.id,
    targetLabel: row.code,
    details: { patientId: user.id },
  });
  return NextResponse.json({ success: true });
}
