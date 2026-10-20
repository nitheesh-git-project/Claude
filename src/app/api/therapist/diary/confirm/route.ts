import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { requireAssignedTherapist, requireSignedInUser } from "@/lib/therapistClinicalGate";
import { recordUserActivity } from "@/lib/userActivityLog";
import { serverError } from "@/lib/apiError";
import { UUID_RE } from "@/lib/userActivity";
import { loadDiaryEntry } from "@/lib/patientDiaryServer";
import { PATIENT_DIARY_SELECT, confirmationRefusal, parseDiaryEntryRow } from "@/lib/patientDiary";

// The physiotherapist confirms a patient's diary entry: "I have seen this,
// and we have talked about it". The one change patient_diary_entries'
// trigger permits, once, on a patient's own entry -- the stamp's time is the
// database's. Confirming is not editing: the entry stays the patient's
// account, and a wrong one stays beside a truer one.
//
// The patient is read from the entry, never from the body. Gate: an active,
// approved therapist assigned to that patient under the clinical-access rule
// (requireAssignedTherapist, the mirror of
// patient_diary_entries_select_assigned_therapist) -- a review of what the
// patient wrote needs the assignment, not a started session.
//
// Request:  { entryId: string }
// Response: 200 { success: true, unchanged: boolean, entry: DiaryEntry }
//               (unchanged: it was already confirmed -- by anyone; the
//               entry carries who and when)
//           400 a missing or malformed entryId, 403 not a therapist / not
//           assigned ({ code: "not_assigned" }), 404 no such entry,
//           409 { code: "not_patient_reported" } (a clinician's own entry
//           has nothing to confirm), 503 a check that could not be run or
//           a database without the table.
export async function POST(request: NextRequest) {
  const who = await requireSignedInUser();
  if (!who.ok) return who.response;

  const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request);
  if (parseError) return parseError;
  const entryId = typeof body.entryId === "string" ? body.entryId.trim() : "";
  if (!entryId || !UUID_RE.test(entryId)) return NextResponse.json({ error: "Missing entryId" }, { status: 400 });

  const read = await loadDiaryEntry(createAdminClient(), entryId);
  if (read.status === "unreadable") {
    return NextResponse.json({ error: "We couldn't read that diary entry just now. Please try again." }, { status: 503 });
  }
  if (read.status === "not_found") return NextResponse.json({ error: "That diary entry no longer exists." }, { status: 404 });
  const entry = read.entry;

  const gate = await requireAssignedTherapist(
    who.userId,
    entry.patientId,
    "You can only confirm diary entries for a patient you've been assigned to."
  );
  if (!gate.ok) return gate.response;
  const { admin, therapistId } = gate;

  const refusal = confirmationRefusal(entry);
  if (refusal?.code === "already_confirmed") return NextResponse.json({ success: true, unchanged: true, entry });
  if (refusal?.code === "not_patient_reported") {
    return NextResponse.json(
      { error: "This entry was recorded by a clinician, so there is nothing to confirm.", code: "not_patient_reported" },
      { status: 409 }
    );
  }

  // Compare-and-set on the stamp being empty, so two taps (or two
  // physiotherapists) cannot both confirm: the second finds nothing to
  // update and answers what the first wrote. confirmed_at is set by the
  // trigger; the value sent only satisfies the shape CHECK.
  const { data, error } = await admin
    .from("patient_diary_entries")
    .update({ confirmed_by: therapistId, confirmed_by_role: "therapist", confirmed_at: new Date().toISOString() })
    .eq("id", entry.id)
    .is("confirmed_at", null)
    .select(PATIENT_DIARY_SELECT)
    .maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return NextResponse.json(
        { error: "This database has not been updated yet, so diary entries cannot be confirmed. Re-apply supabase/schema.sql, then try again." },
        { status: 503 }
      );
    }
    return serverError("therapist/diary/confirm", error);
  }
  if (!data) {
    const again = await loadDiaryEntry(admin, entry.id);
    if (again.status === "ok" && again.entry.confirmedAt) {
      return NextResponse.json({ success: true, unchanged: true, entry: again.entry });
    }
    return NextResponse.json({ error: "We couldn't confirm that entry just now. Please try again." }, { status: 503 });
  }
  const confirmed = parseDiaryEntryRow(data);
  if (!confirmed) return serverError("therapist/diary/confirm", new Error("confirmed patient_diary_entries row did not parse"));

  await recordUserActivity(admin, {
    action: "patient_diary.confirmed",
    actor: { id: therapistId, role: "therapist" },
    patientId: entry.patientId,
    therapistId,
  });
  return NextResponse.json({ success: true, unchanged: false, entry: confirmed });
}
