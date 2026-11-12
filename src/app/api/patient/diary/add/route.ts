import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { isPatientProfile, isProfileActive, profileCheckUnavailable } from "@/lib/supabase/requireActiveProfile";
import { guardCommunication } from "@/lib/communicationFlags";
import { recordUserActivity } from "@/lib/userActivityLog";
import { serverError } from "@/lib/apiError";
import { loadPatientProfileKind } from "@/lib/outcomeServer";
import { PATIENT_DIARY_SELECT, parseDiaryEntryRow, sameDiaryContent, validateDiaryEntry } from "@/lib/patientDiary";

// A patient -- or the family member holding their phone -- writes in their
// diary: a freezing episode (or a day's or week's tally), a fall, a
// near-miss; active minutes once heart and lung rehabilitation is a
// condition type. One append-only patient_diary_entries row
// (src/lib/patientDiary.ts has the shape and the rules).
//
// Everything that says who is re-derived: the patient is the session's
// user, the author is the same, the role is "patient"; the body carries
// only what happened. Which kinds are offered follows the profile kind,
// read on the server (profileKindFor): freezing only on the Parkinson's
// sub-profile. The time is checked against the real clock, as the table's
// CHECK is -- the diary is dated by the person writing it, not by the debug
// bar.
//
// The note is the patient's own account, read by their physiotherapist:
// scanned (patient_diary_note) and recorded, never blocked -- the booking
// note's posture, since refusing a patient's record of a fall to catch a
// phone number is the worse outcome.
//
// A double tap is the same entry twice; the table's unique index refuses
// the second and this answers it as already saved.
//
// Request:  DiaryAddRequest (src/lib/patientDiary.ts)
//           { kind: "freezing" | "fall" | "near_miss" | "active_minutes",
//             occurredAt: string, details?: object, note?: string }
// Response: 200 { success: true, duplicate: boolean, entry: DiaryEntry }
//           400 validation ({ code: "diary_kind_not_offered" } for a kind
//               this patient's profile does not keep), 401 not signed in,
//           403 not an active patient, 409 { code: "no_condition_profile" },
//           429 too many, 503 a check that could not be run or a database
//               without the table.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request);
  if (parseError) return parseError;

  // Counted after the body parses, never before: a person correcting a typo
  // must not spend an allowance meant for scripts.
  const limited = await enforceRateLimit(request, "patientDiary", { identifier: user.id });
  if (limited) return limited;

  const active = await isProfileActive(user.id);
  if (active === null) return profileCheckUnavailable();
  if (!active) return NextResponse.json({ error: "Your account has been suspended." }, { status: 403 });
  const isPatient = await isPatientProfile(user.id);
  if (isPatient === null) return profileCheckUnavailable();
  if (!isPatient) return NextResponse.json({ error: "Only a patient can write in their own diary." }, { status: 403 });

  const admin = createAdminClient();
  const kind = await loadPatientProfileKind(admin, user.id);
  if (kind.status === "unreadable") {
    return NextResponse.json({ error: "We couldn't check your record just now. Please try again." }, { status: 503 });
  }
  if (kind.status === "no_profile") {
    return NextResponse.json(
      {
        error: "Your physiotherapist sets up your Health Profile at your first session. The diary opens after that.",
        code: "no_condition_profile",
      },
      { status: 409 }
    );
  }

  const checked = validateDiaryEntry(body, { profileKind: kind.profileKind, nowMs: Date.now() });
  if (!checked.ok) {
    return NextResponse.json(checked.code ? { error: checked.error, code: checked.code } : { error: checked.error }, { status: 400 });
  }
  const entry = checked.entry;

  if (entry.note) {
    await guardCommunication(admin, [{ surface: "patient_diary_note", text: entry.note }], {
      authorId: user.id,
      authorRole: "patient",
      patientId: user.id,
      enforcement: "record_only",
    });
  }

  const row = {
    patient_id: user.id,
    kind: entry.kind,
    occurred_at: entry.occurredAt,
    details: entry.details,
    note: entry.note,
    entered_by: user.id,
    entered_by_role: "patient",
  };
  const { data, error } = await admin.from("patient_diary_entries").insert(row).select(PATIENT_DIARY_SELECT).single();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return NextResponse.json(
        { error: "The diary isn't available yet - the clinic's database is being updated. Please try again later." },
        { status: 503 }
      );
    }
    if (error.code === "23505") {
      // The same entry again: a double tap, or a retry after a response
      // that never arrived. The first one is the answer.
      const { data: existing, error: readError } = await admin
        .from("patient_diary_entries")
        .select(PATIENT_DIARY_SELECT)
        .eq("patient_id", user.id)
        .eq("kind", entry.kind)
        .eq("occurred_at", entry.occurredAt)
        .order("created_at", { ascending: true })
        .limit(5);
      const same = (existing ?? []).map(parseDiaryEntryRow).find((e) => e !== null && sameDiaryContent(e, entry));
      if (readError || !same) return NextResponse.json({ success: true, duplicate: true, entry: null });
      return NextResponse.json({ success: true, duplicate: true, entry: same });
    }
    if (error.code === "23514") {
      return NextResponse.json({ error: "The diary refused this entry. Check the time and try again." }, { status: 400 });
    }
    return serverError("patient/diary/add", error);
  }
  const saved = parseDiaryEntryRow(data);
  if (!saved) return serverError("patient/diary/add", new Error("inserted patient_diary_entries row did not parse"));

  await recordUserActivity(admin, {
    action: "patient_diary.added",
    actor: { id: user.id, role: "patient" },
    patientId: user.id,
  });
  return NextResponse.json({ success: true, duplicate: false, entry: saved });
}
