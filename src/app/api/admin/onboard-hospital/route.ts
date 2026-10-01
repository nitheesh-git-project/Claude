import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";
import { issueSetPasswordLink, unknowablePassword } from "@/lib/accessLink";

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
  // No password for the partner is generated, stored or shown -- they set
  // their own through the one-time link below (src/lib/accessLink.ts).
  const password = unknowablePassword();
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
    // Release the account so the onboarding can be retried.
    //
    // Without this the failure is a dead end rather than an error: GoTrue has
    // created the user, `handle_new_user` has given it a **patient** profile
    // (the trigger deliberately ignores a `hospital` role from metadata), and
    // this update is what promotes it. So a failure here leaves an unusable
    // patient account sitting on the partner's email address -- and the next
    // attempt fails with "already registered", with nothing on screen saying
    // why or what to do about it.
    //
    // Safe to delete: the account is seconds old and nothing can point at it
    // yet. This is exactly the "no history at all" case `delete-account` is
    // narrow for, which is why it needs none of that route's blocker counting.
    const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
    if (cleanupError) {
      // Now it genuinely is stuck, and saying so is better than a generic
      // 500: somebody has to remove that account by hand before the email can
      // be used again.
      console.error(
        "Could not release a half-provisioned partner account",
        created.user.id,
        cleanupError
      );
      return serverError("admin/onboard-hospital (stranded)", updateError, {
        message:
          "The partner account was created but could not be set up, and could not be removed either. That email cannot be onboarded again until the account is deleted - please pass this reference on.",
      });
    }

    return serverError("admin/onboard-hospital", updateError, {
      message:
        "The partner could not be set up, so nothing has been created. Please try again.",
    });
  }

  if (leadId) {
    await admin.from("b2b_leads").update({ status: "onboarded" }).eq("id", leadId);
  }

  // The partner's way in: a one-time link to set their own password,
  // handed over by the admin. Best-effort: the partner exists either way,
  // and a lost or failed link is replaced from the Partners card (Send
  // sign-in link) rather than by failing the onboarding.
  const link = await issueSetPasswordLink(admin, email);
  if (!link.ok) {
    console.error("onboard-hospital: sign-in link not issued", link.error);
  }

  // Same rule as the password-reset routes: the generated credential never
  // reaches the log, only the fact that this admin provisioned the partner.
  await recordAdminActivity(admin, adminUser.id, {
    action: "hospital.onboard",
    targetId: created.user.id,
    targetLabel: organizationName,
    details: { referralCode, leadId: leadId ?? null },
  });

  return NextResponse.json({
    email,
    referralCode,
    linkPath: link.ok ? link.path : null,
    ...(link.ok
      ? {}
      : { warning: "The partner was created, but a sign-in link could not be made. Send one from their card." }),
  });
}
