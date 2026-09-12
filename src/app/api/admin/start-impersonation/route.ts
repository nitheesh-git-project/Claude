import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminContext } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import {
  ADMIN_RESTORE_COOKIE,
  IMPERSONATION_COOKIE,
  IMPERSONATION_TTL_MS,
  START_REFUSAL_MESSAGE,
  dashboardPathFor,
  refuseImpersonation,
  type ImpersonatableRole,
  type ImpersonationMarker,
} from "@/lib/impersonation";

// Signs the admin's browser in as somebody else.
//
// The most dangerous route in this codebase, and the only one that hands out
// another account's session. Everything done during the window is written as
// that user -- there is no column anywhere that can say an admin was at the
// keyboard -- so the whole safety of the feature is this route's gates and
// the record it writes. The gates themselves are in src/lib/impersonation.ts
// so they are unit-tested rather than only clicked:
//
//   * `full` scope only, checked here rather than through
//     requireAdminScope(section) -- a section scope would hand this to
//     whoever can edit a phone number.
//   * Never another admin, never a suspended account, never yourself.
//   * A real reason, stored on a row the admin cannot rewrite.
//   * A thirty-minute window, ended by the proxy when it passes.
//
// The admin's own session is parked in a second httpOnly cookie so Exit puts
// them back where they were. Losing that cookie costs a re-login and nothing
// else, which is the right direction for a failure here.

type Body = { userId?: string; reason?: string };

export async function POST(request: NextRequest) {
  const context = await getAdminContext();
  if (!context) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = await parseJsonBody<Body>(request);
  if (parsed.error) return parsed.error;

  const userId = typeof parsed.data.userId === "string" ? parsed.data.userId : "";
  const reason = typeof parsed.data.reason === "string" ? parsed.data.reason : "";

  const admin = createAdminClient();

  // Read the target with the service role: the scope check above is the
  // authorization, and an admin reading a profile row is something the back
  // office already does on every People screen.
  const { data: target } = userId
    ? await admin
        .from("profiles")
        .select("id, role, active, full_name, email")
        .eq("id", userId)
        .maybeSingle()
    : { data: null };

  const refusal = refuseImpersonation({
    adminId: context.id,
    adminScope: context.scope,
    reason,
    target: target
      ? { id: target.id, role: target.role, active: target.active }
      : null,
  });
  if (refusal) {
    return NextResponse.json(
      { error: START_REFUSAL_MESSAGE[refusal] },
      // A scope refusal is 403; everything else is the request being wrong.
      { status: refusal === "not_master_admin" ? 403 : 400 }
    );
  }

  const targetRole = target!.role as ImpersonatableRole;
  const targetEmail = target!.email as string | null;
  if (!targetEmail) {
    return NextResponse.json(
      { error: "That account has no email address to sign in with." },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Park the admin's own session before anything replaces it. Read first and
  // fail here rather than after the swap: an admin stranded in somebody
  // else's account with no way back is a worse outcome than a refusal.
  const {
    data: { session: adminSession },
  } = await supabase.auth.getSession();
  if (!adminSession?.refresh_token) {
    return NextResponse.json(
      { error: "Could not save your own session. Sign in again and retry." },
      { status: 409 }
    );
  }

  // A magic link generated but never sent: generateLink returns the token
  // rather than emailing it, which is what lets this be a swap the admin
  // performs rather than a link the target receives.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: targetEmail,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    return NextResponse.json(
      { error: "Could not open that account's session. Try again." },
      { status: 502 }
    );
  }

  const expiresAt = Date.now() + IMPERSONATION_TTL_MS;

  // Recorded before the swap, so a session that is somehow established
  // without a row behind it cannot exist. The row is the only durable trace:
  // the audit log says an admin started, and this says how long the window
  // ran, which is what a later reader intersects an action against.
  const { data: sessionRow, error: rowError } = await admin
    .from("admin_impersonation_sessions")
    .insert({
      admin_id: context.id,
      target_id: target!.id,
      target_role: targetRole,
      reason: reason.trim(),
      expires_at: new Date(expiresAt).toISOString(),
    })
    .select("id")
    .single();

  if (rowError || !sessionRow) {
    // Same posture as /api/therapist/reveal-contact and the care-plan
    // reviews, and the opposite of the audit log's: an impersonation nobody
    // can trace to a person is the one outcome this route must not produce.
    return NextResponse.json(
      { error: "Could not record this. Nothing was opened." },
      { status: 500 }
    );
  }

  const { error: swapError } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: tokenHash,
  });
  if (swapError) {
    await admin
      .from("admin_impersonation_sessions")
      .update({ ended_at: new Date().toISOString(), ended_reason: "admin_exited" })
      .eq("id", sessionRow.id);
    return NextResponse.json(
      { error: "Could not open that account's session. Try again." },
      { status: 502 }
    );
  }

  const marker: ImpersonationMarker = {
    sessionId: sessionRow.id,
    adminId: context.id,
    targetId: target!.id,
    targetRole,
    targetName: (target!.full_name as string | null) ?? "this user",
    expiresAt,
  };

  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  jar.set(ADMIN_RESTORE_COOKIE, adminSession.refresh_token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: Math.floor(IMPERSONATION_TTL_MS / 1000),
  });
  jar.set(IMPERSONATION_COOKIE, JSON.stringify(marker), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: Math.floor(IMPERSONATION_TTL_MS / 1000),
  });

  await recordAdminActivity(admin, context.id, {
    action: "impersonation.start",
    targetId: target!.id,
    targetLabel: (target!.full_name as string | null) ?? targetEmail,
    // The reason is the point of the log entry. No session tokens ever go in
    // here -- the log is readable by every admin.
    details: { role: targetRole, reason: reason.trim(), minutes: IMPERSONATION_TTL_MS / 60_000 },
  });

  return NextResponse.json({ ok: true, redirectTo: dashboardPathFor(targetRole) });
}
