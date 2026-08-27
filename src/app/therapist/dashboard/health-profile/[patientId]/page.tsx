import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTherapistAssignedToPatient } from "@/lib/conditionAccess";
import DashboardShell from "@/components/dashboard/DashboardShell";
import ConditionIntakePanel from "@/components/profile/ConditionIntakePanel";
import ConditionSummaryCard from "@/components/profile/ConditionSummaryCard";
import SurfaceCard from "@/components/dashboard/SurfaceCard";
import SessionNoteHistory from "@/components/therapist/SessionNoteHistory";
import type { SessionNoteRow } from "@/lib/sessionNotes";
import PainMapExplorer from "@/components/profile/PainMapExplorer";
import MedicalDocumentsPanel from "@/components/profile/MedicalDocumentsPanel";
import type { MedicalDocumentRow } from "@/lib/medicalDocuments";
import type { QuestionOverrideRow } from "@/lib/painMap";
import RequestConditionAccessButton from "@/components/therapist/RequestConditionAccessButton";
import { buildTherapistNavItems } from "@/lib/dashboardNavItems";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import {
  CONDITION_STATUS_LABEL,
  INTAKE_QUESTIONS,
  mergeIntakeQuestionOverrides,
  parseAreaPain,
  type ConditionProfileStatus,
} from "@/lib/conditionIntake";
import { isDebugNavVisible } from "@/lib/debugNavVisible";

export const metadata: Metadata = {
  title: "Patient Health Profile | Dr. Pooja's Physio",
};

export default async function TherapistPatientHealthProfilePage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  // Reads rely on RLS (condition_profiles_select_assigned_therapist /
  // pain_assessments_select_assigned_therapist in schema.sql) rather than
  // an app-level role check — a row coming back at all is the
  // authorization, same reasoning as /api/packages/purchase-detail. The
  // one exception is the patient's own profile row (name/email): profiles
  // has no RLS policy letting a therapist read a *patient's* row directly
  // (only their own, or admin — same gap the main therapist dashboard's
  // appointment-patient lookup already works around via the admin
  // client), so that one lookup is admin-client + an explicit
  // isTherapistAssignedToPatient gate below instead of relying on RLS.
  const admin = createAdminClient();
  const [
    { data: profile },
    { data: therapistCodeRow },
    isAssigned,
    { data: patient },
    { data: conditionProfile },
    { data: lastRequest },
    { data: assessments },
    { data: medicalDocuments },
    { data: grant },
    { data: overrideRows },
    { data: settingsRow },
    { data: intakeOverrideRows },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).single(),
    supabase.from("profiles").select("therapist_code").eq("id", user.id).maybeSingle(),
    isTherapistAssignedToPatient(admin, user.id, patientId),
    admin.from("profiles").select("id, full_name, email").eq("id", patientId).eq("role", "patient").maybeSingle(),
    supabase
      .from("patient_condition_profiles")
      .select("data, draft_data, status")
      .eq("patient_id", patientId)
      .maybeSingle(),
    supabase
      .from("condition_change_requests")
      .select("status, admin_notes, proposed_data, created_at")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("pain_assessments")
      .select("region, side, pain_percent, created_at, submitted_by_role")
      .eq("patient_id", patientId),
    supabase
      .from("patient_medical_documents")
      .select("id, title, document_type, taken_on, mime_type, size_bytes, created_at")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false }),
    supabase
      .from("condition_access_grants")
      .select("id, status")
      .eq("patient_id", patientId)
      .eq("therapist_id", user.id)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("pain_map_question_templates").select("region, question_key, question_text"),
    supabase.from("site_settings").select(SITE_SETTINGS_SELECT).maybeSingle(),
    supabase.from("intake_question_templates").select("question_key, question_text, required")
  ]);

  if (!patient || !isAssigned) {
    notFound();
  }

  const overridesByRegion: Record<string, QuestionOverrideRow[]> = {};
  for (const row of overrideRows ?? []) {
    (overridesByRegion[row.region] ??= []).push(row);
  }
  // This therapist's clinical notes for this patient. Own query --
  // session_notes is new/migration-dependent, and RLS already scopes it to
  // clinicians who may read it (see session_notes_select_clinician).
  const { data: noteRows } = await supabase
    .from("session_notes")
    .select("id, appointment_id, patient_id, therapist_id, data, free_text, created_at, updated_at")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  const notes = (noteRows ?? []) as SessionNoteRow[];

  const questions = mergeIntakeQuestionOverrides(INTAKE_QUESTIONS, intakeOverrideRows ?? []);

  const status = (conditionProfile?.status ?? "not_started") as ConditionProfileStatus;
  const currentData = (conditionProfile?.data ?? {}) as Record<string, string>;
  // Same resume-priority behavior as the patient's own Health Profile
  // page — see that page's comment.
  const draftData = (conditionProfile?.draft_data ?? null) as Record<string, string> | null;
  const hasDraft = !!draftData && Object.values(draftData).some(Boolean);
  const formInitialData = hasDraft
    ? draftData!
    : lastRequest?.status === "declined"
      ? ((lastRequest.proposed_data ?? {}) as Record<string, string>)
      : currentData;
  // Two different gates now, for two different kinds of writing.
  //
  // Editing the intake is editing the patient's own account of their
  // history, so it still queues behind an admin-approved grant. Recording a
  // Pain Map exam is the therapist's own observation from a session they
  // ran — the same thing a session note is, and session notes have never
  // needed a grant — so being assigned to the patient is the whole
  // requirement. Reaching this page at all already means assigned, but the
  // flag is passed explicitly rather than assumed.
  const canEditIntake = grant?.status === "approved";
  const canRecordExam = isAssigned;
  const adminSettings = parseAdminSettings(settingsRow);

  const showDebugNav = isDebugNavVisible();

  return (
    <DashboardShell
      brandLabel="Therapist Panel"
      brandIcon="fa-user-doctor"
      basePath="/therapist/dashboard"
      navItems={buildTherapistNavItems()}
      userName={profile?.full_name ?? "Therapist"}
      userEmail={user.email ?? ""}
      userAvatarUrl={profile?.avatar_url ?? null}
      userCode={therapistCodeRow?.therapist_code ?? null}
      offsetTop={showDebugNav}
      sessionTimeoutMinutes={adminSettings.sessionTimeoutMinutes}
      realtimeTables={[
        "condition_access_grants",
        "patient_condition_profiles",
        "pain_assessments",
        "intake_question_templates",
      ]}
      headerTitle={patient.full_name}
      headerSubtitle={patient.email}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        <Link href="/therapist/dashboard/health-profile" className="text-xs text-teal-700 font-semibold">
          ← Back to Health Profiles
        </Link>

        {/* The edit-access card used to sit here, three sections above the
            only thing it unlocks. It now lives inside the Pain Map card,
            beside the work it gates. */}

        {/* Above the notes: what the patient brought with them is context
            for reading everything below it, and reading these needs no
            grant -- the select policy is the assigned-therapist one. */}
        <SurfaceCard
          title="Test reports and scans"
          icon="fa-folder-open"
          subtitle="Uploaded by the patient. Worth opening before the session — these are the films and results another clinician has already taken."
        >
          <MedicalDocumentsPanel
            documents={(medicalDocuments ?? []) as MedicalDocumentRow[]}
            canManage={false}
            emptyMessage="This patient hasn't uploaded any reports."
          />
        </SurfaceCard>

        <SurfaceCard
          title="Session notes"
          icon="fa-file-lines"
          subtitle="What was treated, how they responded, and the plan — written after each session. Only you and the clinic's admin can read this; the patient never sees it."
        >
          <SessionNoteHistory
            notes={notes}
            emptyBody="After your first session with this patient, what you record appears here and becomes the prep for the next one."
          />
        </SurfaceCard>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display font-bold text-lg text-slate-800">Patient Care Intake</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              {CONDITION_STATUS_LABEL[status]}
            </span>
          </div>
          {status !== "pending_review" && lastRequest?.status === "declined" && (
            <p className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Your last submission was declined: {lastRequest.admin_notes}. You can edit and resubmit below.
            </p>
          )}
          {canEditIntake ? (
            <ConditionIntakePanel
              questions={questions}
              endpoint="/api/therapist/condition-profile/submit"
              draftEndpoint="/api/therapist/condition-profile/save-draft"
              patientId={patientId}
              currentData={currentData}
              formInitialData={formInitialData}
              locked={status === "pending_review"}
              lockedMessage="A submission for this patient is already waiting on admin review — one at a time."
            />
          ) : questions.some((q) => currentData[q.key]) ? (
            // Read-only until an access grant is approved -- the same
            // rendering the patient sees of their own answers, so the
            // therapist reads a chart rather than a dump of field values.
            <ConditionSummaryCard questions={questions} data={currentData} />
          ) : (
            <p className="text-sm text-slate-600">No intake submitted yet.</p>
          )}

          {/* The access gate lives on this card because this is the only
              thing it still gates. Recording your own exam findings moved
              out from behind it -- see the Pain Map card below. */}
          {!canEditIntake && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-700">
                {grant?.status === "requested"
                  ? "Waiting for an admin to approve your access."
                  : grant?.status === "declined"
                  ? "Your last request to edit this was declined."
                  : "You can read this, but not change it."}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                These are the patient&apos;s own words about their history, so editing them on their
                behalf needs an admin to approve it first. Recording your own exam findings does
                not — that is the Pain Map below.
              </p>
              {(!grant || grant.status === "declined" || grant.status === "revoked") && (
                <div className="mt-2.5">
                  <RequestConditionAccessButton patientId={patientId} />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Pain Map</h2>
          <p className="text-xs text-slate-500 mb-4">
            {canRecordExam
              ? "Tap any marked point for that area's detail, or record what you found this session."
              : "Exam findings on record, and how they compare with what the patient reported."}
          </p>
          <PainMapExplorer
            assessments={assessments ?? []}
            areaPain={parseAreaPain(currentData.area_pain)}
            record={
              canRecordExam
                ? {
                    endpoint: "/api/therapist/pain-assessments/submit",
                    patientId,
                    overridesByRegion,
                  }
                : undefined
            }
          />
        </div>
      </div>
    </DashboardShell>
  );
}
