import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const { leadId, email, organizationName, fullName, revenueSharePercent } =
    await request.json();
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

  // role is set here, not trusted from signUp's user_metadata — the
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
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (leadId) {
    await admin.from("b2b_leads").update({ status: "onboarded" }).eq("id", leadId);
  }

  return NextResponse.json({ email, password, referralCode });
}
