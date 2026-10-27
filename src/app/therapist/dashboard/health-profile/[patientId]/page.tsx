import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { hasStartedSessionWithPatient, isTherapistAssignedToPatient } from "@/lib/conditionAccess";
import { cockpitHref } from "@/lib/guidedAssessmentEntry";
import DashboardShell from "@/components/dashboard/DashboardShell";
import ConditionIntakePanel from "@/components/profile/ConditionIntakePanel";
import SpecialtySummary from "@/components/profile/SpecialtySummary";
import SpecialtyExamPanel from "@/components/profile/SpecialtyExamPanel";
import PatientOnboardingCard from "@/components/therapist/PatientOnboardingCard";
import SurfaceCard from "@/components/dashboard/SurfaceCard";
import SessionNoteHistory from "@/components/therapist/SessionNoteHistory";
import CarePlanHistory from "@/components/therapist/CarePlanHistory";
import HomeExercisesChart, { type HomeExercisesChartRead } from "@/components/therapist/HomeExercisesChart";
import { loadExercisePlanHistory, loadPatientTeachingEvents } from "@/lib/exercisePlanServer";
import { exerciseChartView } from "@/lib/exerciseChart";
import { loadCarePlanHistory, loadCarePlanReviews } from "@/lib/carePlanServer";
import type { SessionNoteRow } from "@/lib/sessionNotes";
import MedicalDocumentsPanel from "@/components/profile/MedicalDocumentsPanel";
import type { MedicalDocumentRow } from "@/lib/medicalDocuments";
import type { PainAssessmentRow, QuestionOverrideRow } from "@/lib/painMap";
import type { NeuroAssessmentRow } from "@/lib/neuroExam";
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
import OrthoProfileTop from "@/components/profile/ortho/OrthoProfileTop";
import NeuroProfileTop from "@/components/profile/neuro/NeuroProfileTop";
import PedsProfileTop from "@/components/profile/peds/PedsProfileTop";
import { loadLicenceForRecording, loadOrthoReads } from "@/lib/orthoProfileServer";
import { shapeOrthoView } from "@/lib/orthoProfileView";
import GeriatricProfileTop from "@/components/profile/geriatric/GeriatricProfileTop";
import CardioProfileTop from "@/components/profile/cardio/CardioProfileTop";
import { loadGeriatricReads } from "@/lib/geriatricProfileServer";
import { loadCardioReads } from "@/lib/cardioProfileServer";
import { shapeGeriatricView } from "@/lib/geriatricProfile";
import { shapeCardioView } from "@/lib/cardioProfile";
import { loadNeuroReads } from "@/lib/neuroProfileServer";
import { shapeNeuroView } from "@/lib/neuroProfileView";
import { filledInLine, type NeuroKind } from "@/lib/neuroProfile";
import { loadPedsReads } from "@/lib/pedsProfileServer";
import { shapePedsView } from "@/lib/pedsProfileView";
import { pedsEquipmentChips } from "@/lib/pedsProfile";
import { profileKindFor } from "@/lib/profileKind";

export const metadata: Metadata = {
  title: "Patient Health Profile | MoveRestore",
};

// A clock read behind a function: the page reads "now" once per request.
function nowTimestamp() {
  return Date.now();
}

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
  // an app-level role check - a row coming back at all is the
  // authorization, same reasoning as /api/packages/purchase-detail. The
  // one exception is the patient's own profile row (name/email): profiles
  // has no RLS policy letting a therapist read a *patient's* row directly
  // (only their own, or admin - same gap the main therapist dashboard's
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
  const isNeuro = specialty === "neuro";
  const isPeds = specialty === "pediatrics";
  const isGeriatric = specialty === "geriatric";
  const isCardio = specialty === "cardiopulmonary";

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
    orthoReads,
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
      .select("data, draft_data, status, last_submitted_role")
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
    // The orthopaedic progress record, as the patient's page reads it, here
    // through the assigned-therapist RLS policies. Orthopaedic only; each of
    // its three reads is its own call so one failing degrades one card.
    isOrtho ? loadOrthoReads(supabase, patientId) : Promise.resolve(null),
  ]);

  if (!patient || !isAssigned) {
    notFound();
  }

  // The neurological examination chart, read only for a neurological
  // profile (the same two-phase rule as the Pain Map above) and in its own
  // call: neuro_assessments is a new table, so a database that has not run
  // the latest schema.sql costs this one card -- which then says it could
  // not load, rather than "nothing recorded" -- and not the page. RLS
  // (neuro_assessments_select_assigned_therapist) is the authorization.
  const earlyData = (conditionProfile?.data ?? {}) as Record<string, string>;
  // The Parkinson's sub-profile is the same chart with its own parts: which
  // one this record is comes from the intake answers just read.
  const neuroKind: NeuroKind | null =
    isNeuro ? (profileKindFor("neuro", earlyData) === "neuro_parkinsons" ? "neuro_parkinsons" : "neuro") : null;
  const [neuroRead, neuroReads, pedsReads, geriReads, cardioReads] = await Promise.all([
    isNeuro
      ? supabase
          .from("neuro_assessments")
          .select("id, created_at, submitted_by_role, schema_version, findings")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as NeuroAssessmentRow[], error: null }),
    // The progress reads of a neurological chart (measurements, goal and
    // steps, phase and status, the diary, the intake history, the licence
    // switch), each its own call, through the assigned-therapist policies.
    // Neurological only: another condition type makes none of them.
    neuroKind ? loadNeuroReads(supabase, patientId, { kind: neuroKind }) : Promise.resolve(null),
    // The paediatric chart's reads (the examinations, the date of birth, the
    // measurements, the goal and steps, the phase and status, the sessions),
    // each its own call, through the assigned-therapist policies. Paediatric
    // only, like the others.
    isPeds ? loadPedsReads(supabase, patientId) : Promise.resolve(null),
    // Strength and balance care and Heart and lung rehabilitation (phase
    // 6b): measurements, goal and steps, phase and status, the diary, the
    // intake history, the licence switch, the date of birth (and, for the
    // heart and lung chart, the clinic's six-minute walk formula), each its
    // own call, through the assigned-therapist policies. Those records only.
    isGeriatric ? loadGeriatricReads(supabase, patientId) : Promise.resolve(null),
    isCardio ? loadCardioReads(supabase, patientId) : Promise.resolve(null),
  ]);

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
  // page - see that page's comment.
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
  // ran - the same thing a session note is, and session notes have never
  // needed a grant - so being assigned to the patient is the whole
  // requirement. Reaching this page at all already means assigned, but the
  // flag is passed explicitly rather than assumed.
  const canEditIntake = grant?.status === "approved";
  const canRecordExam = isAssigned && (isOrtho || isNeuro || isPeds);
  // "Nobody has onboarded this patient" is "there is no record on file",
  // not "the specialty column is null": the column defaults to ortho, and
  // an autosaved draft creates the row before anyone has decided anything.
  const needsOnboarding = !questions.some((q) => currentData[q.key]?.trim());
  const specialtyDef = CONDITION_SPECIALTIES.find((s) => s.key === specialty);
  const adminSettings = parseAdminSettings(settingsRow);
  // The guided video assessment's door: for the assigned therapist with a
  // session that has started or been delivered. A check that could not be run
  // offers nothing here (the cockpit page says so if it is opened).
  const startedSession =
    isAssigned && (await hasStartedSessionWithPatient(admin, user.id, patientId, adminSettings.joinWindowMinutes, nowTimestamp())) === true;
  const orthoView =
    isOrtho && orthoReads
      ? shapeOrthoView({ ...orthoReads, assessments: assessments ?? [] }, "clinician", orthoReads.nowMs)
      : null;
  // Recording a test, the goal and steps, and the phase and status are the
  // therapist's own clinical judgement from a session they ran: assignment is
  // the whole requirement, the same as the Pain Map exam and the neurological
  // exam. (The measurement route adds its own started-session check.)
  const neuroView =
    neuroKind && neuroReads
      ? shapeNeuroView(
          { ...neuroReads, exams: (neuroRead.data ?? []) as NeuroAssessmentRow[], examsFailed: !!neuroRead.error },
          { kind: neuroKind, intake: currentData, voice: "clinician", nowMs: neuroReads.nowMs }
        )
      : null;
  const pedsView =
    isPeds && pedsReads
      ? shapePedsView(pedsReads, {
          intake: currentData,
          voice: "clinician",
          milestoneOptions: questions.find((q) => q.key === "peds_milestones")?.options ?? [],
        })
      : null;
  const geriView = isGeriatric && geriReads ? shapeGeriatricView(geriReads, { intake: currentData, voice: "clinician" }) : null;
  const cardioView = isCardio && cardioReads ? shapeCardioView(cardioReads, { intake: currentData, voice: "clinician" }) : null;
  const newTypeReads = geriReads ?? cardioReads;
  const licence =
    orthoView && isAssigned
      ? await loadLicenceForRecording(admin)
      : newTypeReads
        ? newTypeReads.licence.status === "ok"
          ? { keys: newTypeReads.licence.keys, unreadable: false }
          : { keys: [] as string[], unreadable: true }
      : pedsReads
        ? pedsReads.licence.status === "ok"
          ? { keys: pedsReads.licence.keys, unreadable: false }
          : { keys: [] as string[], unreadable: true }
        : neuroReads
        ? neuroReads.licence.status === "ok"
          ? { keys: neuroReads.licence.keys, unreadable: false }
          : { keys: [] as string[], unreadable: true }
        : { keys: [] as string[], unreadable: false };

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

  // Home exercises (phase 7d): every version and every mark, read with the
  // admin client after the access checks above, and said as "could not load"
  // or "not set up" when it is, never as "none yet".
  const [exerciseHistory, exerciseMarks] = await Promise.all([loadExercisePlanHistory(admin, patientId), loadPatientTeachingEvents(admin, patientId)]);
  let exercisesRead: HomeExercisesChartRead;
  if (exerciseHistory.status === "not_migrated" || exerciseMarks.status === "not_migrated") exercisesRead = { status: "not_migrated" };
  else if (exerciseHistory.status !== "ok" || exerciseMarks.status !== "ok") exercisesRead = { status: "unreadable" };
  else {
    const ids = [...new Set([...exerciseHistory.plans.map((p) => p.authoredBy), ...exerciseMarks.events.map((e) => e.actor)])];
    const exerciseNames = new Map<string, string>();
    if (ids.length > 0) {
      const { data: people, error: peopleError } = await admin.from("profiles").select("id, full_name").in("id", ids);
      if (!peopleError) for (const person of people ?? []) exerciseNames.set(person.id as string, person.full_name as string);
    }
    exercisesRead = { status: "ok", versions: exerciseChartView(exerciseHistory.plans, exerciseMarks.events, exerciseNames) };
  }
  const exercisesSection = <HomeExercisesChart read={exercisesRead} />;

  const reportsSection = (
    <>
      {/* Above the notes: what the patient brought with them is context
          for reading everything below it, and reading these needs no
          grant -- the select policy is the assigned-therapist one. */}
      <SurfaceCard
        title="Test reports and scans"
        icon="fa-folder-open"
        subtitle="Uploaded by the patient. Worth opening before the session - these are the films and results another clinician has already taken."
      >
        <MedicalDocumentsPanel
          documents={(medicalDocuments ?? []) as MedicalDocumentRow[]}
          canManage={false}
          emptyMessage="This patient hasn't uploaded any reports."
        />
      </SurfaceCard>
    </>
  );

  const notesSection = (
    <>
      <SurfaceCard
        title="Session notes" info="card:health-profile"
        icon="fa-file-lines"
        subtitle="What was treated, how they responded, and the plan - written after each session. Only you and the clinic's admin can read this; the patient never sees it."
      >
        <SessionNoteHistory
          notes={notes}
          emptyBody="After your first session with this patient, what you record appears here and becomes the prep for the next one."
        />
      </SurfaceCard>
    </>
  );

  const plansSection = (
    <>
      {/* Recommendations sit beside the notes rather than on a screen of
          their own: "what I did" and "what I think should happen next"
          are read together, and the plan was written from the note. */}
      <CarePlanHistory
        versions={carePlanVersions}
        authorNames={carePlanAuthorNames}
        voice="clinician"
        reviewsByPlan={carePlanReviews}
      />
    </>
  );

  const conditionCard = (
    <>
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
            onFileAnswers={currentData}
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
            lockedMessage="A submission for this patient is already waiting on admin review - one at a time."
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
            onFileAnswers={currentData}
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
              not, and neither does changing the condition type - those are your clinical
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
    </>
  );

  const examCard = (
    <>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-1">
          {isOrtho ? "Pain Map" : isNeuro ? "Neurological examination" : "Examination"}
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          {isNeuro
            ? "Tone, power, reflexes, sensation, coordination, balance and gait - the latest examination, and what changed since the one before."
            : !isOrtho
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
            canRecordExam && isOrtho
              ? {
                  endpoint: "/api/therapist/pain-assessments/submit",
                  patientId,
                  overridesByRegion,
                }
              : undefined
          }
          neuro={
            isNeuro
              ? {
                  assessments: (neuroRead.data ?? []) as NeuroAssessmentRow[],
                  loadFailed: !!neuroRead.error,
                  record: canRecordExam
                    ? { endpoint: "/api/therapist/neuro-assessments/submit", patientId, patientName: patient.full_name }
                    : undefined,
                }
              : undefined
          }
        />
      </div>
    </>
  );

  const orthoTop =
    orthoView && isOrtho ? (
      <OrthoProfileTop
        voice="clinician"
        patientId={patientId}
        patientName={patient.full_name}
        conditionLine={currentData.chief_complaint?.trim() || null}
        chipLabel={specialtyDef?.label ?? "Orthopaedic"}
        view={orthoView}
        assessments={assessments ?? []}
        areaPain={parseAreaPain(currentData.area_pain)}
        examRecord={
          canRecordExam
            ? { endpoint: "/api/therapist/pain-assessments/submit", patientId, overridesByRegion }
            : undefined
        }
        canSetStatus={isAssigned ? { endpoint: "/api/therapist/care-status/set" } : null}
        record={isAssigned ? { asAdmin: false } : null}
        planner={isAssigned}
        reopen={false}
        enabledLicensed={licence.keys}
        licenceUnreadable={licence.unreadable}
      />
    ) : null;

  const neuroTop =
    neuroView && isNeuro ? (
      <NeuroProfileTop
        voice="clinician"
        patientId={patientId}
        patientName={patient.full_name}
        chipLabel={specialtyDef?.label ?? "Neurological"}
        provenance={filledInLine(conditionProfile?.last_submitted_role, "clinician")}
        view={neuroView}
        neuroAssessments={(neuroRead.data ?? []) as NeuroAssessmentRow[]}
        examRecord={canRecordExam ? { endpoint: "/api/therapist/neuro-assessments/submit", patientId, patientName: patient.full_name } : undefined}
        canSetStatus={isAssigned ? { endpoint: "/api/therapist/care-status/set" } : null}
        record={isAssigned ? { asAdmin: false } : null}
        planner={isAssigned}
        reopen={false}
        canLogDiary={false}
        canConfirmDiary={isAssigned}
        enabledLicensed={licence.keys}
        licenceUnreadable={licence.unreadable}
      />
    ) : null;

  const geriTop =
    geriView && isGeriatric ? (
      <GeriatricProfileTop
        voice="clinician"
        patientId={patientId}
        patientName={patient.full_name}
        chipLabel={specialtyDef?.label ?? "Geriatric"}
        provenance={filledInLine(conditionProfile?.last_submitted_role, "clinician")}
        view={geriView}
        canSetStatus={isAssigned ? { endpoint: "/api/therapist/care-status/set" } : null}
        record={isAssigned ? { asAdmin: false } : null}
        planner={isAssigned}
        reopen={false}
        canLogDiary={false}
        canConfirmDiary={isAssigned}
        enabledLicensed={licence.keys}
        licenceUnreadable={licence.unreadable}
      />
    ) : null;

  const cardioTop =
    cardioView && isCardio ? (
      <CardioProfileTop
        voice="clinician"
        patientId={patientId}
        patientName={patient.full_name}
        chipLabel={specialtyDef?.label ?? "Cardiopulmonary"}
        provenance={filledInLine(conditionProfile?.last_submitted_role, "clinician")}
        view={cardioView}
        canSetStatus={isAssigned ? { endpoint: "/api/therapist/care-status/set" } : null}
        record={isAssigned ? { asAdmin: false } : null}
        planner={isAssigned}
        reopen={false}
        canLogDiary={false}
        canConfirmDiary={isAssigned}
        enabledLicensed={licence.keys}
        licenceUnreadable={licence.unreadable}
      />
    ) : null;

  const pedsTop =
    pedsView && isPeds ? (
      <PedsProfileTop
        voice="clinician"
        patientId={patientId}
        patientName={patient.full_name}
        chipLabel={specialtyDef?.label ?? "Paediatric"}
        view={pedsView}
        equipmentChips={pedsEquipmentChips(currentData.peds_equipment, pedsView.exam.latest?.findings.equipment)}
        examRecord={canRecordExam ? { endpoint: "/api/therapist/peds-assessments/submit", patientId, patientName: patient.full_name } : undefined}
        canSetStatus={isAssigned ? { endpoint: "/api/therapist/care-status/set" } : null}
        record={isAssigned ? { asAdmin: false } : null}
        planner={isAssigned}
        reopen={false}
        enabledLicensed={licence.keys}
        licenceUnreadable={licence.unreadable}
      />
    ) : null;

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
        "neuro_assessments",
        "intake_question_templates",
        "exercise_plans",
        ...(isOrtho || neuroView || pedsView || geriView || cardioView ? ["outcome_measurements", "care_goals", "care_milestones", "care_status_events"] : []),
        ...(neuroView || geriView || cardioView ? ["patient_diary_entries"] : []),
        ...(pedsView ? ["peds_assessments", "appointments"] : []),
      ]}
      headerTitle={patient.full_name}
      headerSubtitle={patient.patient_code ?? "Patient"}
    >
      <div className={`mx-auto space-y-6 ${orthoView || neuroView || pedsView || geriView || cardioView ? "max-w-6xl" : "max-w-2xl"}`}>
        {/* No "Back to My Patients" link: this page sits inside the dashboard
            shell, whose sidebar keeps My Patients highlighted and one tap
            away. */}

        {/* The edit-access card used to sit here, three sections above the
            only thing it unlocks. It now lives inside the Pain Map card,
            beside the work it gates. */}

        {startedSession && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-200 bg-teal-50/60 p-4">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">Guided video assessment</p>
              <p className="text-xs text-slate-700">Lead the checks live over the video call, one step at a time, from a second screen.</p>
            </div>
            <Link
              href={cockpitHref(patientId)}
              data-testid="chart-start-guided-assessment"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-700 px-5 text-sm font-bold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
            >
              <i className="fa-solid fa-clipboard-check" aria-hidden="true" />
              Start guided assessment
            </Link>
          </div>
        )}

        {orthoTop ? (
          // An orthopaedic chart opens on the layout shared with the patient's
          // page (header, key numbers, body map, graph, steps, measures) and
          // everything the page always had follows it. A patient nobody has
          // onboarded yet sees the condition card first, because that is where
          // onboarding happens.
          <>
            {needsOnboarding && conditionCard}
            {orthoTop}
            {plansSection}
            {exercisesSection}
            {notesSection}
            {reportsSection}
            {!needsOnboarding && conditionCard}
          </>
        ) : pedsTop ? (
          // A paediatric chart opens on the layout shared with the parent's
          // page; the examination, with its "Record a re-examination" button,
          // is the condition picture inside it, so the old exam card is not
          // repeated below.
          <>
            {needsOnboarding && conditionCard}
            {pedsTop}
            {plansSection}
            {exercisesSection}
            {notesSection}
            {reportsSection}
            {!needsOnboarding && conditionCard}
          </>
        ) : neuroTop ? (
          // A neurological chart opens on the layout shared with the patient's
          // page; the examination, with its "Record a re-examination" button,
          // is the condition picture inside it, so the old exam card is not
          // repeated below.
          <>
            {needsOnboarding && conditionCard}
            {neuroTop}
            {plansSection}
            {exercisesSection}
            {notesSection}
            {reportsSection}
            {!needsOnboarding && conditionCard}
          </>
        ) : geriTop || cardioTop ? (
          // Strength and balance care and Heart and lung rehabilitation open
          // on the layout shared with the patient's page; there is no
          // examination card for either (phase 6a: no exam before Done).
          <>
            {needsOnboarding && conditionCard}
            {geriTop ?? cardioTop}
            {plansSection}
            {exercisesSection}
            {notesSection}
            {reportsSection}
            {!needsOnboarding && conditionCard}
          </>
        ) : (
          <>
            {reportsSection}
            {notesSection}
            {plansSection}
            {conditionCard}
            {/* Strength and balance care and Heart and lung rehabilitation
                have no exam layer (phase 6a); their measurements are drawn
                by their own layout in phase 6b. */}
            {specialty !== "geriatric" && specialty !== "cardiopulmonary" && examCard}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
