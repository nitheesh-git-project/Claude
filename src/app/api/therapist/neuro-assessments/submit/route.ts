import { NextRequest, NextResponse } from "next/server";
import { recordUserActivity } from "@/lib/userActivityLog";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { loadConditionProfileCore } from "@/lib/conditionProfileServer";
import { isProfileActiveAndApproved, profileCheckUnavailable } from "@/lib/supabase/requireActiveProfile";
import { hasStartedSessionWithPatient, isTherapistAssignedToPatient } from "@/lib/conditionAccess";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { NEURO_EXAM_VERSION, validateNeuroFindings } from "@/lib/neuroExam";
import { guardCommunication } from "@/lib/communicationFlags";
import { serverError } from "@/lib/apiError";
import { serverNowMs } from "@/lib/debugClock";

// A therapist records one neurological examination: tone, power, reflexes,
// sensation, coordination, balance and gait (src/lib/neuroExam.ts).
//
// The neurological counterpart of /api/therapist/pain-assessments/submit,
// and gated exactly the same way: an observation from a session this
// therapist ran, so it needs the therapist to be assigned AND a session
// with this patient to have started or been delivered -- no access grant,
// no admin review, live at once. Mirrors the RLS policy
// neuro_assessments_insert_assigned_therapist as defence in depth, since
// this route writes with the service role.
//
// Every field is re-validated here against the same scale tables the
// dialog renders from (validateNeuroFindings): a value the screen cannot
// offer is refused, never rounded into shape. Rows are append-only by
// trigger, so a re-examination is a new row and the chart can show change.
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
  const validated = validateNeuroFindings(body.findings);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const findings = validated.findings;

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

  // Neurological patients only. An exam posted against an orthopaedic or
  // paediatric record would be written and shown nowhere -- the same
  // reasoning that makes the Pain Map route refuse a non-orthopaedic one.
  const conditionProfile = await loadConditionProfileCore(admin, patientId);
  if (conditionProfile.specialty !== "neuro") {
    return NextResponse.json(
      {
        error:
          "The neurological examination applies to neurological profiles. This patient is recorded under a different condition type.",
      },
      { status: 400 }
    );
  }

  const { data: settingsRow } = await admin.from("site_settings").select(SITE_SETTINGS_SELECT).maybeSingle();
  const started = await hasStartedSessionWithPatient(
    admin,
    user.id,
    patientId,
    parseAdminSettings(settingsRow).joinWindowMinutes,
    // The debug bar's simulated clock while it is on, as the Pain Map
    // route does -- the session card offers the exam on that clock.
    serverNowMs(request)
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

  // The notes reach the patient (their Health Profile and their PDF), so
  // they are scanned at write time like a Pain Map answer.
  if (findings.notes) {
    const leak = await guardCommunication(
      admin,
      [{ surface: "neuro_assessment_note", text: findings.notes }],
      { authorId: user.id, authorRole: "therapist", patientId }
    );
    if (leak.blockedMessage) {
      return NextResponse.json({ error: leak.blockedMessage }, { status: 400 });
    }
  }

  const { error: insertError } = await admin.from("neuro_assessments").insert({
    patient_id: patientId,
    submitted_by: user.id,
    submitted_by_role: "therapist",
    schema_version: NEURO_EXAM_VERSION,
    findings,
  });
  if (insertError) {
    return serverError("therapist/neuro-assessments/submit", insertError);
  }

  await recordUserActivity(admin, {
    action: "neuro_assessment.recorded",
    actor: { id: user.id, role: "therapist" },
    patientId,
    therapistId: user.id,
  });

  return NextResponse.json({ success: true });
}
