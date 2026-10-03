import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { GATED_PROFILE_FIELDS } from "@/lib/gatedProfileFields";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";
import { validateProfileChanges } from "@/lib/profileChangeValidation";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    requestId?: string;
  }>(request);
  if (parseError) return parseError;
  const { requestId } = body;
  if (!requestId) {
    return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: changeRequest, error: readError } = await admin
    .from("profile_change_requests")
    .select("id, user_id, changes, status")
    .eq("id", requestId)
    .maybeSingle();
  if (readError) return serverError("admin/approve-profile-change", readError);

  if (!changeRequest) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (changeRequest.status !== "pending") {
    return NextResponse.json(
      { error: "This request has already been reviewed" },
      { status: 400 }
    );
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", changeRequest.user_id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Never trust that "changes" only contains fields this role is actually
  // allowed to request - validate against the server-side allowlist before
  // writing anything, in case a request was ever crafted or tampered with.
  const allowedFields = GATED_PROFILE_FIELDS[profile.role] ?? [];
  const changes = changeRequest.changes as Record<string, unknown>;
  const requestedFields = Object.keys(changes);
  const invalidFields = requestedFields.filter((f) => !allowedFields.includes(f));
  if (requestedFields.length === 0 || invalidFields.length > 0) {
    return NextResponse.json(
      { error: "This request contains fields that can't be applied." },
      { status: 400 }
    );
  }

  // The values too, not only the field names: a request is written by the
  // person it describes, through their own token, so its values are
  // whatever they sent. See profileChangeValidation.ts.
  const verdict = validateProfileChanges(changes);
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.error }, { status: 400 });
  }

  // Claim the request FIRST, then apply it. The old order -- apply, then
  // mark approved -- left a change live while the request sat in the queue
  // whenever the second write failed, so a second admin could approve it
  // again. Claimed on `status = 'pending'`, so two admins cannot both
  // approve; if applying then fails, the claim is released.
  const reviewedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await admin
    .from("profile_change_requests")
    .update({ status: "approved", reviewed_by: adminUser.id, reviewed_at: reviewedAt })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (claimError) {
    return serverError("admin/approve-profile-change", claimError);
  }
  if (!claimed) {
    return NextResponse.json({ error: "This request has already been reviewed" }, { status: 409 });
  }

  const releaseClaim = () =>
    admin
      .from("profile_change_requests")
      .update({ status: "pending", reviewed_by: null, reviewed_at: null })
      .eq("id", requestId)
      .eq("status", "approved")
      .eq("reviewed_at", reviewedAt);

  // An email change moves the sign-in first: a profile reading the new
  // address while the account still signs in with the old one would be the
  // two disagreeing about who this is. If the profile write then fails, the
  // sign-in is moved back.
  const newEmail = typeof verdict.values.email === "string" ? verdict.values.email : null;
  let previousEmail: string | null = null;
  if (newEmail) {
    const { data: authUser, error: authReadError } = await admin.auth.admin.getUserById(changeRequest.user_id);
    if (authReadError || !authUser.user) {
      await releaseClaim();
      return serverError("admin/approve-profile-change", authReadError ?? "auth user missing", {
        message: "Could not read this account's sign-in. The request is still waiting -- please try again.",
      });
    }
    previousEmail = authUser.user.email ?? null;
    const { error: authError } = await admin.auth.admin.updateUserById(changeRequest.user_id, {
      email: newEmail,
      email_confirm: true,
    });
    if (authError) {
      await releaseClaim();
      const taken = /already|registered|exists/i.test(authError.message);
      return NextResponse.json(
        {
          error: taken
            ? "Another account already uses that email address, so this change can't be approved."
            : "Could not move this account's sign-in to the new email. The request is still waiting -- please try again.",
        },
        { status: taken ? 409 : 503 }
      );
    }
  }

  const { data: applied, error: applyError } = await admin
    .from("profiles")
    .update(verdict.values)
    .eq("id", changeRequest.user_id)
    .select("id")
    .maybeSingle();
  if (applyError || !applied) {
    if (newEmail && previousEmail) {
      const { error: revertError } = await admin.auth.admin.updateUserById(changeRequest.user_id, {
        email: previousEmail,
        email_confirm: true,
      });
      if (revertError) {
        console.error("approve-profile-change: could not restore the previous sign-in email", changeRequest.user_id, revertError.message);
      }
    }
    await releaseClaim();
    return serverError("admin/approve-profile-change", applyError ?? "profile row not updated", {
      message: "Could not apply this change. The request is still waiting -- please try again.",
    });
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "profile_change.approve",
    targetId: requestId,
    details: { userId: changeRequest.user_id },
  });

  return NextResponse.json({ success: true });
}
