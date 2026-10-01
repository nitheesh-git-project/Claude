import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMPERSONATION_COOKIE, parseMarker } from "@/lib/impersonation";
import { recordAdminActivity } from "@/lib/adminActivityLog";

/** API paths that already record their own impersonation row. */
const SELF_RECORDING = new Set(["/api/admin/start-impersonation", "/api/admin/stop-impersonation"]);

/** Whether this request is a change made inside an impersonation window. */
export function isImpersonatedWrite(method: string, path: string, hasMarker: boolean): boolean {
  if (!hasMarker) return false;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  if (!path.startsWith("/api/")) return false;
  return !SELF_RECORDING.has(path);
}

/**
 * Records, under the ADMIN's id, a change made while they were signed in as
 * somebody else.
 *
 * During an impersonation window the session is the target's, so every
 * route writes as the target and the activity log -- where it writes at
 * all -- names the patient as the actor. The start and end rows said a
 * window existed; nothing said what was done inside it. This runs from the
 * proxy, off the response path (`waitUntil`), for every non-GET API call
 * carrying the marker cookie.
 *
 * The cookie is a claim the browser holds, so it is checked against the
 * open `admin_impersonation_sessions` row before anything is written: a
 * forged or stale marker records nothing.
 */
export async function recordImpersonatedWrite(request: NextRequest): Promise<void> {
  const marker = parseMarker(request.cookies.get(IMPERSONATION_COOKIE)?.value);
  if (!marker) return;
  try {
    const admin = createAdminClient();
    const { data: session, error } = await admin
      .from("admin_impersonation_sessions")
      .select("id, admin_id, target_id, ended_at, expires_at")
      .eq("id", marker.sessionId)
      .maybeSingle();
    if (error || !session) return;
    if (session.admin_id !== marker.adminId || session.target_id !== marker.targetId) return;
    if (session.ended_at) return;
    if (session.expires_at && Date.parse(session.expires_at) <= Date.now()) return;

    await recordAdminActivity(admin, marker.adminId, {
      action: "impersonation.action",
      targetId: marker.targetId,
      targetLabel: marker.targetName,
      details: {
        method: request.method,
        path: request.nextUrl.pathname,
        sessionId: marker.sessionId,
        targetRole: marker.targetRole,
      },
    });
  } catch (err) {
    console.error("Could not record an impersonated write", err);
  }
}
