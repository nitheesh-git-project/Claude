import { NextRequest, NextResponse } from "next/server";
import { getAdminContextResult } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";
import { issueSetPasswordLink, unknowablePassword } from "@/lib/accessLink";

// The fourth of these, and the one that did not exist.
//
// Patients, therapists and hospitals could all have a password re-issued from
// the back office; a back-office account could not. So User Access could say
// "Signing in with their own password" -- correct, and a dead end: the comment
// on `IssuedPassword` says the lane for an account in that state is a reset,
// and there was no reset. Closing the door on a colleague who had locked
// themselves out meant going into Supabase.
//
// Two things differ from its three siblings, and both are about who the target
// is. It is `full` scope only, checked directly rather than through
// `requireAdminScope("people")` -- re-issuing a *back-office* credential hands
// somebody a way into the whole back office, and every desk that manages People
// can reset a patient. And it carries suspension's own guard: never yourself,
// because an admin who resets their own password is one whose next sign-in uses
// a string on a screen they are about to leave, and the honest lane for that is
// the emailed reset on Sign-in & Security.
export async function POST(request: NextRequest) {
  const guard = await getAdminContextResult();
  if (!guard.ok) {
    if (guard.reason === "unauthenticated") {
      return NextResponse.json(
        { error: "Your session has expired. Sign in again and retry.", retryable: true },
        { status: 401 }
      );
    }
    if (guard.reason === "unavailable") {
      return NextResponse.json(
        { error: "Could not check your access just now. Please try again.", retryable: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const context = guard.context;
  if (context.scope !== "full") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{ adminId?: string }>(request);
  if (parseError) return parseError;
  const adminId = body.adminId?.trim();
  if (!adminId) {
    return NextResponse.json({ error: "Missing adminId" }, { status: 400 });
  }
  if (adminId === context.id) {
    return NextResponse.json(
      {
        error:
          "You can't reset your own password here. Use Settings -> Sign-in & Security to email yourself a reset.",
      },
      { status: 409 }
    );
  }

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("id, email")
    .eq("id", adminId)
    .eq("role", "admin")
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "That account is not a back-office account" }, { status: 400 });
  }

  // A password nobody knows: the reset still locks out whoever holds the
  // current one, and the person sets their own through the one-time link
  // below. Nothing is stored or shown -- see src/lib/accessLink.ts.
  const password = unknowablePassword();
  const { error } = await admin.auth.admin.updateUserById(adminId, { password });
  if (error) {
    return serverError("admin/reset-admin-password", error);
  }

  // Any plaintext an older version of this route left behind is cleared:
  // it is a credential for the password just replaced.
  await admin.from("admin_account_notes").update({ temp_password: null }).eq("admin_id", adminId);

  const link = await issueSetPasswordLink(admin, target.email);
  if (!link.ok) {
    return serverError("admin/reset-admin-password", link.error, {
      message:
        "The old password was cleared, but a sign-in link could not be made. Press the button again to issue one.",
    });
  }

  // Never the password itself: this log is readable by every admin, and a live
  // back-office credential in it would be the widest of the four.
  await recordAdminActivity(admin, context.id, {
    action: "account.reset_password",
    targetId: adminId,
    details: { role: "admin" },
  });

  return NextResponse.json({ email: target.email, linkPath: link.path });
}
