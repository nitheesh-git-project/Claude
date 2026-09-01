import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseDateKey, parseExceptionRangesBody } from "@/lib/availabilityRequest";
import { exceptionRowsForRanges, formatRanges } from "@/lib/availabilityRanges";

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
 * `mode`:
 *   "unavailable"  -- the whole date is closed
 *   "custom_hours" -- exactly `ranges` are open, everything else closed
 *   "clear"        -- the date goes back to following the weekly schedule
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

  const date = parseDateKey(body.date);
  if ("error" in date) {
    return NextResponse.json({ error: date.error }, { status: 400 });
  }

  const mode = body.mode;
  if (mode !== "unavailable" && mode !== "custom_hours" && mode !== "clear") {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  const note = typeof body.note === "string" ? body.note.slice(0, 200) : null;

  let rows: { hour: number; available: boolean }[] = [];
  let description = "Back to the weekly schedule";
  if (mode === "unavailable") {
    rows = exceptionRowsForRanges([]);
    description = "Unavailable all day";
  } else if (mode === "custom_hours") {
    const parsed = parseExceptionRangesBody(body.ranges);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    if (parsed.ranges.length === 0) {
      return NextResponse.json(
        { error: "Add at least one set of hours, or mark the day unavailable." },
        { status: 400 }
      );
    }
    rows = exceptionRowsForRanges(parsed.ranges);
    description = `Available ${formatRanges(parsed.ranges)}`;
  }

  const admin = createAdminClient();
  const { data: therapist } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("id", therapistId)
    .eq("role", "therapist")
    .maybeSingle();
  if (!therapist) {
    return NextResponse.json({ error: "Therapist not found" }, { status: 404 });
  }

  const { error } = await admin.rpc("set_therapist_date_exception", {
    p_therapist_id: therapistId,
    p_date: date.dateKey,
    p_rows: rows,
    p_note: note,
    p_actor: adminUser.id,
  });
  if (error) {
    const missing =
      error.code === "PGRST202" ||
      error.code === "42883" ||
      /set_therapist_date_exception/.test(error.message ?? "");
    return NextResponse.json(
      {
        error: missing
          ? "The roster database update hasn't been applied yet. Ask an admin to re-run supabase/schema.sql."
          : error.message,
      },
      { status: 500 }
    );
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: mode === "clear" ? "therapist.clear_schedule_exception" : "therapist.set_schedule_exception",
    targetId: therapistId,
    targetLabel: therapist.full_name ?? "Therapist",
    details: { date: date.dateKey, change: description },
  });

  return NextResponse.json({ success: true });
}
