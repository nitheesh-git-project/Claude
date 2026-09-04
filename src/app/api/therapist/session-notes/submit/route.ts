import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActiveAndApproved } from "@/lib/supabase/requireActiveProfile";
import {
  SESSION_NOTE_FIELD_KEYS,
  isNoteEditable,
  missingRequiredNoteFields,
  type SessionNoteData,
} from "@/lib/sessionNotes";

/**
 * A therapist records what they did in one of their own sessions.
 *
 * Creates the note, or updates it while it is still inside its 24-hour
 * edit window (see isNoteEditable) -- one route rather than two, because
 * the client's question is always "save this note for this session" and
 * whether that is an insert or an update is a server-side detail.
 *
 * No condition_access_grant is required, unlike the Pain Map and the
 * intake: this is a record of work this therapist personally did, not an
 * edit to the patient's own submitted history. The gate is simply that the
 * appointment is theirs.
 *
 * Never visible to the patient -- session_notes has no patient select
 * policy at all (see schema.sql). This route must never echo a note back
 * to anyone but its author.
 */
export async function POST(request: NextRequest) {
  // Who is asking, before anything the caller sent is looked at. An
  // anonymous request is refused here rather than after body validation,
  // so an unauthenticated caller never drives this route's parsing and is
  // never told what shape the request should have been.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    appointmentId?: string;
    data?: unknown;
    freeText?: unknown;
  }>(request);
  if (parseError) return parseError;

  const { appointmentId } = body;
  if (!appointmentId || typeof appointmentId !== "string") {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }
  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
    return NextResponse.json({ error: "Missing note data" }, { status: 400 });
  }

  const raw = body.data as Record<string, unknown>;
  const unknownKeys = Object.keys(raw).filter((k) => !SESSION_NOTE_FIELD_KEYS.has(k));
  if (unknownKeys.length > 0) {
    return NextResponse.json({ error: "Note contains unknown fields." }, { status: 400 });
  }
  const data: SessionNoteData = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") {
      return NextResponse.json({ error: "Every answer must be text." }, { status: 400 });
    }
    data[key] = value.trim();
  }

  const freeText = typeof body.freeText === "string" ? body.freeText.trim() : null;

  const missing = missingRequiredNoteFields(data);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Fill in what you treated, how the patient responded, and the plan for next time." },
      { status: 400 }
    );
  }

  const active = await isProfileActiveAndApproved(user.id);
  if (!active) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  // The appointment must be this therapist's own, and must actually have
  // happened -- a note on a future session would be a plan, not a record.
  const { data: appointment } = await admin
    .from("appointments")
    .select("id, patient_id, therapist_id, status, slot_time")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appointment || appointment.therapist_id !== user.id) {
    return NextResponse.json({ error: "That session isn't yours." }, { status: 403 });
  }
  if (appointment.status === "cancelled") {
    return NextResponse.json({ error: "That session was cancelled." }, { status: 400 });
  }
  const slotMs = appointment.slot_time ? new Date(appointment.slot_time).getTime() : 0;
  if (appointment.status !== "completed" && slotMs > Date.now()) {
    return NextResponse.json(
      { error: "You can write the note once the session has taken place." },
      { status: 400 }
    );
  }

  const { data: existing } = await admin
    .from("session_notes")
    .select("id, created_at, data, free_text")
    .eq("appointment_id", appointmentId)
    .maybeSingle();

  if (existing) {
    if (!isNoteEditable(existing, Date.now())) {
      return NextResponse.json(
        { error: "This note is locked — notes can be edited for 24 hours after they're written." },
        { status: 409 }
      );
    }
    // Keep what we are about to replace. A clinical record whose history
    // can be silently rewritten is not a record.
    await admin.from("session_note_revisions").insert({
      note_id: existing.id,
      data: existing.data,
      free_text: existing.free_text,
    });
    const { error } = await admin
      .from("session_notes")
      .update({ data, free_text: freeText, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, updated: true });
  }

  const { error } = await admin.from("session_notes").insert({
    appointment_id: appointmentId,
    patient_id: appointment.patient_id,
    therapist_id: user.id,
    data,
    free_text: freeText,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, updated: false });
}
