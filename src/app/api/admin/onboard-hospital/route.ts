import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

function generatePassword() {
  return crypto.randomBytes(9).toString("base64url");
}

function generateReferralCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { leadId, email, organizationName, fullName } = await request.json();
  if (!email || !organizationName || !fullName) {
    return NextResponse.json(
      { error: "Missing email, organizationName, or fullName" },
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

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      organization_name: organizationName,
      referral_code: referralCode,
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
