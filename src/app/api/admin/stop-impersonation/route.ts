import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import {
  ADMIN_RESTORE_COOKIE,
  IMPERSONATION_COOKIE,
  parseMarker,
} from "@/lib/impersonation";

// Puts the admin back into their own account.
//
// Deliberately authorized by the marker cookie rather than by an admin
// check: the caller is signed in *as the patient* at this point, so
// getAdminContext() would refuse the very person entitled to call it. The
// marker is httpOnly and was written by the start route, and the worst a
// forged one can do is end the caller's own session.
//
// It clears both cookies whatever happens further down. A failure to restore
// the admin's own session must still leave the swap closed -- staying signed
// in as the patient is the one outcome worse than having to sign in again.

export async function POST() {
  const jar = await cookies();
  const marker = parseMarker(jar.get(IMPERSONATION_COOKIE)?.value);
  const restoreToken = jar.get(ADMIN_RESTORE_COOKIE)?.value;

  jar.delete(IMPERSONATION_COOKIE);
  jar.delete(ADMIN_RESTORE_COOKIE);

  if (!marker) {
    return NextResponse.json({ ok: true, redirectTo: "/admin/dashboard" });
  }

  const admin = createAdminClient();
  // `.is("ended_at", null)` because the row's own trigger refuses a second
  // close: two tabs both tapping Exit is one logical action, not an error to
  // show somebody.
  await admin
    .from("admin_impersonation_sessions")
    .update({ ended_at: new Date().toISOString(), ended_reason: "admin_exited" })
    .eq("id", marker.sessionId)
    .is("ended_at", null);

  await recordAdminActivity(admin, marker.adminId, {
    action: "impersonation.end",
    targetId: marker.targetId,
    targetLabel: marker.targetName,
    details: { role: marker.targetRole },
  });

  const supabase = await createClient();
  if (restoreToken) {
    // A refresh token exchanges for a fresh pair, written back through the
    // cookie adapter -- which is what puts the admin's own session in the
    // browser again.
    const { error } = await supabase.auth.setSession({
      access_token: "",
      refresh_token: restoreToken,
    });
    if (!error) {
      return NextResponse.json({ ok: true, redirectTo: "/admin/dashboard" });
    }
  }

  await supabase.auth.signOut();
  return NextResponse.json({
    ok: true,
    redirectTo: "/admin/login",
    note: "Your own session could not be restored — please sign in again.",
  });
}
