import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverError } from "@/lib/apiError";
import { REOPEN_REASON_MAX, REOPEN_REASON_MIN } from "@/lib/careGoals";

// An admin reopens a milestone that was marked reached by mistake.
//
// "Reached" is the one fact on a milestone, and the care_milestones_guard
// trigger refuses to clear it for every caller -- the service role this
// route writes with included. The one door is reopen_care_milestone()
// (supabase/schema.sql, phase 2a): in a single transaction it writes an
// append-only care_milestone_events row (the reached_at being withdrawn,
// the proving measurement, who, and why) and moves the milestone back to
// working or planned, and the trigger lets reached_at go only for an event
// written in that same transaction. So a reopening is never silent: it
// leaves that row and the audit entry below, and nothing else can do it.
//
// "people" scope, like the other admin writes to a patient's clinical
// record (/api/admin/neuro-assessments/submit). The reason is required, at
// least REOPEN_REASON_MIN characters, because it is read later by someone
// asking why a patient's milestone went backwards.
//
// Request:  { patientId: string, milestoneId: string, reason: string,
//             reopenTo?: "working" | "planned" }   (default "working")
// Response: 200 { success: true, eventId: string, previousReachedAt: string }
//           400 reason / reopenTo, 403 scope, 404 no such milestone,
//           409 { code: "not_reached" }, 503 the database is not updated
//           or could not be reached.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    patientId?: unknown;
    milestoneId?: unknown;
    reason?: unknown;
    reopenTo?: unknown;
  }>(request);
  if (parseError) return parseError;
  const patientId = typeof body.patientId === "string" ? body.patientId.trim() : "";
  const milestoneId = typeof body.milestoneId === "string" ? body.milestoneId.trim() : "";
  if (!patientId || !milestoneId) {
    return NextResponse.json({ error: "Missing patientId or milestoneId" }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.replace(/\s+/g, " ").trim() : "";
  if (reason.length < REOPEN_REASON_MIN) {
    return NextResponse.json(
      { error: `Say why this milestone is being reopened (at least ${REOPEN_REASON_MIN} characters).`, code: "reason_required" },
      { status: 400 }
    );
  }
  if (reason.length > REOPEN_REASON_MAX) {
    return NextResponse.json({ error: `Keep the reason to ${REOPEN_REASON_MAX} characters or fewer.` }, { status: 400 });
  }
  const reopenTo = body.reopenTo === undefined || body.reopenTo === null ? "working" : body.reopenTo;
  if (reopenTo !== "working" && reopenTo !== "planned") {
    return NextResponse.json({ error: "A reopened milestone goes back to working or planned." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reopen_care_milestone", {
    p_milestone_id: milestoneId,
    p_patient_id: patientId,
    p_actor_id: adminUser.id,
    p_reason: reason,
    p_reopen_to: reopenTo,
  });
  if (error) {
    // A malformed id names nothing.
    if (error.code === "22P02") return NextResponse.json({ error: "No such milestone for this patient." }, { status: 404 });
    // The function is new; a database that has not run schema.sql cannot
    // reopen anything, and saying so beats a 500.
    if (error.code === "42883" || error.code === "PGRST202") {
      return NextResponse.json(
        { error: "This database has not been updated yet, so reopening is switched off. Re-apply supabase/schema.sql, then try again." },
        { status: 503 }
      );
    }
    return serverError("admin/care-milestones/reopen", error);
  }

  const result = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    event_id?: string;
    previous_reached_at?: string;
    previous_measurement_id?: string | null;
  };
  if (!result.ok) {
    switch (result.reason) {
      case "not_found":
        return NextResponse.json({ error: "No such milestone for this patient." }, { status: 404 });
      case "not_reached":
        return NextResponse.json(
          { error: "This milestone is not marked reached, so there is nothing to reopen.", code: "not_reached" },
          { status: 409 }
        );
      case "bad_reason":
        return NextResponse.json(
          { error: `Say why this milestone is being reopened (at least ${REOPEN_REASON_MIN} characters).`, code: "reason_required" },
          { status: 400 }
        );
      case "not_admin":
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      default:
        return serverError("admin/care-milestones/reopen", new Error(`unexpected reopen result: ${JSON.stringify(result)}`));
    }
  }

  // Best-effort and after the write, per the audit-log rule. From and to,
  // so the entry reads as a change months later; the reason itself lives on
  // the event row, which the entry names.
  await recordAdminActivity(admin, adminUser.id, {
    action: "care_milestone.reopen",
    targetId: patientId,
    details: {
      milestoneId,
      eventId: result.event_id ?? null,
      from: { status: "reached", reachedAt: result.previous_reached_at ?? null, measurementId: result.previous_measurement_id ?? null },
      to: { status: reopenTo },
    },
  });

  return NextResponse.json({
    success: true,
    eventId: result.event_id ?? null,
    previousReachedAt: result.previous_reached_at ?? null,
  });
}
