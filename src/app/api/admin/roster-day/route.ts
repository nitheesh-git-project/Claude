import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { parseDateKey } from "@/lib/availabilityRequest";
import { buildRosterDay, type RosterDayAppointment } from "@/lib/rosterDay";
import type { OverrideRow, TemplateRow } from "@/lib/therapistAvailability";

// Who is free on a given date, and which of their hours are already taken.
//
// A **route** rather than more work in the admin dashboard's own render. That
// page already fires ~82 queries a render and keeps all 34 screens mounted, so
// adding six more for a date nobody has picked yet would be paid by every
// admin on every refresh. A date an admin chooses is fetched when they choose
// it.
//
// It reads and writes nothing, so there is no audit row: this is the roster's
// own planning view. It is deliberately not a booking surface -- the
// separation between the roster and the patient's picker is the thing
// `e2e/therapist-roster.spec.ts` R-B02 exists to keep.
//
// GET would suit a read, and it is a POST for the reason every other route
// here is: `parseJsonBody` is the one body parser this codebase uses, and a
// route that answered a query string would be the only one that did.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("sessions");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{ date?: unknown }>(request);
  if (parseError) return parseError;

  const date = parseDateKey(body.date);
  if ("error" in date) {
    return NextResponse.json({ error: date.error }, { status: 400 });
  }
  const dateKey = date.dateKey;

  const admin = createAdminClient();

  // Exactly the eligibility `pickAutoAssignTherapist` uses, so "who could take
  // this" reads the same whether a person is asking or the auto-assigner is.
  const { data: therapistRows, error: therapistError } = await admin
    .from("profiles")
    .select("id, full_name, specialization, timezone, on_leave")
    .eq("role", "therapist")
    .eq("approved", true)
    .neq("active", false)
    .order("full_name");

  if (therapistError) {
    // A read that could not be run is not a read that came back empty -- the
    // rule at the top of AGENTS.md. Answering with an empty roster would say
    // nobody works here.
    console.error("roster-day: therapists", therapistError);
    return NextResponse.json(
      { error: "Couldn't read the roster just now. Please try again.", retryable: true },
      { status: 503 }
    );
  }

  const therapistIds = (therapistRows ?? []).map((t) => t.id);
  if (therapistIds.length === 0) {
    return NextResponse.json({ dateKey, entries: [] });
  }

  // The day's window in UTC, wide enough that a session starting the evening
  // before in any zone the clinic might use is still considered -- the module
  // decides what actually lands on the date, in the therapist's own zone.
  const dayStart = new Date(`${dateKey}T00:00:00Z`);
  const from = new Date(dayStart.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(dayStart.getTime() + 48 * 60 * 60 * 1000).toISOString();

  const [{ data: templateRows }, { data: overrideRows }, { data: appointmentRows }] =
    await Promise.all([
      admin
        .from("therapist_availability_template")
        .select("therapist_id, day_of_week, hour")
        .in("therapist_id", therapistIds),
      admin
        .from("therapist_availability_override")
        .select("therapist_id, date, hour, available")
        .in("therapist_id", therapistIds)
        .eq("date", dateKey),
      admin
        .from("appointments")
        .select("id, therapist_id, slot_time, duration_minutes, status, patient_id")
        .in("therapist_id", therapistIds)
        .gte("slot_time", from)
        .lte("slot_time", to),
    ]);

  // Session codes are migration-dependent, so they are read on their own and
  // merged -- the established convention, and here it costs a label rather
  // than the whole screen if the column is missing.
  const appointmentIds = (appointmentRows ?? []).map((a) => a.id);
  const { data: codeRows } = appointmentIds.length
    ? await admin.from("appointments").select("id, session_code").in("id", appointmentIds)
    : { data: [] as { id: string; session_code: string | null }[] };
  const codeById = new Map((codeRows ?? []).map((c) => [c.id, c.session_code]));

  const patientIds = [
    ...new Set((appointmentRows ?? []).map((a) => a.patient_id).filter(Boolean)),
  ] as string[];
  const { data: patientRows } = patientIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", patientIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const patientNameById = new Map(
    (patientRows ?? []).map((p) => [p.id, p.full_name ?? "Unknown patient"])
  );

  const templateByTherapist: Record<string, TemplateRow[]> = {};
  for (const row of templateRows ?? []) {
    (templateByTherapist[row.therapist_id] ??= []).push({
      day_of_week: row.day_of_week,
      hour: row.hour,
    });
  }
  const overrideByTherapist: Record<string, OverrideRow[]> = {};
  for (const row of overrideRows ?? []) {
    (overrideByTherapist[row.therapist_id] ??= []).push({
      date: row.date,
      hour: row.hour,
      available: row.available,
    });
  }
  const appointmentsByTherapist: Record<string, RosterDayAppointment[]> = {};
  for (const row of appointmentRows ?? []) {
    if (!row.therapist_id) continue;
    (appointmentsByTherapist[row.therapist_id] ??= []).push({
      id: row.id,
      therapistId: row.therapist_id,
      slotTime: row.slot_time,
      durationMinutes: row.duration_minutes,
      status: row.status,
      label: row.patient_id
        ? patientNameById.get(row.patient_id) ?? "Unknown patient"
        : "Unknown patient",
      sessionCode: codeById.get(row.id) ?? null,
    });
  }

  const entries = buildRosterDay(
    dateKey,
    (therapistRows ?? []).map((t) => ({
      id: t.id,
      fullName: t.full_name,
      specialization: t.specialization,
      timezone: t.timezone,
      onLeave: t.on_leave === true,
    })),
    templateByTherapist,
    overrideByTherapist,
    appointmentsByTherapist
  );

  return NextResponse.json({ dateKey, entries });
}
