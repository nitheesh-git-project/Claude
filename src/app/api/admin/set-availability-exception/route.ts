import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseDateExceptionBody, writeDateException } from "@/lib/dateException";

/**
 * One date's exception to a therapist's weekly hours: unavailable all day,
 * available for custom hours only, or cleared back to the weekly schedule.
 *
 * Replaces the old per-hour set-availability-override route, which asked an
 * admin to click eighteen cells to say "she is off on Tuesday". The table
 * underneath is unchanged (therapist_availability_override, one row per
 * hour) -- this writes the whole day in one transaction instead of one cell
 * per request, so two admins answering the same date cannot end up with half
 * of each other's answer.
 *
 * The parsing and the write live in src/lib/dateException.ts, shared with
 * the therapist's own route (/api/therapist/set-availability-exception).
 */
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("sessions");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    therapistId?: unknown;
    date?: unknown;
    mode?: unknown;
    ranges?: unknown;
    note?: unknown;
  }>(request);
  if (parseError) return parseError;

  const therapistId = typeof body.therapistId === "string" ? body.therapistId : null;
  if (!therapistId) {
    return NextResponse.json({ error: "Missing therapistId" }, { status: 400 });
  }

  const parsed = parseDateExceptionBody(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: therapist, error: therapistError } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("id", therapistId)
    .eq("role", "therapist")
    .maybeSingle();
  // A failed read is not a therapist who does not exist.
  if (therapistError) {
    return NextResponse.json(
      { error: "We couldn't check that therapist just now. Nothing was changed - please try again." },
      { status: 503 }
    );
  }
  if (!therapist) {
    return NextResponse.json({ error: "Therapist not found" }, { status: 404 });
  }

  const written = await writeDateException(admin, {
    therapistId,
    exception: parsed,
    actorId: adminUser.id,
  });
  if (!written.ok) {
    return NextResponse.json({ error: written.message }, { status: 500 });
  }

  await recordAdminActivity(admin, adminUser.id, {
    action:
      parsed.mode === "clear" ? "therapist.clear_schedule_exception" : "therapist.set_schedule_exception",
    targetId: therapistId,
    targetLabel: therapist.full_name ?? "Therapist",
    details: { date: parsed.dateKey, change: parsed.description },
  });

  return NextResponse.json({ success: true });
}
