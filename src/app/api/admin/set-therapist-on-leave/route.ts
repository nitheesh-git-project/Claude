import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseLeaveDates, updateTherapistLeave } from "@/lib/leaveRequest";

/**
 * Puts a therapist on leave, or brings them back.
 *
 * `profiles.on_leave` is still the only thing that makes a therapist
 * unavailable; the optional dates and reason are recorded beside it so the
 * roster can say "on leave 10-17 Sep, annual leave" rather than showing a
 * bare amber pill with no end in sight. Nothing computes availability from
 * those dates -- see schema.sql on why that stayed annotation.
 *
 * Coming back never touches the weekly schedule: it was never cleared, so
 * there is nothing to restore. The dates and reason are cleared, since they
 * describe an absence that is over.
 */
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    therapistId?: string;
    onLeave?: boolean;
    from?: unknown;
    to?: unknown;
    reason?: unknown;
  }>(request);
  if (parseError) return parseError;
  const { therapistId, onLeave } = body;
  if (!therapistId || typeof onLeave !== "boolean") {
    return NextResponse.json(
      { error: "Missing therapistId or onLeave" },
      { status: 400 }
    );
  }

  // The roster's leave panel sends dates; the compact toggle on a
  // therapist's own admin page sends only the flag. Saying nothing about
  // the dates has to mean "leave them alone", not "blank whatever the
  // roster recorded".
  const mentionsDates = "from" in body || "to" in body || "reason" in body;
  const parsedDates = parseLeaveDates({
    onLeave,
    from: body.from,
    to: body.to,
    reason: body.reason,
  });
  if ("error" in parsedDates) {
    return NextResponse.json({ error: parsedDates.error }, { status: 400 });
  }
  // Coming back always clears the annotation, whoever pressed the button:
  // an absence that has ended should not leave dates behind describing it.
  const dates = mentionsDates || !onLeave ? parsedDates : null;

  const admin = createAdminClient();
  const updated = await updateTherapistLeave(admin, { therapistId, onLeave, dates });
  if (updated && "error" in updated) {
    return NextResponse.json({ error: updated.error }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Therapist not found" }, { status: 404 });
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "therapist.set_leave",
    targetId: therapistId,
    targetLabel: updated.full_name ?? "Therapist",
    details: {
      onLeave,
      from: dates?.from ?? null,
      to: dates?.to ?? null,
      reason: dates?.reason ?? null,
    },
  });

  return NextResponse.json({ success: true, onLeave });
}
