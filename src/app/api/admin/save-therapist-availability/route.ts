import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import {
  SCHEDULE_CONFLICT_MESSAGE,
  parseExpectedVersion,
  parseWeeklyScheduleBody,
} from "@/lib/availabilityRequest";
import { saveWeeklySchedule } from "@/lib/saveWeeklySchedule";
import { summarizeWorkingWeek, templateToWeekly } from "@/lib/availabilityRanges";

/**
 * The admin's door onto a therapist's weekly working hours -- the second
 * caller of saveWeeklySchedule, deliberately not a second implementation of
 * it. Before this existed an admin could only pin individual dates, so a
 * therapist who could not reach their own dashboard had no way to have
 * their regular hours corrected at all.
 *
 * Scoped to `sessions`, the section the Roster screen lives in, and audited:
 * a schedule change decides who the clinic can offer, so it belongs in the
 * same log as a reassignment.
 */
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("sessions");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    therapistId?: unknown;
    days?: unknown;
    expectedVersion?: unknown;
  }>(request);
  if (parseError) return parseError;

  const therapistId = typeof body.therapistId === "string" ? body.therapistId : null;
  if (!therapistId) {
    return NextResponse.json({ error: "Missing therapistId" }, { status: 400 });
  }

  const parsed = parseWeeklyScheduleBody(body.days);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const version = parseExpectedVersion(body.expectedVersion);
  if ("error" in version) {
    return NextResponse.json({ error: version.error }, { status: 400 });
  }

  const admin = createAdminClient();
  // A real id belonging to a non-therapist would otherwise pass on the FK
  // alone -- the same hole set-availability-override was fixed for.
  const { data: therapist } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("id", therapistId)
    .eq("role", "therapist")
    .maybeSingle();
  if (!therapist) {
    return NextResponse.json({ error: "Therapist not found" }, { status: 404 });
  }

  // What the hours were before, for the audit row -- read before the write,
  // since the write replaces them.
  const { data: previousRows } = await admin
    .from("therapist_availability_template")
    .select("day_of_week, hour")
    .eq("therapist_id", therapistId);

  const result = await saveWeeklySchedule(admin, {
    therapistId,
    slots: parsed.slots,
    expectedVersion: version.version,
    actorId: adminUser.id,
  });

  if (result.status === "error") {
    return NextResponse.json({ error: result.message }, { status: 500 });
  }
  if (result.status === "conflict") {
    return NextResponse.json(
      { error: SCHEDULE_CONFLICT_MESSAGE, version: result.version },
      { status: 409 }
    );
  }

  if (result.status === "ok") {
    const describe = (rows: { day_of_week: number; hour: number }[]) =>
      summarizeWorkingWeek(templateToWeekly(rows))
        .map((line) => `${line.days} ${line.hours}`)
        .join("; ") || "No working hours";
    await recordAdminActivity(admin, adminUser.id, {
      action: "therapist.set_weekly_schedule",
      targetId: therapistId,
      targetLabel: therapist.full_name ?? "Therapist",
      details: {
        before: describe(previousRows ?? []),
        after: describe(parsed.slots),
      },
    });
  }

  return NextResponse.json({ success: true, version: result.version });
}
