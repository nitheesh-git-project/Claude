import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTherapistAssignedToPatient } from "@/lib/conditionAccess";
import DashboardShell from "@/components/dashboard/DashboardShell";
import ConditionIntakePanel from "@/components/profile/ConditionIntakePanel";
import SpecialtySummary from "@/components/profile/SpecialtySummary";
import SpecialtyExamPanel from "@/components/profile/SpecialtyExamPanel";
import PatientOnboardingCard from "@/components/therapist/PatientOnboardingCard";
import SurfaceCard from "@/components/dashboard/SurfaceCard";
import SessionNoteHistory from "@/components/therapist/SessionNoteHistory";
import CarePlanHistory from "@/components/therapist/CarePlanHistory";
import { loadCarePlanHistory, loadCarePlanReviews } from "@/lib/carePlanServer";
import type { SessionNoteRow } from "@/lib/sessionNotes";
import MedicalDocumentsPanel from "@/components/profile/MedicalDocumentsPanel";
import type { MedicalDocumentRow } from "@/lib/medicalDocuments";
import type { PainAssessmentRow, QuestionOverrideRow } from "@/lib/painMap";
import RequestConditionAccessButton from "@/components/therapist/RequestConditionAccessButton";
import { buildTherapistNavItems } from "@/lib/dashboardNavItems";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import {
  CONDITION_STATUS_LABEL,
  mergeIntakeQuestionOverrides,
  parseAreaPain,
  questionsForSpecialty,
  type ConditionProfileStatus,
} from "@/lib/conditionIntake";
import { readEnabledSpecialties } from "@/lib/conditionProfileServer";
import {
  CONDITION_SPECIALTIES,
  parseConditionSpecialty,
  type ConditionSpecialty,
} from "@/lib/conditionSpecialty";
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

  // Two-phase read, for the same reason as the patient's own Health
  // Profile page: the specialty decides whether this chart has a Pain Map
  // at all, and a non-orthopaedic profile must never query
  // pain_assessments rather than merely hiding the component. `specialty`
  // is a new column, so it is read on its own.
  const { data: specialtyRow } = await supabase
    .from("patient_condition_profiles")
    .select("specialty, draft_specialty, triage_data, draft_triage_data, draft_saved_by_role")
    .eq("patient_id", patientId)
    .maybeSingle();
  const specialty = parseConditionSpecialty(specialtyRow?.specialty);
  const isOrtho = specialty === "ortho";

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
    enabledSpecialties,
  ] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).single(),
    supabase.from("profiles").select("therapist_code").eq("id", user.id).maybeSingle(),
    isTherapistAssignedToPatient(admin, user.id, patientId),
    // The patient code rather than the email address. A code identifies a
    // patient across every screen in this app and is what an admin will ask
    // for; an email address identifies them to an inbox, which is the
    // off-platform channel this whole section is about.
    admin
      .from("profiles")
      .select("id, full_name, patient_code")
      .eq("id", patientId)
      .eq("role", "patient")
      .maybeSingle(),
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
    isOrtho
      ? supabase
          .from("pain_assessments")
          .select("region, side, pain_percent, created_at, submitted_by_role")
          .eq("patient_id", patientId)
      : Promise.resolve({ data: [] as PainAssessmentRow[] }),
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
    supabase
      .from("intake_question_templates")
      .select("question_key, question_text, required, specialty"),
    readEnabledSpecialties(admin),
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

  const questions = mergeIntakeQuestionOverrides(
    questionsForSpecialty(specialty),
    intakeOverrideRows ?? [],
    specialty
  );

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
  const canRecordExam = isAssigned && isOrtho;
  // "Nobody has onboarded this patient" is "there is no record on file",
  // not "the specialty column is null": the column defaults to ortho, and
  // an autosaved draft creates the row before anyone has decided anything.
  const needsOnboarding = !questions.some((q) => currentData[q.key]?.trim());
  const specialtyDef = CONDITION_SPECIALTIES.find((s) => s.key === specialty);
  const adminSettings = parseAdminSettings(settingsRow);

  const showDebugNav = isDebugNavVisible();

  // Unapproved threads included: this is the clinician's own chart, and a
  // recommendation of theirs sitting in the clinic's queue -- or turned down
  // -- is exactly what they need to see. The patient's copy of this band
  // gets the default, which drops both.
  const carePlanVersions = await loadCarePlanHistory(admin, patientId, {
    includeUnapproved: true,
  });
  // The clinic's decisions, so a thread that reads "Not approved" also says
  // why. The reason is the actionable half -- this is the screen a
  // therapist comes to in order to rewrite.
  const carePlanReviews = await loadCarePlanReviews(
    admin,
    [...new Set(carePlanVersions.map((v) => v.planId))]
  );
  const carePlanAuthorNames = new Map<string, string>();
  if (carePlanVersions.length > 0) {
    // Author names are not readable through RLS from a therapist's session
    // (profiles_select_own), so they come from the admin client -- the same
    // lookup this page already makes for the patient's own name.
    const { data: authors } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", [...new Set(carePlanVersions.map((v) => v.authoredBy))]);
    for (const a of authors ?? []) carePlanAuthorNames.set(a.id, a.full_name);
  }

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
      headerSubtitle={patient.patient_code ?? "Patient"}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        <Link href="/therapist/dashboard/health-profile" className="text-xs text-teal-700 font-semibold">
          ← Back to My Patients
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

        {/* Recommendations sit beside the notes rather than on a screen of
            their own: "what I did" and "what I think should happen next"
            are read together, and the plan was written from the note. */}
        <CarePlanHistory
          versions={carePlanVersions}
          authorNames={carePlanAuthorNames}
          voice="clinician"
          reviewsByPlan={carePlanReviews}
        />

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <h2 className="font-display font-bold text-lg text-slate-800">Health Profile</h2>
            <div className="flex items-center gap-2">
              {!needsOnboarding && specialtyDef && (
                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${specialtyDef.chipClass}`}
                >
                  <i aria-hidden className={`fa-solid ${specialtyDef.icon} mr-1 text-[10px]`} />
                  {specialtyDef.label}
                </span>
              )}
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                {CONDITION_STATUS_LABEL[status]}
              </span>
            </div>
          </div>
          {status !== "pending_review" && lastRequest?.status === "declined" && (
            <p className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Your last submission was declined: {lastRequest.admin_notes}. You can edit and resubmit below.
            </p>
          )}

          {/* Onboarding is a state of this card, not a screen of its own:
              the queue it belongs to is the same rows My Patients already
              lists, and a different view of the same rows never earns a
              nav entry. */}
          {needsOnboarding ? (
            <PatientOnboardingCard
              patientId={patientId}
              patientName={patient.full_name}
              currentSpecialty={null}
              enabledSpecialties={enabledSpecialties}
              overrideRows={intakeOverrideRows ?? []}
              initialTriage={(specialtyRow?.draft_triage_data ?? undefined) as Record<string, string> | undefined}
              initialAnswers={formInitialData}
              draftSpecialty={
                specialtyRow?.draft_specialty
                  ? (parseConditionSpecialty(specialtyRow.draft_specialty) as ConditionSpecialty)
                  : null
              }
            />
          ) : canEditIntake ? (
            <ConditionIntakePanel
              specialty={specialty}
              voice="clinician"
              draftIsMine={specialtyRow?.draft_saved_by_role === "therapist"}
              questions={questions}
              endpoint="/api/therapist/condition-profile/submit"
              draftEndpoint="/api/therapist/condition-profile/save-draft"
              patientId={patientId}
              currentData={currentData}
              formInitialData={formInitialData}
              locked={status === "pending_review"}
              lockedMessage="A submission for this patient is already waiting on admin review — one at a time."
            />
          ) : (
            // Read-only until an access grant is approved -- the same
            // rendering the patient sees of their own answers, so the
            // therapist reads a chart rather than a dump of field values.
            <SpecialtySummary specialty={specialty} questions={questions} data={currentData} />
          )}

          {/* Re-triage sits with the record it describes. Changing the
              condition type needs only assignment, like the first fill and
              like a Pain Map exam -- it is the therapist's own clinical
              judgement, not an edit to the patient's account of
              themselves. */}
          {!needsOnboarding && (
            <PatientOnboardingCard
              patientId={patientId}
              patientName={patient.full_name}
              currentSpecialty={specialty}
              enabledSpecialties={enabledSpecialties}
              overrideRows={intakeOverrideRows ?? []}
              initialTriage={(specialtyRow?.triage_data ?? undefined) as Record<string, string> | undefined}
            />
          )}

          {/* The access gate lives on this card because this is the only
              thing it still gates. Recording your own exam findings moved
              out from behind it -- see the exam card below. */}
          {!needsOnboarding && !canEditIntake && (
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
                not, and neither does changing the condition type — those are your clinical
                judgement from a session you ran.
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
          <h2 className="font-display font-bold text-lg text-slate-800 mb-1">
            {isOrtho ? "Pain Map" : "Examination"}
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            {!isOrtho
              ? "What this condition type's examination chart will hold once it is built."
              : canRecordExam
                ? "Tap any marked point for that area's detail, or record what you found this session."
                : "Exam findings on record, and how they compare with what the patient reported."}
          </p>
          <SpecialtyExamPanel
            specialty={specialty}
            voice="clinician"
            assessments={assessments ?? []}
            areaPain={isOrtho ? parseAreaPain(currentData.area_pain) : []}
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
