import { notFound } from "next/navigation";
import { formatClinicDateTime } from "@/lib/formatDateTime";
import { createAdminClient } from "@/lib/supabase/admin";
import ConditionRequestActions from "@/components/admin/ConditionRequestActions";
import ConditionAccessActions from "@/components/admin/ConditionAccessActions";
import ConditionDirectEditForm from "@/components/admin/ConditionDirectEditForm";
import ReadOnlyDeskNote from "@/components/admin/ReadOnlyDeskNote";
import { answerText as readAnswer } from "@/lib/intakeAnswerDiff";
import SpecialtyExamPanel from "@/components/profile/SpecialtyExamPanel";
import MedicalDocumentsPanel from "@/components/profile/MedicalDocumentsPanel";
import type { MedicalDocumentRow } from "@/lib/medicalDocuments";
import SurfaceCard from "@/components/dashboard/SurfaceCard";
import SessionNoteHistory from "@/components/therapist/SessionNoteHistory";
import type { SessionNoteRow } from "@/lib/sessionNotes";
import {
  CONDITION_STATUS_LABEL,
  intakeVersionForSpecialty,
  mergeIntakeQuestionOverrides,
  parseAreaPain,
  questionsForSpecialty,
  visibleQuestions,
  type ConditionProfileStatus,
  type IntakeQuestion,
} from "@/lib/conditionIntake";
import {
  CONDITION_SPECIALTIES,
  parseConditionSpecialty,
  specialtyLabel,
  TRIAGE_QUESTIONS,
  type ConditionSpecialty,
} from "@/lib/conditionSpecialty";
import { PAIN_MAP_REGIONS, type PainAssessmentRow, type QuestionOverrideRow } from "@/lib/painMap";
import type { NeuroAssessmentRow } from "@/lib/neuroExam";
import { getAdminContext } from "@/lib/supabase/requireAdmin";
import { scopeCanManage, scopeCanOpen } from "@/lib/adminScope";
import HomeExercisesChart from "@/components/therapist/HomeExercisesChart";
import { loadHomeExercisesChartRead } from "@/lib/homeExercisesChartServer";
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
import { loadProfileLayout } from "@/lib/profileWidgetsServer";
import { widgetRows } from "@/lib/profileWidgets";
import { ProfileWidgetPatientPanel } from "@/components/admin/ProfileWidgetSettingsToggles";

const regionLabel = (region: string) =>
  PAIN_MAP_REGIONS.find((r) => r.key === region)?.label ?? region;

/** One answer as a line of text, whatever its input type. Shared by the
 *  pending-request card and the history entries so a re-triaged patient's
 *  older submission never renders as raw JSON. */
function answerText(question: IntakeQuestion, raw: string | undefined): string | null {
  return readAnswer(question, raw, regionLabel);
}

/** The answers of one submission, rendered against ITS OWN specialty's
 *  question list. Rendering a re-triage entry against the profile's
 *  current set would produce an empty list, which reads as "they answered
 *  nothing" rather than "they answered a different set". */
function AnswerList({
  specialty,
  data,
  questions,
}: {
  specialty: ConditionSpecialty;
  data: Record<string, string>;
  /** The clinic's current wording for this specialty, when the caller has it
   *  (the live answers); a submission keeps the code defaults. */
  questions?: IntakeQuestion[];
}) {
  // Only the questions these answers ask: a Parkinson's follow-up kept on
  // file after the condition group changed is not part of this answer.
  const rows = visibleQuestions(questions ?? questionsForSpecialty(specialty), data)
    .map((q) => ({ q, text: answerText(q, data[q.key]) }))
    .filter((r) => r.text);
  if (rows.length === 0) {
    return <p className="text-xs text-slate-500">No answers in this submission.</p>;
  }
  return (
    <dl className="space-y-1">
      {rows.map(({ q, text }) => (
        <div key={q.key} className="text-xs">
          <dt className="font-semibold text-slate-600">{q.label}</dt>
          <dd className="text-slate-700">{text}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A read that failed, said as such. Never an empty state: "no documents" and
 *  "the documents did not load" are different facts about a patient. */
function LoadFailed({ what }: { what: string }) {
  return (
    <p
      role="alert"
      data-testid="load-failed"
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
    >
      Couldn&apos;t load {what} - reload the page to try again.
    </p>
  );
}

// A plain module-level helper (not called inline in the component body)
// so the aging indicator's "as of render time" Date.now() read doesn't
// trip the impure-function-during-render lint rule -- see
// admin/dashboard/page.tsx's identical nowTimestamp() for the same reasoning.
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

// Shared body for both the standalone /admin/dashboard/conditions/[id]
// page and its @modal intercepted overlay - same split as
// PatientDetailContent for the same reason (Bug 10).
export default async function ConditionDetailContent({ id }: { id: string }) {
  const admin = createAdminClient();

  // `specialty`, `triage_data` and `proposed_specialty` are newer columns.
  // They go in their own calls and are merged in: this component's main
  // Promise.all is nine deep, and one unknown-column error there would
  // blank the whole review screen rather than one chip.
  const [
    { data: specialtyRow, error: specialtyError },
    { data: proposedSpecialtyRows, error: proposedSpecialtyError },
  ] = await Promise.all([
    admin
      .from("patient_condition_profiles")
      .select("specialty, triage_data")
      .eq("patient_id", id)
      .maybeSingle(),
    admin
      .from("condition_change_requests")
      .select("id, proposed_specialty, proposed_triage_data")
      .eq("patient_id", id),
  ]);
  // A failed read is "we couldn't load it", never the default. `specialty`
  // is the one these two reads decide: a neurological patient whose read
  // failed would otherwise be drawn as orthopaedic, with an orthopaedic
  // chart and an orthopaedic question set. 42703 (no such column) is the one
  // honest default -- a database that predates specialties holds only ortho.
  const specialtyReadFailed =
    (!!specialtyError && specialtyError.code !== "42703") ||
    (!!proposedSpecialtyError && proposedSpecialtyError.code !== "42703");
  const specialty = parseConditionSpecialty(specialtyRow?.specialty);
  const isOrthoProfile = specialty === "ortho";
  const isNeuroProfile = specialty === "neuro";
  const isPedsProfile = specialty === "pediatrics";
  const isGeriatricProfile = specialty === "geriatric";
  const isCardioProfile = specialty === "cardiopulmonary";
  // The neurological chart, read for a neurological profile only and in
  // its own call (neuro_assessments is a new table, so a database without
  // it costs this card -- which says so -- rather than the screen). The
  // record button renders only for a scope its route accepts
  // (requireAdminScope("people")): a control the server would refuse is
  // not offered.
  const [neuroRead, adminContext, orthoReads] = await Promise.all([
    isNeuroProfile
      ? admin
          .from("neuro_assessments")
          .select("id, created_at, submitted_by_role, schema_version, findings")
          .eq("patient_id", id)
          .order("created_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as NeuroAssessmentRow[], error: null }),
    // Always read: the page's own controls (answers, decisions) key off the
    // viewer's scope, not only the chart's.
    getAdminContext(),
    // The orthopaedic progress record (measurements, goal and steps, phase and
    // status history), each read its own call inside the loader; orthopaedic
    // only, like the Pain Map.
    isOrthoProfile ? loadOrthoReads(admin, id) : Promise.resolve(null),
  ]);
  const canRecordNeuro = !!adminContext && scopeCanManage(adminContext.scope, "people");
  const proposedSpecialtyById = new Map(
    (proposedSpecialtyRows ?? []).map((r) => [
      r.id as string,
      {
        specialty: parseConditionSpecialty(r.proposed_specialty),
        triage: (r.proposed_triage_data ?? null) as Record<string, string> | null,
      },
    ])
  );

  // Every one of the nine carries its error. A read that failed used to fall
  // through `?? []` / `?.status ?? "not_started"` and draw an empty section --
  // "no documents", "not started", "no therapist has asked" -- which is a
  // statement about the patient that nobody checked.
  const [
    { data: patient, error: patientError },
    { data: profile, error: profileError },
    { data: changeRequests, error: changeRequestsError },
    { data: grants, error: grantsError },
    { data: assessments, error: assessmentsError },
    { data: intakeOverrideRows, error: intakeOverrideError },
    { data: painMapOverrideRows, error: painMapOverrideError },
    { data: sessionNoteRows, error: sessionNotesError },
    { data: medicalDocuments, error: documentsError },
  ] = await Promise.all([
    admin.from("profiles").select("id, full_name, email").eq("id", id).eq("role", "patient").single(),
    admin
      .from("patient_condition_profiles")
      .select("data, schema_version, status, updated_at, last_submitted_role")
      .eq("patient_id", id)
      .maybeSingle(),
    admin
      .from("condition_change_requests")
      .select("id, submitted_by, submitted_by_role, proposed_data, status, admin_notes, created_at")
      .eq("patient_id", id)
      .order("created_at", { ascending: false }),
    admin
      .from("condition_access_grants")
      .select("id, therapist_id, status, requested_at, decided_at")
      .eq("patient_id", id)
      .order("requested_at", { ascending: false }),
    // The Pain Map is an ORTHOPAEDIC instrument. The patient's and the
    // therapist's screens branch through SpecialtyExamPanel; this one has
    // to as well, or a stroke patient's admin chart carries a permanently
    // empty body map. Not fetched at all for the other two, same rule.
    isOrthoProfile
      ? admin
          .from("pain_assessments")
          .select("id, region, side, pain_percent, submitted_by_role, created_at")
          .eq("patient_id", id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as PainAssessmentRow[], error: null }),
    admin.from("intake_question_templates").select("question_key, question_text, required"),
    admin.from("pain_map_question_templates").select("region, question_key, question_text"),
    // Clinician-only session notes. Admins are the second audience for
    // these (the first being the treating therapist) -- it is how the
    // clinic can see whether care is actually being delivered and
    // documented. Never rendered on a patient-facing surface.
    admin
      .from("session_notes")
      .select("id, appointment_id, patient_id, therapist_id, data, free_text, created_at, updated_at")
      .eq("patient_id", id)
      .order("created_at", { ascending: false }),
    admin
      .from("patient_medical_documents")
      .select("id, title, document_type, taken_on, mime_type, size_bytes, created_at")
      .eq("patient_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!patient) {
    // PGRST116 is `.single()` finding no such patient; anything else is the
    // read failing, which is not the same as the patient not existing.
    if (patientError && patientError.code !== "PGRST116") {
      return (
        <div className="space-y-4">
          <LoadFailed what="this Health Profile" />
        </div>
      );
    }
    notFound();
  }

  const questions = mergeIntakeQuestionOverrides(
    questionsForSpecialty(specialty),
    intakeOverrideRows ?? [],
    specialty
  );
  const painMapOverridesByRegion: Record<string, QuestionOverrideRow[]> = {};
  for (const row of painMapOverrideRows ?? []) {
    (painMapOverridesByRegion[row.region] ??= []).push(row);
  }

  // Names for everyone who appears on this page: the therapists holding or
  // asking for access, the authors of session notes, and whoever submitted
  // each set of answers. A raw id is never a name.
  const nameIds = [
    ...new Set([
      ...(grants ?? []).map((g) => g.therapist_id),
      ...(sessionNoteRows ?? []).map((n) => n.therapist_id),
      ...(changeRequests ?? []).map((r) => r.submitted_by),
    ]),
  ].filter((v): v is string => typeof v === "string" && v !== id);
  const { data: namedPeople, error: namesError } =
    nameIds.length > 0
      ? await admin.from("profiles").select("id, full_name").in("id", nameIds)
      : { data: [] as { id: string; full_name: string }[], error: null };
  const therapistNameById = new Map((namedPeople ?? []).map((t) => [t.id, t.full_name]));
  // The patient is one of their own submitters.
  const personNameById = new Map(therapistNameById);
  personNameById.set(id, patient.full_name);
  const nameOf = (personId: string | null | undefined, fallback: string) =>
    (personId && personNameById.get(personId)) || fallback;

  const status = (profile?.status ?? "not_started") as ConditionProfileStatus;
  const currentData = (profile?.data ?? {}) as Record<string, string>;
  const specialtyDef = CONDITION_SPECIALTIES.find((s) => s.key === specialty);
  const currentVersion = intakeVersionForSpecialty(specialty);
  const isOutdatedVersion =
    status === "active" &&
    typeof profile?.schema_version === "number" &&
    profile.schema_version < currentVersion;
  const triageData = (specialtyRow?.triage_data ?? {}) as Record<string, string>;
  const triageAnswers = TRIAGE_QUESTIONS.map((q) => ({
    label: q.shortLabel ?? q.label,
    value: (triageData[q.key] ?? "").split("\n").filter(Boolean).join(", "),
  })).filter((a) => a.value);
  const pendingRequest = (changeRequests ?? []).find((r) => r.status === "pending");
  const requestHistory = (changeRequests ?? []).filter((r) => r.status !== "pending");
  const pendingDaysOld = pendingRequest ? daysSince(pendingRequest.created_at) : 0;

  // The same orthopaedic layout the patient and the therapist read. What an
  // admin may DO in it follows the routes' own gate: recording a test, the
  // phase and status and reopening a milestone all need the People scope
  // (requireAdminScope("people")), so those controls are absent without it.
  const canManagePeople = !!adminContext && scopeCanManage(adminContext.scope, "people");
  const orthoView =
    isOrthoProfile && orthoReads
      ? shapeOrthoView({ ...orthoReads, assessments: assessments ?? [] }, "clinician", orthoReads.nowMs)
      : null;
  // Home exercises (phase 7d): read-only, on the new layout's specialties only,
  // and only for a scope that may open People (the section the neighbouring
  // clinical reads use); without it the section is absent, not empty.
  const onNewLayout = !!(
    (isOrthoProfile && orthoView) ||
    isPedsProfile ||
    isGeriatricProfile ||
    isCardioProfile ||
    isNeuroProfile
  );
  const exercisesRead =
    onNewLayout && adminContext && scopeCanOpen(adminContext.scope, "people")
      ? await loadHomeExercisesChartRead(admin, id)
      : null;
  const orthoLicence =
    orthoView && canManagePeople ? await loadLicenceForRecording(admin) : { keys: [] as string[], unreadable: false };

  // The neurological layout, read for a neurological profile only (each read
  // its own call). What an admin may do follows the routes' own gates: the
  // examination, a test, the phase and status and a milestone reopen need the
  // People scope; the diary is read-only here (the physiotherapist confirms,
  // the patient writes - there is no admin door), so neither of its controls
  // is offered.
  const neuroKind: NeuroKind | null =
    isNeuroProfile ? (profileKindFor("neuro", currentData) === "neuro_parkinsons" ? "neuro_parkinsons" : "neuro") : null;
  const neuroReads = neuroKind ? await loadNeuroReads(admin, id, { kind: neuroKind }) : null;
  const neuroView =
    neuroKind && neuroReads
      ? shapeNeuroView(
          { ...neuroReads, exams: (neuroRead.data ?? []) as NeuroAssessmentRow[], examsFailed: !!neuroRead.error },
          { kind: neuroKind, intake: currentData, voice: "clinician", nowMs: neuroReads.nowMs }
        )
      : null;
  const neuroLicence =
    neuroReads && neuroReads.licence.status === "ok"
      ? { keys: neuroReads.licence.keys, unreadable: false }
      : { keys: [] as string[], unreadable: !!neuroReads };

  // The paediatric layout, read for a paediatric profile only (each read its
  // own call). What an admin may do follows the routes' own gates: the
  // examination, a test, the phase and status and a milestone reopen need the
  // People scope; there is no diary, and the goal planner is the treating
  // physiotherapist's.
  const pedsReads = isPedsProfile ? await loadPedsReads(admin, id) : null;
  const pedsView =
    isPedsProfile && pedsReads
      ? shapePedsView(pedsReads, {
          intake: currentData,
          voice: "clinician",
          milestoneOptions: questions.find((q) => q.key === "peds_milestones")?.options ?? [],
        })
      : null;
  const pedsLicence =
    pedsReads && pedsReads.licence.status === "ok"
      ? { keys: pedsReads.licence.keys, unreadable: false }
      : { keys: [] as string[], unreadable: !!pedsReads };

  // Strength and balance care and Heart and lung rehabilitation (phase 6b),
  // read for those records only, each read its own call. The admin records
  // tests and sets the status under People scope; the diary is the patient's
  // own account and the treating physiotherapist confirms it, so it is
  // read-only here; the goal planner is the treating physiotherapist's.
  const geriReads = isGeriatricProfile ? await loadGeriatricReads(admin, id) : null;
  const cardioReads = isCardioProfile ? await loadCardioReads(admin, id) : null;
  const geriView = isGeriatricProfile && geriReads ? shapeGeriatricView(geriReads, { intake: currentData, voice: "clinician" }) : null;
  const cardioView = isCardioProfile && cardioReads ? shapeCardioView(cardioReads, { intake: currentData, voice: "clinician" }) : null;
  const newTypeReads = geriReads ?? cardioReads;
  const newTypeLicence =
    newTypeReads && newTypeReads.licence.status === "ok"
      ? { keys: newTypeReads.licence.keys, unreadable: false }
      : { keys: [] as string[], unreadable: !!newTypeReads };

  const requestedGrants = (grants ?? []).filter((g) => g.status === "requested");
  const approvedGrants = (grants ?? []).filter((g) => g.status === "approved");

  // What the summary header says is waiting, and the one place it is decided.
  // Unknown (a read failed) is not zero.
  const pendingKnown = !changeRequestsError && !grantsError;
  const pendingCount = (pendingRequest ? 1 : 0) + requestedGrants.length;
  const phase =
    orthoView?.phase ?? pedsView?.phase ?? neuroView?.phase ?? geriView?.phase ?? cardioView?.phase ?? null;
  // The chart reads the profile's own answers and, for the orthopaedic body
  // map, the examination history. Without either it would draw an empty
  // record, so it says it could not load instead.
  const chartBlocked =
    specialtyReadFailed || !!profileError || (isOrthoProfile && !!assessmentsError);
  // Editing sends the whole answer set back, so it must never be offered on
  // answers that did not load: it would save blanks over the record.
  const canEditAnswers =
    canManagePeople && !specialtyReadFailed && !profileError && !changeRequestsError;
  const patientName = patient.full_name ?? "this patient";
  const pendingSubmitter = pendingRequest
    ? nameOf(pendingRequest.submitted_by, pendingRequest.submitted_by_role === "patient" ? "the patient" : "A therapist")
    : null;

  // What the clinic shows THIS patient on their own Health Profile
  // (profileWidgets.ts). The admin's chart draws every section; the hidden
  // ones are named above it and listed, marked, in "Sections for this
  // patient" -- whose switches render only for a scope that manages People,
  // the route's gate.
  const widgetLayout =
    onNewLayout && !chartBlocked && profile ? await loadProfileLayout(admin, id, profileKindFor(specialty, currentData)) : null;
  const hiddenForPatientNote =
    widgetLayout && widgetLayout.hiddenSections.length > 0 ? (
      <p role="note" className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700" data-testid="admin-hidden-for-patient">
        <i aria-hidden className="fa-solid fa-eye-slash mr-2 text-slate-600" />
        Hidden for the patient: {widgetLayout.hiddenSections.map((r) => r.widget.label).join(", ")}. Everything is shown here; the patient&apos;s own
        page leaves these out.
      </p>
    ) : null;
  const chartSection = chartBlocked ? (
    <LoadFailed what="the Health Profile chart" />
  ) : (
    <>
      {isOrthoProfile && painMapOverrideError && (
        <LoadFailed what="the Pain Map question wording" />
      )}
      {orthoView && isOrthoProfile ? (
        <>
          <OrthoProfileTop
            voice="clinician"
            patientId={id}
            patientName={patient.full_name}
            conditionLine={currentData.chief_complaint?.trim() || null}
            chipLabel={specialtyDef?.label ?? "Orthopaedic"}
            view={orthoView}
            assessments={assessments ?? []}
            areaPain={parseAreaPain(currentData.area_pain)}
            examRecord={{
              endpoint: "/api/admin/pain-assessments/submit",
              patientId: id,
              overridesByRegion: painMapOverridesByRegion,
            }}
            canSetStatus={canManagePeople ? { endpoint: "/api/admin/care-status/set" } : null}
            record={canManagePeople ? { asAdmin: true } : null}
            planner={false}
            reopen={canManagePeople}
            enabledLicensed={orthoLicence.keys}
            licenceUnreadable={orthoLicence.unreadable}
          />
          <p className="text-xs text-slate-500">
            Recording here posts live immediately, same as a therapist&apos;s own entry - it adds a new reading rather
            than editing any past one, because the examination history is never rewritten.
          </p>
        </>
      ) : pedsView && isPedsProfile ? (
        <>
          <PedsProfileTop
            voice="clinician"
            patientId={id}
            patientName={patient.full_name}
            chipLabel={specialtyDef?.label ?? "Paediatric"}
            view={pedsView}
            equipmentChips={pedsEquipmentChips(currentData.peds_equipment, pedsView.exam.latest?.findings.equipment)}
            examRecord={canManagePeople ? { endpoint: "/api/admin/peds-assessments/submit", patientId: id, patientName: patient.full_name } : undefined}
            canSetStatus={canManagePeople ? { endpoint: "/api/admin/care-status/set" } : null}
            record={canManagePeople ? { asAdmin: true } : null}
            planner={false}
            reopen={canManagePeople}
            enabledLicensed={pedsLicence.keys}
            licenceUnreadable={pedsLicence.unreadable}
          />
          <p className="text-xs text-slate-500">
            Recording here posts live immediately, same as a therapist&apos;s own entry - it adds a new reading rather
            than editing any past one, because the examination history is never rewritten.
          </p>
        </>
      ) : neuroView && isNeuroProfile ? (
        <>
          <NeuroProfileTop
            voice="clinician"
            patientId={id}
            patientName={patient.full_name}
            chipLabel={specialtyDef?.label ?? "Neurological"}
            provenance={filledInLine(profile?.last_submitted_role, "clinician")}
            view={neuroView}
            neuroAssessments={(neuroRead.data ?? []) as NeuroAssessmentRow[]}
            examRecord={canRecordNeuro ? { endpoint: "/api/admin/neuro-assessments/submit", patientId: id } : undefined}
            canSetStatus={canManagePeople ? { endpoint: "/api/admin/care-status/set" } : null}
            record={canManagePeople ? { asAdmin: true } : null}
            planner={false}
            reopen={canManagePeople}
            canLogDiary={false}
            canConfirmDiary={false}
            enabledLicensed={neuroLicence.keys}
            licenceUnreadable={neuroLicence.unreadable}
          />
          <p className="text-xs text-slate-500">
            Recording here posts live immediately, same as a therapist&apos;s own entry - it adds a new reading rather
            than editing any past one, because the examination history is never rewritten. The diary is the patient&apos;s own
            account and the treating physiotherapist confirms it; it is read-only here.
          </p>
        </>
      ) : geriView && isGeriatricProfile ? (
        <>
          <GeriatricProfileTop
            voice="clinician"
            patientId={id}
            patientName={patient.full_name}
            chipLabel={specialtyDef?.label ?? "Geriatric"}
            provenance={filledInLine(profile?.last_submitted_role, "clinician")}
            view={geriView}
            canSetStatus={canManagePeople ? { endpoint: "/api/admin/care-status/set" } : null}
            record={canManagePeople ? { asAdmin: true } : null}
            planner={false}
            reopen={canManagePeople}
            canLogDiary={false}
            canConfirmDiary={false}
            enabledLicensed={newTypeLicence.keys}
            licenceUnreadable={newTypeLicence.unreadable}
          />
          <p className="text-xs text-slate-500">
            Recording here posts live immediately, same as a therapist&apos;s own entry - it adds a new reading rather
            than editing any past one. The diary is the patient&apos;s own account and the treating physiotherapist
            confirms it; it is read-only here.
          </p>
        </>
      ) : cardioView && isCardioProfile ? (
        <>
          <CardioProfileTop
            voice="clinician"
            patientId={id}
            patientName={patient.full_name}
            chipLabel={specialtyDef?.label ?? "Cardiopulmonary"}
            provenance={filledInLine(profile?.last_submitted_role, "clinician")}
            view={cardioView}
            canSetStatus={canManagePeople ? { endpoint: "/api/admin/care-status/set" } : null}
            record={canManagePeople ? { asAdmin: true } : null}
            planner={false}
            reopen={canManagePeople}
            canLogDiary={false}
            canConfirmDiary={false}
            enabledLicensed={newTypeLicence.keys}
            licenceUnreadable={newTypeLicence.unreadable}
          />
          <p className="text-xs text-slate-500">
            Recording here posts live immediately, same as a therapist&apos;s own entry - it adds a new reading rather
            than editing any past one. The pre-exercise refusal is enforced on the guided six-minute walk, which
            only the Operations or Clinical desk can run. The diary is the patient&apos;s own account and the treating
            physiotherapist confirms it; it is read-only here.
          </p>
        </>
      ) : (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-display font-bold text-lg text-slate-800 mb-1">
            {isOrthoProfile ? "Pain Map" : isNeuroProfile ? "Neurological examination" : "Examination"}
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            {isOrthoProfile
              ? "Exam findings, and the same figure switched to compare them against what the patient reported."
              : isNeuroProfile
                ? "Tone, power, reflexes, sensation, coordination, balance and gait, compared with the examination before."
                : "This condition type has no on-screen examination chart yet."}
          </p>
          {/* Same one surface and the same recording dialog the therapist
              uses -- an admin entering an exam on someone's behalf should be
              filling in the identical form, not a second one that can drift. */}
          <SpecialtyExamPanel
            specialty={specialty}
            voice="clinician"
            assessments={assessments ?? []}
            areaPain={isOrthoProfile ? parseAreaPain(currentData.area_pain) : []}
            record={
              isOrthoProfile
                ? {
                    endpoint: "/api/admin/pain-assessments/submit",
                    patientId: id,
                    overridesByRegion: painMapOverridesByRegion,
                  }
                : undefined
            }
            neuro={
              isNeuroProfile
                ? {
                    assessments: (neuroRead.data ?? []) as NeuroAssessmentRow[],
                    loadFailed: !!neuroRead.error,
                    record: canRecordNeuro
                      ? { endpoint: "/api/admin/neuro-assessments/submit", patientId: id }
                      : undefined,
                  }
                : undefined
            }
          />
          {(isOrthoProfile || (isNeuroProfile && canRecordNeuro)) && (
            <p className="mt-3 text-xs text-slate-500">
              Recording here posts live immediately, same as a therapist&apos;s own entry - it adds a
              new reading rather than editing any past one, because the examination history is never rewritten.
            </p>
          )}
        </section>
      )}

    </>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{patient.full_name}</h1>
        <p className="text-xs text-slate-500">{patient.email}</p>
      </div>

      {/* 1. The summary: what this record is, where it stands, and whether
          anything is waiting on a person -- before any detail. */}
      <section
        data-testid="health-profile-summary"
        aria-label="Health Profile summary"
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5"
      >
        <h2 className="font-display font-bold text-lg text-slate-800 mb-3">Health Profile</h2>
        <div className="flex flex-wrap items-center gap-2">
          {specialtyReadFailed ? (
            <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
              Condition type: couldn&apos;t load
            </span>
          ) : (
            specialtyDef && (
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${specialtyDef.chipClass}`}>
                <i aria-hidden className={`fa-solid ${specialtyDef.icon} mr-1 text-[10px]`} />
                {specialtyDef.label}
              </span>
            )
          )}
          {profileError ? (
            <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
              Status: couldn&apos;t load
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              {CONDITION_STATUS_LABEL[status]}
            </span>
          )}
          {phase && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              Phase: {phase}
            </span>
          )}
        </div>
        <p className="mt-3 text-sm text-slate-700" data-testid="health-profile-pending-line">
          {!pendingKnown ? (
            <span className="text-red-700">Couldn&apos;t check what is waiting - reload to try again.</span>
          ) : pendingCount === 0 ? (
            "Nothing is waiting for review."
          ) : (
            <a href="#pending-review" className="font-semibold text-amber-800 underline">
              {[
                pendingRequest ? "1 submission to review" : null,
                requestedGrants.length > 0
                  ? `${requestedGrants.length} therapist access request${requestedGrants.length === 1 ? "" : "s"}`
                  : null,
              ]
                .filter(Boolean)
                .join(" and ")}{" "}
              waiting
            </a>
          )}
        </p>
        {!canManagePeople && <ReadOnlyDeskNote className="mt-3" />}
      </section>

      {/* SLOT: the patient's Health Profile widget controls (added by the
          profile-widgets change) go here, directly under the summary. */}
      {/* HEALTH-PROFILE-WIDGET-CONTROLS-SLOT */}

      {/* 2. Pending review: only when there is something to decide, or when
          we could not tell. */}
      {(!pendingKnown || pendingCount > 0) && (
        <section
          id="pending-review"
          data-testid="health-profile-pending-review"
          className="bg-white rounded-2xl border border-amber-200 shadow-sm p-6 scroll-mt-20"
        >
          <h2 className="font-display font-bold text-lg text-slate-800 mb-4">Waiting for review</h2>
          {changeRequestsError && <LoadFailed what="the intake submissions" />}
          {grantsError && <LoadFailed what="the therapist access requests" />}
          {pendingRequest && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold text-amber-800 mb-2 flex flex-wrap items-center gap-2">
                <span>
                  Intake answers from {pendingSubmitter} - {formatClinicDateTime(pendingRequest.created_at)}
                </span>
                {pendingDaysOld > 3 && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                    Waiting {pendingDaysOld} days
                  </span>
                )}
              </p>
              {/* Against the submission's OWN specialty. A therapist who
                  re-triaged this patient while the submission sat here has
                  left answers for a set the profile no longer uses, and
                  rendering them against the current one would show an empty
                  list -- "they answered nothing" rather than "they answered
                  a different set". The decide route refuses that case; this
                  is what makes it legible. */}
              <div className="mb-3">
                <AnswerList
                  specialty={proposedSpecialtyById.get(pendingRequest.id)?.specialty ?? specialty}
                  data={pendingRequest.proposed_data as Record<string, string>}
                />
              </div>
              {canManagePeople ? (
                <>
                  <p className="mb-2 text-[11px] text-amber-900">
                    Approving puts these answers live on {patientName}&apos;s Health Profile straight away.
                  </p>
                  <ConditionRequestActions requestId={pendingRequest.id} patientName={patientName} />
                </>
              ) : (
                <p className="text-[11px] font-semibold text-amber-800">Waiting for a decision</p>
              )}
            </div>
          )}
          {requestedGrants.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {requestedGrants.map((g) => {
                const therapistName = nameOf(g.therapist_id, "A therapist");
                return (
                  <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{therapistName}</p>
                      <p className="text-xs text-slate-500">
                        Asked to edit {patientName}&apos;s Health Profile - {formatClinicDateTime(g.requested_at)} (
                        {daysSince(g.requested_at) === 0 ? "today" : `waiting ${daysSince(g.requested_at)} day${daysSince(g.requested_at) === 1 ? "" : "s"}`}
                        )
                      </p>
                    </div>
                    {canManagePeople ? (
                      <ConditionAccessActions
                        grantId={g.id}
                        status="requested"
                        therapistName={therapistName}
                        patientName={patientName}
                      />
                    ) : (
                      <p className="text-[11px] font-semibold text-amber-800">Waiting for a decision</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* 3. The Health Profile itself: the chart, as the therapist reads it. */}
      {hiddenForPatientNote}
      {chartSection}
      {widgetLayout && (
        <ProfileWidgetPatientPanel
          patientId={id}
          rows={widgetRows(widgetLayout)}
          canManage={canManagePeople}
          kindUnreadable={widgetLayout.kindUnreadable}
          patientUnreadable={widgetLayout.patientUnreadable}
        />
      )}

      {/* 4. Home exercises. */}
      {exercisesRead && !chartBlocked && <HomeExercisesChart read={exercisesRead} />}

      {/* 5. Session notes. */}
      <SurfaceCard
        title="Session notes"
        icon="fa-file-lines"
        subtitle="Written by the treating therapist after each session. Clinician-only - the patient cannot see these, in the app or in their data export."
      >
        {sessionNotesError ? (
          <LoadFailed what="the session notes" />
        ) : (
          <SessionNoteHistory
            notes={(sessionNoteRows ?? []) as SessionNoteRow[]}
            therapistNameById={therapistNameById}
            emptyBody="Nothing recorded yet. Notes appear here as therapists write them up after delivered sessions."
          />
        )}
        {namesError && !sessionNotesError && (
          <p className="mt-2 text-[11px] text-slate-500">Therapist names couldn&apos;t load, so notes show &quot;Therapist&quot;.</p>
        )}
      </SurfaceCard>

      {/* 6. Documents. */}
      <SurfaceCard
        title="Documents"
        icon="fa-folder-open"
        subtitle="Test reports and scans uploaded by the patient themselves. Deleting one is the patient's own call, so there is no admin delete here."
      >
        {documentsError ? (
          <LoadFailed what="the documents" />
        ) : (
          <MedicalDocumentsPanel
            documents={(medicalDocuments ?? []) as MedicalDocumentRow[]}
            canManage={false}
            emptyMessage="This patient hasn't uploaded any reports."
          />
        )}
      </SurfaceCard>

      {/* 7. Who can edit this record. Requests waiting a decision are above;
          this is who holds access now. */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6" data-testid="health-profile-therapist-access">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-4">Therapist access</h2>
        {grantsError ? (
          <LoadFailed what="the therapist access list" />
        ) : approvedGrants.length === 0 ? (
          <p className="text-xs text-slate-500">
            No therapist has been given access to edit {patientName}&apos;s Health Profile.
            {requestedGrants.length > 0 ? " Requests are waiting above." : ""}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {approvedGrants.map((g) => {
              const therapistName = nameOf(g.therapist_id, "A therapist");
              return (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{therapistName}</p>
                    <p className="text-xs text-slate-500">
                      Can edit since {formatClinicDateTime(g.decided_at ?? g.requested_at)}
                    </p>
                  </div>
                  {canManagePeople && (
                    <ConditionAccessActions
                      grantId={g.id}
                      status="approved"
                      therapistName={therapistName}
                      patientName={patientName}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 8. The intake answers the profile was built from, folded away: they
          are the reference, not the first thing a reviewer needs. */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm" data-testid="health-profile-intake-answers">
        <details>
          <summary className="cursor-pointer px-6 py-4 font-display font-bold text-lg text-slate-800">
            Intake answers
          </summary>
          <div className="px-6 pb-6">
            {profileError ? (
              <LoadFailed what="the intake answers" />
            ) : (
              <>
                {isOutdatedVersion && (
                  <p className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Answered under an earlier version of this questionnaire - question wording may have changed
                    since.
                  </p>
                )}
                {intakeOverrideError && <LoadFailed what="the clinic's question wording" />}
                {triageAnswers.length > 0 && (
                  <details className="mb-4 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                      How this patient was triaged
                    </summary>
                    <ul className="mt-1.5 space-y-0.5">
                      {triageAnswers.map((a) => (
                        <li key={a.label} className="text-xs text-slate-600">
                          <span className="font-semibold">{a.label}:</span> {a.value}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <p className="text-xs font-semibold text-slate-500 mb-2">
                  Live {specialtyLabel(specialty).toLowerCase()} answers
                </p>
                <div className="mb-4">
                  <AnswerList
                    specialty={specialty}
                    data={currentData}
                    questions={questions}
                  />
                </div>
                {/* No specialty selector here, deliberately. Changing a
                    patient's condition type is a clinical decision whose
                    path is the therapist's re-triage; a dropdown buried in an
                    answers form is how it gets changed by accident. */}
                {canEditAnswers ? (
                  <ConditionDirectEditForm
                    questions={questions}
                    patientId={id}
                    patientName={patientName}
                    currentData={currentData}
                    disabled={!!pendingRequest}
                  />
                ) : !canManagePeople ? (
                  <p className="text-xs text-slate-500">Answers can be edited by Operations or Clinical.</p>
                ) : null}
                {requestHistory.length > 0 && (
          <details className="mt-5">
            <summary className="text-xs font-semibold text-slate-500 cursor-pointer">
              Review history ({requestHistory.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {requestHistory.map((r, index) => {
                const proposed = proposedSpecialtyById.get(r.id);
                // A therapist's onboarding and re-triage write live and
                // record themselves here as already-approved rows, so this
                // list is where a specialty change shows up. Naming it is
                // the single most consequential thing on this screen: two
                // entries whose answers simply look different are not the
                // same as one that says the condition type changed.
                // Against the row BEFORE it in time, not against the
                // profile's current type. Comparing to current meant the
                // row that actually moved the patient never said so, while
                // an older, since-reverted one did -- the one line on this
                // screen an admin most needs, attached to the wrong entry.
                // requestHistory is newest-first, so the previous state is
                // the next index along.
                const earlier = requestHistory
                  .slice(index + 1)
                  .map((older) => proposedSpecialtyById.get(older.id)?.specialty)
                  .find((sp) => !!sp);
                const changedSpecialty =
                  proposed && earlier && proposed.specialty !== earlier ? proposed.specialty : null;
                const triage = proposed?.triage
                  ? TRIAGE_QUESTIONS.map((q) => ({
                      label: q.shortLabel ?? q.label,
                      value: (proposed.triage?.[q.key] ?? "").split("\n").filter(Boolean).join(", "),
                    })).filter((a) => a.value)
                  : [];
                return (
                  <li key={r.id} className="text-xs text-slate-600 border-t border-slate-100 pt-2">
                    {r.status === "approved" ? "Approved" : "Declined"} - submitted by{" "}
                    {nameOf(r.submitted_by, r.submitted_by_role === "patient" ? "the patient" : "a therapist")},{" "}
                    {formatClinicDateTime(r.created_at)}
                    {proposed && (
                      <span className="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                        {specialtyLabel(proposed.specialty)}
                      </span>
                    )}
                    {changedSpecialty && (
                      <p className="mt-1 font-semibold text-violet-700">
                        Condition type set to {specialtyLabel(changedSpecialty)}
                      </p>
                    )}
                    {r.admin_notes && <p className="text-slate-500">Note: {r.admin_notes}</p>}
                    {triage.length > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-slate-500">
                          What the therapist answered at triage
                        </summary>
                        <ul className="mt-1 space-y-0.5 pl-3">
                          {triage.map((a) => (
                            <li key={a.label} className="text-slate-600">
                              <span className="font-semibold">{a.label}:</span> {a.value}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        )}
              </>
            )}
          </div>
        </details>
      </section>
    </div>
  );
}
