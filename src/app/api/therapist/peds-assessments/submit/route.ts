import { NextRequest, NextResponse } from "next/server";
import { recordUserActivity } from "@/lib/userActivityLog";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActiveAndApproved, profileCheckUnavailable } from "@/lib/supabase/requireActiveProfile";
import { hasStartedSessionWithPatient, isTherapistAssignedToPatient } from "@/lib/conditionAccess";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { insertPedsExam, pedsExamScannedText, preparePedsExam } from "@/lib/pedsExamRoute";
import { guardCommunication } from "@/lib/communicationFlags";
import { serverNowMs } from "@/lib/debugClock";

// A therapist records one paediatric examination: the six WHO motor
// milestones (not yet / emerging / achieved, the date first seen, seen or
// parent-reported), the GMFCS level, the orthoses and equipment note and a
// note (src/lib/pedsExam.ts).
//
// Request (POST, JSON):
//   { patientId: string, findings: PedsFindings }
//   PedsFindings = {
//     milestones: { [WHO milestone key]: { status: "not_yet" | "emerging" | "achieved",
//                                          firstSeenOn?: "YYYY-MM-DD", source?: "seen" | "reported" } },
//     gmfcsLevel?: 1 | 2 | 3 | 4 | 5, equipment?: string, notes?: string }
//   A milestone not sent is "not assessed". Standing time and independent
//   steps are refused here: they are recorded with Record a test.
// Answers: 200 { success: true } | 400 (invalid findings, or `not_paediatric`)
//   | 403 (not an active therapist, or not assigned) | 409 (no started
//   session) | 503 (a check could not be run, or the table is missing).
//
// The paediatric counterpart of /api/therapist/neuro-assessments/submit,
// and gated exactly the same way: an observation from a session this
// therapist ran, so it needs the therapist to be assigned AND a session
// with this patient to have started or been delivered (on the debug bar's
// clock while it is on) -- no access grant, no admin review, live at once.
// Mirrors peds_assessments_insert_assigned_therapist as defence in depth,
// since this route writes with the service role. Rows are append-only by
// trigger, so a re-examination is a new row and the profile can show change.
export async function POST(request: NextRequest) {
  // Who is asking, before anything the caller sent is looked at.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    patientId?: unknown;
    findings?: unknown;
  }>(request);
  if (parseError) return parseError;
  const patientId = typeof body.patientId === "string" ? body.patientId.trim() : "";
  if (!patientId) {
    return NextResponse.json({ error: "Missing patientId" }, { status: 400 });
  }

  const standing = await isProfileActiveAndApproved(user.id);
  if (standing === null) return profileCheckUnavailable();
  if (!standing) {
    return NextResponse.json(
      { error: "Your account is not active - it is either awaiting admin approval or has been suspended." },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return profileCheckUnavailable();
  if (profile?.role !== "therapist") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const assigned = await isTherapistAssignedToPatient(admin, user.id, patientId);
  if (assigned === null) return profileCheckUnavailable();
  if (!assigned) {
    return NextResponse.json(
      { error: "You can only record findings for a patient you've been assigned to." },
      { status: 403 }
    );
  }

  // Paediatric patients only; validated against the clinic's today and the
  // child's date of birth (pedsExamRoute.ts, shared with the admin door).
  const nowMs = serverNowMs(request);
  const prepared = await preparePedsExam(admin, patientId, body.findings, nowMs);
  if (!prepared.ok) return prepared.response;
  const findings = prepared.findings;

  const { data: settingsRow } = await admin.from("site_settings").select(SITE_SETTINGS_SELECT).maybeSingle();
  const started = await hasStartedSessionWithPatient(
    admin,
    user.id,
    patientId,
    parseAdminSettings(settingsRow).joinWindowMinutes,
    // The debug bar's simulated clock while it is on, as the neurological
    // route does -- the session card offers the exam on that clock.
    nowMs
  );
  if (started === null) return profileCheckUnavailable();
  if (!started) {
    return NextResponse.json(
      {
        error:
          "Findings are recorded from a session you've started with this patient. Open this once your session with them begins.",
      },
      { status: 409 }
    );
  }

  // The note and the equipment note reach the family (their Health Profile
  // and their PDF), so they are scanned at write time.
  const texts = pedsExamScannedText(findings);
  if (texts.length > 0) {
    const leak = await guardCommunication(
      admin,
      texts.map((text) => ({ surface: "peds_assessment_note" as const, text })),
      { authorId: user.id, authorRole: "therapist", patientId }
    );
    if (leak.blockedMessage) {
      return NextResponse.json({ error: leak.blockedMessage }, { status: 400 });
    }
  }

  const failed = await insertPedsExam(
    admin,
    { patientId, submittedBy: user.id, submittedByRole: "therapist", findings },
    "therapist/peds-assessments/submit"
  );
  if (failed) return failed;

  await recordUserActivity(admin, {
    action: "peds_assessment.recorded",
    actor: { id: user.id, role: "therapist" },
    patientId,
    therapistId: user.id,
  });

  return NextResponse.json({ success: true });
}
