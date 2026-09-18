import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { revokeAllSessions, SESSION_REVOKE_WARNING } from "@/lib/supabase/revokeSessions";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    patientId?: string;
    active?: boolean;
  }>(request);
  if (parseError) return parseError;
  const { patientId, active } = body;
  if (!patientId || typeof active !== "boolean") {
    return NextResponse.json(
      { error: "Missing patientId or active" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("profiles")
    .update({ active })
    .eq("id", patientId)
    .eq("role", "patient")
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  // Suspending writes `active = false`, which src/proxy.ts and
  // requireActiveProfile both refuse on -- but those are this app, and a
  // session cookie reaches PostgREST without passing either. An account
  // that has been suspended must not still be signed in anywhere.
  let sessionsRevoked = true;
  if (!active) {
    const revoke = await revokeAllSessions(admin, patientId);
    sessionsRevoked = revoke.revoked;
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "account.set_active",
    targetId: patientId,
    details: { role: "patient", active, sessionsRevoked },
  });

  return NextResponse.json({
    success: true,
    active,
    ...(sessionsRevoked ? {} : { warning: SESSION_REVOKE_WARNING }),
  });
}
