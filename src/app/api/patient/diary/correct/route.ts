import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { isPatientProfile, isProfileActive, profileCheckUnavailable } from "@/lib/supabase/requireActiveProfile";
import { recordUserActivity } from "@/lib/userActivityLog";
import { serverError } from "@/lib/apiError";
import { loadDiaryEntry } from "@/lib/patientDiaryServer";
import { DIARY_CORRECTION_DETAILS, DIARY_CORRECTION_KIND, correctionRefusal } from "@/lib/patientDiary";

// "I saved this by mistake" (E1): the patient withdraws one of their own diary
// entries. Nothing is edited or deleted -- a new patient_diary_entries row of
// kind "correction" points at the original (src/lib/patientDiary.ts), and
// every count and the status read past it. The physiotherapist still sees
// the entry, marked as corrected.
//
// Who is re-derived: the patient is the session's user, and the entry is read
// by id with the service role, then checked to be theirs (a stranger's id is
// a 404, never a hint that it exists). An entry the physiotherapist has
// already confirmed is theirs to talk through, not the patient's to withdraw
// (409); the table's guard refuses it too, for any caller. A second tap is
// the unique index's 23505, answered as already done.
//
// Request:  { entryId: string }
// Response: 200 { success: true, duplicate: boolean }
//           400 missing id, 401 not signed in, 403 not an active patient,
//           404 no such entry of theirs,
//           409 { code: "already_confirmed" },
//           429 too many, 503 a check that could not be run or a database
//               without the column.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request);
  if (parseError) return parseError;
  const entryId = typeof body.entryId === "string" ? body.entryId.trim() : "";
  if (!entryId) return NextResponse.json({ error: "Say which entry." }, { status: 400 });

  const limited = await enforceRateLimit(request, "patientDiary", { identifier: user.id });
  if (limited) return limited;

  const active = await isProfileActive(user.id);
  if (active === null) return profileCheckUnavailable();
  if (!active) return NextResponse.json({ error: "Your account has been suspended." }, { status: 403 });
  const isPatient = await isPatientProfile(user.id);
  if (isPatient === null) return profileCheckUnavailable();
  if (!isPatient) return NextResponse.json({ error: "Only a patient can correct their own diary." }, { status: 403 });

  const admin = createAdminClient();
  const read = /^[0-9a-f-]{36}$/i.test(entryId) ? await loadDiaryEntry(admin, entryId) : ({ status: "not_found" } as const);
  if (read.status === "unreadable") {
    return NextResponse.json({ error: "We couldn't check your diary just now. Nothing was changed - please try again." }, { status: 503 });
  }
  if (read.status === "not_found" || read.entry.patientId !== user.id) {
    return NextResponse.json({ error: "We couldn't find that entry in your diary." }, { status: 404 });
  }
  const entry = read.entry;

  const { data: existing, error: existingError } = await admin
    .from("patient_diary_entries")
    .select("id")
    .eq("corrects_entry_id", entry.id)
    .limit(1);
  if (existingError) {
    if (existingError.code === "42703" || existingError.code === "PGRST204") return notYet();
    return NextResponse.json({ error: "We couldn't check your diary just now. Nothing was changed - please try again." }, { status: 503 });
  }
  const refusal = correctionRefusal(entry, { userId: user.id, alreadyCorrected: (existing ?? []).length > 0 });
  if (refusal?.code === "already_corrected") return NextResponse.json({ success: true, duplicate: true });
  if (refusal?.code === "not_yours") return NextResponse.json({ error: "We couldn't find that entry in your diary." }, { status: 404 });
  if (refusal?.code === "already_confirmed") return alreadyConfirmed();

  const { error } = await admin.from("patient_diary_entries").insert({
    patient_id: user.id,
    kind: DIARY_CORRECTION_KIND,
    occurred_at: new Date().toISOString(),
    details: DIARY_CORRECTION_DETAILS,
    note: null,
    entered_by: user.id,
    entered_by_role: "patient",
    corrects_entry_id: entry.id,
  });
  if (error) {
    if (error.code === "23505") return NextResponse.json({ success: true, duplicate: true });
    if (error.code === "42703" || error.code === "PGRST204" || error.code === "23514") return notYet();
    // The guard's refusal: the physiotherapist confirmed it a moment ago.
    if (error.code === "P0001" && /confirmed/.test(error.message ?? "")) return alreadyConfirmed();
    return serverError("patient/diary/correct", error);
  }

  await recordUserActivity(admin, {
    action: "patient_diary.corrected",
    actor: { id: user.id, role: "patient" },
    patientId: user.id,
  });
  return NextResponse.json({ success: true, duplicate: false });
}

function alreadyConfirmed() {
  return NextResponse.json(
    {
      error: "Your physiotherapist has already gone through this one with you, so it stays. Tell them at your next session if it was a mistake.",
      code: "already_confirmed",
    },
    { status: 409 }
  );
}

function notYet() {
  return NextResponse.json(
    { error: "Correcting an entry isn't available yet - the clinic's database is being updated. Please tell your physiotherapist instead." },
    { status: 503 }
  );
}
