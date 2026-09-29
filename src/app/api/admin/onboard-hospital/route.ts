import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";

function generatePassword() {
  return crypto.randomBytes(9).toString("base64url");
}

function generateReferralCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    leadId?: string;
    email?: string;
    organizationName?: string;
    fullName?: string;
    revenueSharePercent?: number;
  }>(request);
  if (parseError) return parseError;
  const { leadId, email, organizationName, fullName, revenueSharePercent } = body;
  if (!email || !organizationName || !fullName || revenueSharePercent === undefined) {
    return NextResponse.json(
      {
        error:
          "Missing email, organizationName, fullName, or revenueSharePercent",
      },
      { status: 400 }
    );
  }

  const sharePercent = Number(revenueSharePercent);
  if (Number.isNaN(sharePercent) || sharePercent < 0 || sharePercent > 100) {
    return NextResponse.json(
      { error: "Revenue share must be a number between 0 and 100" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const password = generatePassword();
  const referralCode = generateReferralCode();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: "hospital", full_name: fullName },
  });

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message ?? "Could not create account" },
      { status: 500 }
    );
  }

  // role is set here, not trusted from signUp's user_metadata - the
  // handle_new_user trigger deliberately ignores anything but 'therapist'
  // there (self-serve signups can't grant themselves 'hospital'), so this
  // service-role update is what actually promotes the new account.
  const { error: updateError } = await admin
    .from("profiles")
    .update({
      role: "hospital",
      organization_name: organizationName,
      referral_code: referralCode,
      revenue_share_percent: sharePercent,
      approved: true,
    })
    .eq("id", created.user.id);

  if (updateError) {
    return serverError("admin/onboard-hospital", updateError);
  }

  if (leadId) {
    await admin.from("b2b_leads").update({ status: "onboarded" }).eq("id", leadId);
  }

  // The credential outlives the screen that issued it.
  //
  // This route generated the password, returned it, and wrote it nowhere -- so
  // it lived only in `OnboardHospitalForm`'s React state, and the banner's own
  // "they won't be shown again" was literally true: one refresh, one navigation
  // or one realtime remount and it was gone for good. A freshly onboarded
  // partner then had no readable password anywhere, unlike a patient, a
  // therapist or a back-office admin, and the only way to help them sign in was
  // to reset a credential that had never been used.
  //
  // `hospital_admin_notes` exists for exactly this and was already read by the
  // Partners card -- it was only ever written by the reset route. Best-effort
  // and logged: an account that exists with an unstored password is recoverable
  // by a reset, where failing the whole onboarding over a note row is not.
  const { error: noteError } = await admin.from("hospital_admin_notes").upsert({
    hospital_id: created.user.id,
    temp_password: password,
    temp_password_set_at: new Date().toISOString(),
  });
  if (noteError) {
    console.error("onboard-hospital: temp password not persisted", noteError.message);
  }

  // Same rule as the password-reset routes: the generated credential never
  // reaches the log, only the fact that this admin provisioned the partner.
  await recordAdminActivity(admin, adminUser.id, {
    action: "hospital.onboard",
    targetId: created.user.id,
    targetLabel: organizationName,
    details: { referralCode, leadId: leadId ?? null },
  });

  return NextResponse.json({ email, password, referralCode });
}
