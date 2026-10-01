import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActiveAndApproved, profileCheckUnavailable } from "@/lib/supabase/requireActiveProfile";
import {
  SESSION_NOTE_FIELD_KEYS,
  isNoteEditable,
  missingRequiredNoteFields,
  type SessionNoteData,
} from "@/lib/sessionNotes";
import { serverError } from "@/lib/apiError";

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
    /** The note version the editor opened (updated_at ?? created_at). */
    baseUpdatedAt?: unknown;
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
  if (active === null) return profileCheckUnavailable();
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
  // A note records a session that happened: a completed one, or a
  // confirmed one whose time has come. A `requested` session was never
  // confirmed or delivered -- it used to accept a note once its slot had
  // passed, which put a clinical record on a session nobody held.
  const slotMs = appointment.slot_time ? new Date(appointment.slot_time).getTime() : 0;
  if (appointment.status !== "completed" && appointment.status !== "confirmed") {
    return NextResponse.json(
      { error: "Notes are written for sessions that were confirmed and took place." },
      { status: 400 }
    );
  }
  if (appointment.status !== "completed" && slotMs > Date.now()) {
    return NextResponse.json(
      { error: "You can write the note once the session has taken place." },
      { status: 400 }
    );
  }

  const { data: existing, error: existingError } = await admin
    .from("session_notes")
    .select("id, created_at, updated_at, data, free_text")
    .eq("appointment_id", appointmentId)
    .maybeSingle();
  if (existingError) return serverError("therapist/session-notes/submit", existingError);

  if (existing) {
    if (!isNoteEditable(existing, Date.now())) {
      return NextResponse.json(
        { error: "This note is locked - notes can be edited for 24 hours after they're written." },
        { status: 409 }
      );
    }
    // The version the editor was looking at. Two windows editing the same
    // note used to overwrite each other silently; a save based on an older
    // version is refused so the second editor reloads instead of erasing
    // the first's changes.
    const currentVersion = existing.updated_at ?? existing.created_at;
    if (
      typeof body.baseUpdatedAt === "string" &&
      Date.parse(body.baseUpdatedAt) !== Date.parse(currentVersion)
    ) {
      return NextResponse.json(
        { error: "This note was changed in another window. Close this one and reopen the note to see the latest version." },
        { status: 409 }
      );
    }

    // Keep what we are about to replace. A clinical record whose history
    // can be silently rewritten is not a record -- so if the revision
    // cannot be written, the note is not changed. Its result used to be
    // ignored, and the live note was overwritten with the history lost.
    const { error: revisionError } = await admin.from("session_note_revisions").insert({
      note_id: existing.id,
      data: existing.data,
      free_text: existing.free_text,
    });
    if (revisionError) {
      return serverError("therapist/session-notes/submit", revisionError, {
        message: "Could not save your changes. The note is unchanged -- please try again.",
      });
    }
    // Compare-and-set on the version read above, so a save racing another
    // save lands once rather than both writing over each other.
    const versionGuard = admin
      .from("session_notes")
      .update({ data, free_text: freeText, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    const { data: saved, error } = await (existing.updated_at
      ? versionGuard.eq("updated_at", existing.updated_at)
      : versionGuard.is("updated_at", null)
    )
      .select("id")
      .maybeSingle();
    if (error) {
      return serverError("therapist/session-notes/submit", error);
    }
    if (!saved) {
      return NextResponse.json(
        { error: "This note was changed in another window. Close this one and reopen the note to see the latest version." },
        { status: 409 }
      );
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
    return serverError("therapist/session-notes/submit", error);
  }

  return NextResponse.json({ success: true, updated: false });
}
