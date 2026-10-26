import { NextRequest, NextResponse } from "next/server";
import { readAllRows } from "@/lib/supabase/readAllRows";
import { createClient } from "@/lib/supabase/server";
import { isPatientProfile, profileCheckUnavailable } from "@/lib/supabase/requireActiveProfile";
import { buildHealthProfilePdf, healthProfilePdfFilename } from "@/lib/healthProfilePdf";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import {
  CONDITION_STATUS_LABEL,
  INTAKE_QUESTIONS_BY_SPECIALTY,
  mergeIntakeQuestionOverrides,
  questionsForSpecialty,
  visibleQuestions,
  type ConditionProfileStatus,
} from "@/lib/conditionIntake";
import {
  CONDITION_SPECIALTIES,
  parseConditionSpecialty,
  specialtyLabel,
} from "@/lib/conditionSpecialty";
import { MEDICAL_DOCUMENT_TYPE_LABEL, type MedicalDocumentType } from "@/lib/medicalDocuments";
import { describeNeuroExamForText, parseNeuroAssessments, type NeuroAssessmentRow } from "@/lib/neuroExam";
import { describePedsExamForText, parsePedsAssessments, PEDS_ASSESSMENT_SELECT, type PedsAssessmentRow } from "@/lib/pedsExam";
import { parseWeeksAtBirth, pedsAgeLine, pedsTodayIso, PEDS_WEEKS_AT_BIRTH_KEY } from "@/lib/pedsAge";
import { achievedAgeLabel, pedsMilestoneWindows, PEDS_WINDOWS_VERIFICATION_NOTE } from "@/lib/pedsMilestoneWindows";
import { loadCareStatus, loadGoalAndMilestones, loadMeasurements, loadSixMinuteWalkEquation } from "@/lib/outcomeServer";
import { parseMeasurementRows } from "@/lib/outcomeSeries";
import { profileKindFor } from "@/lib/profileKind";
import { buildProgressExport } from "@/lib/progressExport";
import { buildDiaryExport } from "@/lib/diaryExport";
import { loadDiaryEntries } from "@/lib/patientDiaryServer";
import { diaryKindsFor } from "@/lib/patientDiary";
import { clinicDateKey } from "@/lib/clinicWeek";
import { formatClinicDate } from "@/lib/formatDateTime";
import { geriatricExportSection, shapeGeriatricView } from "@/lib/geriatricProfile";
import { cardioExportSection, shapeCardioView } from "@/lib/cardioProfile";
import type { MeasuredProfileReads } from "@/lib/progressProfileBase";

/** Shape of the rows the Pain Map query returns, so the non-orthopaedic
 *  branch's empty placeholder keeps the same type. */
type PainExportRow = {
  region: string;
  side: string;
  pain_percent: number;
  submitted_by_role: string;
  answers: unknown;
  created_at: string;
};

// The patient's own copy of their record: approved Patient Care Intake,
// every Pain Map exam, and what reports they have on file. Delivered as a
// PDF named after them (Priya_Sharma_PT0042.pdf), because the thing a
// patient does with this is hand it to another clinician -- the JSON this
// used to return was only readable by a developer. ?format=json still
// returns the raw structure for genuine data portability; nothing in the
// UI links to it.
//
// RLS already scopes every one of these tables to the caller's own rows,
// so the regular client is enough; no admin client needed here.
//
// Deliberately excludes session_notes. Those are the treating clinician's
// working notes, written for other clinicians and never shown to the
// patient (see the session_notes section in supabase/schema.sql) -- adding
// them here would route around that decision through the export door. A
// formal medical-records request is handled by the clinic outside the app.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // One account carries one role, and this is the sharpest case of it: a
  // therapist or hospital session got a typeset PDF of an empty health
  // record, named after them, rather than being told it was not theirs.
  const isPatient = await isPatientProfile(user.id);
  if (isPatient === null) return profileCheckUnavailable();
  if (!isPatient) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Same two-phase read as the health-profile pages: the specialty
  // decides whether this export has a Pain Map section at all, and a
  // non-orthopaedic one must not query pain_assessments rather than
  // fetching rows it then discards.
  const { data: specialtyRow, error: specialtyError } = await supabase
    .from("patient_condition_profiles")
    .select("specialty")
    .eq("patient_id", user.id)
    .maybeSingle();
  if (specialtyError) return exportUnavailable();
  const specialty = parseConditionSpecialty(specialtyRow?.specialty);
  const isOrtho = specialty === "ortho";
  const isNeuro = specialty === "neuro";
  const isPeds = specialty === "pediatrics";
  const isGeriatric = specialty === "geriatric";
  const isCardio = specialty === "cardiopulmonary";

  // Every read that carries part of the record is checked, and the lists
  // are paged. An export is handed to another clinician as "the record", so
  // a section silently missing because its read failed -- or cut off at
  // PostgREST's 1,000 rows -- is a clinical loss presented as a complete
  // document. A failure refuses the export rather than producing a partial
  // one. (The question-template overrides only reword labels, so they and
  // the site name keep falling back to the defaults.)
  const [
    { data: profile, error: profileError },
    { data: conditionProfile, error: conditionError },
    changeRequestsResult,
    assessmentsResult,
    neuroResult,
    pedsResult,
    documentsResult,
    { data: intakeOverrideRows },
    { data: painMapOverrideRows },
    { data: settingsRow },
    measurementsRead,
    goalsRead,
  ] = await Promise.all([
    // date_of_birth: the paediatric exam's corrected age (pedsAge.ts), and
    // with gender the geriatric chair-stand norms and the cardiopulmonary
    // predicted walk (phase 6a).
    supabase.from("profiles").select("full_name, email, patient_code, date_of_birth, gender").eq("id", user.id).single(),
    supabase
      .from("patient_condition_profiles")
      .select("data, schema_version, status, updated_at")
      .eq("patient_id", user.id)
      .maybeSingle(),
    readAllRows<ChangeRequestExportRow>(() =>
      supabase
        .from("condition_change_requests")
        .select("submitted_by_role, proposed_data, status, admin_notes, reviewed_at, created_at")
        .eq("patient_id", user.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
    ),
    isOrtho
      ? readAllRows<PainExportRow>(() =>
          supabase
            .from("pain_assessments")
            .select("region, side, pain_percent, submitted_by_role, answers, created_at")
            .eq("patient_id", user.id)
            .order("created_at", { ascending: false })
            .order("id", { ascending: true })
        )
      : Promise.resolve({ rows: [] as PainExportRow[], error: null, truncated: false }),
    // The neurological examination chart, for a neurological profile only
    // -- the same rule as the Pain Map above, and checked the same way: a
    // record handed to another clinician without its examinations is a
    // clinical loss presented as a complete document.
    isNeuro
      ? readAllRows<NeuroAssessmentRow>(() =>
          supabase
            .from("neuro_assessments")
            .select("id, created_at, submitted_by_role, schema_version, findings")
            .eq("patient_id", user.id)
            .order("created_at", { ascending: false })
            .order("id", { ascending: true })
        )
      : Promise.resolve({ rows: [] as NeuroAssessmentRow[], error: null, truncated: false }),
    // The paediatric examination, for a paediatric profile only, checked
    // the same way: complete or refused.
    isPeds
      ? readAllRows<PedsAssessmentRow>(() =>
          supabase
            .from("peds_assessments")
            .select(PEDS_ASSESSMENT_SELECT)
            .eq("patient_id", user.id)
            .order("created_at", { ascending: false })
            .order("id", { ascending: true })
        )
      : Promise.resolve({ rows: [] as PedsAssessmentRow[], error: null, truncated: false }),
    readAllRows<DocumentExportRow>(() =>
      supabase
        .from("patient_medical_documents")
        .select("title, document_type, taken_on, created_at")
        .eq("patient_id", user.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
    ),
    supabase
      .from("intake_question_templates")
      .select("question_key, question_text, required, specialty"),
    isOrtho
      ? supabase.from("pain_map_question_templates").select("region, question_key, question_text")
      : Promise.resolve({ data: [] as { region: string; question_key: string; question_text: string }[] }),
    supabase.from("site_settings").select(SITE_SETTINGS_SELECT).maybeSingle(),
    // The measurement and milestone layers, read with the patient's own
    // RLS-scoped client like everything above. Each answers a discriminated
    // result rather than an empty list on failure (outcomeServer.ts).
    loadMeasurements(supabase, user.id),
    loadGoalAndMilestones(supabase, user.id),
  ]);

  if (
    profileError ||
    conditionError ||
    changeRequestsResult.error ||
    changeRequestsResult.truncated ||
    assessmentsResult.error ||
    assessmentsResult.truncated ||
    neuroResult.error ||
    neuroResult.truncated ||
    pedsResult.error ||
    pedsResult.truncated ||
    documentsResult.error ||
    documentsResult.truncated ||
    // Complete or refused, for the goal, the steps and the measures too: a
    // record handed over without its graph's numbers is a clinical loss
    // presented as a complete document. "Unreadable" includes a record too
    // large to page through safely.
    measurementsRead.status !== "ok" ||
    goalsRead.status !== "ok"
  ) {
    return exportUnavailable();
  }
  // The physiotherapist's phase and status overrule, for the profile kind the
  // record is read as (which needs the intake answers read above, so this is
  // a second step). Its own call, and unreadable refuses the export: a
  // document printed without the overrule would show the computed status
  // when a clinician had said otherwise.
  const profileKind = profileKindFor(specialty, (conditionProfile?.data ?? {}) as Record<string, string>);
  const careStatusRead = await loadCareStatus(supabase, user.id, { profileKind });
  if (careStatusRead.status !== "ok") return exportUnavailable();
  // The patient diary, for a record whose profile kind keeps one (a
  // neurological record; none for another condition type, which makes no read).
  // Complete or refused: an unreadable diary refuses the export, because a
  // record handed over without its falls reads as a record with none.
  const diaryRead = diaryKindsFor(profileKind).length > 0 ? await loadDiaryEntries(supabase, user.id) : null;
  if (diaryRead && diaryRead.status !== "ok") return exportUnavailable();
  // The clinic's six-minute walk equation, for a cardiopulmonary record's
  // "% of predicted". A setting rather than part of the record, so an
  // unreadable one prints "we couldn't check" instead of refusing.
  const equationRead = isCardio ? await loadSixMinuteWalkEquation(supabase) : null;

  const changeRequests = changeRequestsResult.rows;
  const assessments = assessmentsResult.rows;
  const documents = documentsResult.rows;

  if (request.nextUrl.searchParams.get("format") === "json") {
    const payload = {
      exported_at: new Date().toISOString(),
      patient: {
        name: profile?.full_name ?? null,
        email: profile?.email ?? null,
        patient_code: profile?.patient_code ?? null,
      },
      specialty,
      condition_profile: conditionProfile ?? null,
      submission_history: changeRequests ?? [],
      pain_map_assessments: assessments ?? [],
      neuro_assessments: neuroResult.rows,
      peds_assessments: pedsResult.rows,
      outcome_measurements: measurementsRead.rows,
      care_goals: goalsRead.goals,
      care_milestones: goalsRead.milestones,
      care_status_events: careStatusRead.events,
      patient_diary_entries: diaryRead ? diaryRead.entries : [],
      medical_documents: documents ?? [],
    };
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="health-profile-export.json"`,
      },
    });
  }

  const painMapOverridesByRegion: Record<string, { question_key: string; question_text: string }[]> = {};
  for (const row of painMapOverrideRows ?? []) {
    (painMapOverridesByRegion[row.region] ??= []).push(row);
  }

  const patientName = profile?.full_name ?? "Patient";
  const status = (conditionProfile?.status ?? "not_started") as ConditionProfileStatus;
  const answers = (conditionProfile?.data ?? {}) as Record<string, string>;
  const questions = mergeIntakeQuestionOverrides(
    questionsForSpecialty(specialty),
    intakeOverrideRows ?? [],
    specialty
  );

  // Who spoke for the child. Resolved here rather than in
  // healthProfilePdf.ts so that module never learns question key names.
  const caregiverName = (answers.peds_caregiver_name ?? "").trim();
  const respondent = caregiverName
    ? { name: caregiverName, relationship: (answers.peds_caregiver_relationship ?? "").trim() }
    : null;

  // A patient re-triaged from one specialty to another keeps the previous
  // set's answers on file (hidden on screen, never deleted). They belong
  // in a document handed to another clinician -- losing a whole prior
  // history silently is a clinical loss, not a simplification.
  const earlierProfiles = CONDITION_SPECIALTIES.filter((s) => s.key !== specialty)
    .map((s) => ({
      specialtyLabel: s.label,
      entries: visibleQuestions(INTAKE_QUESTIONS_BY_SPECIALTY[s.key], answers)
        .filter((q) => (answers[q.key] ?? "").trim())
        .map((q) => ({ label: q.label, value: (answers[q.key] ?? "").trim() })),
    }))
    .filter((s) => s.entries.length > 0);

  // The latest paediatric examination, with the child's age (corrected while
  // it applies) and the age each milestone came at -- all worked out here,
  // so healthProfilePdf.ts prints lines and never learns a milestone.
  const pedsExams = isPeds ? parsePedsAssessments(pedsResult.rows) : [];
  const pedsLatest = pedsExams[0] ?? null;
  const birthDate = typeof profile?.date_of_birth === "string" ? profile.date_of_birth : null;
  const pedsChart = isPeds
    ? pedsMilestoneWindows({
        findings: pedsLatest?.findings ?? null,
        birthDate,
        weeksAtBirth: parseWeeksAtBirth(answers[PEDS_WEEKS_AT_BIRTH_KEY]),
        todayIso: pedsTodayIso(Date.now()),
      })
    : null;
  const pedsAgeText = pedsChart
    ? (pedsAgeLine(pedsChart.age) ??
      (pedsChart.age.status === "implausible"
        ? "the date of birth on file does not look like a child's; please check it with the clinic"
        : "date of birth not on file"))
    : null;

  // Strength and balance care / Heart and lung rehabilitation (phase 6a):
  // the fall-risk level with its rule, or the safety limits and vitals,
  // shaped by the same view the screens use from the reads above -- every
  // one of which was checked, so this section is complete or the export
  // was already refused.
  let conditionSection: { heading: string; lines: string[]; note: string } | null = null;
  let carerLine: string | null = null;
  if ((isGeriatric || isCardio) && diaryRead?.status === "ok") {
    const nowMs = Date.now();
    const reads: MeasuredProfileReads = {
      measurements: { status: "ok", rows: measurementsRead.rows },
      goals: goalsRead,
      careStatus: { status: "ok", events: careStatusRead.events },
      diary: { status: "ok", entries: diaryRead.entries },
      intakeHistory: {
        status: "ok",
        rows: changeRequests.map((r) => ({
          proposed_data: (r.proposed_data ?? null) as Record<string, string> | null,
          reviewed_at: r.reviewed_at ?? null,
          created_at: r.created_at,
          status: r.status,
        })),
      },
      licence: { status: "ok", keys: [] },
      person: {
        status: "ok",
        birthDate: typeof profile?.date_of_birth === "string" ? profile.date_of_birth : null,
        gender: typeof profile?.gender === "string" ? profile.gender : null,
      },
      nowMs,
      todayIso: clinicDateKey(nowMs),
    };
    if (isGeriatric) {
      const view = shapeGeriatricView(reads, { intake: answers, voice: "clinician" });
      conditionSection = geriatricExportSection(view, formatClinicDate);
      carerLine = view.carerLine;
    } else {
      const view = shapeCardioView({ ...reads, equation: equationRead ?? { status: "unreadable" } }, { intake: answers, voice: "clinician" });
      conditionSection = cardioExportSection(view, formatClinicDate);
    }
  }

  const progress = buildProgressExport({
    profileKind,
    careStatus: { phase: careStatusRead.phase, override: careStatusRead.override, summary: careStatusRead.summary },
    points: parseMeasurementRows(measurementsRead.rows),
    goals: goalsRead.goals,
    milestones: goalsRead.milestones,
    nowMs: Date.now(),
  });

  const pdf = await buildHealthProfilePdf({
    siteName: parseAdminSettings(settingsRow).siteName,
    patientName,
    patientCode: profile?.patient_code ?? null,
    patientEmail: profile?.email ?? null,
    exportedAt: new Date(),
    status: CONDITION_STATUS_LABEL[status],
    specialtyLabel: specialtyLabel(specialty),
    respondent,
    progress,
    diary: diaryRead ? buildDiaryExport(diaryRead.entries, { profileKind, nowMs: Date.now() }) : null,
    conditionSection,
    carerLine,
    questions,
    answers,
    earlierProfiles,
    showExaminations: isOrtho,
    assessments: (assessments ?? []).map((a) => ({
      region: a.region,
      side: a.side,
      pain_percent: a.pain_percent,
      submitted_by_role: a.submitted_by_role,
      answers: (a.answers ?? null) as Record<string, string> | null,
      created_at: a.created_at,
    })),
    painMapOverridesByRegion,
    showNeuroExaminations: isNeuro,
    neuroExams: parseNeuroAssessments(neuroResult.rows).map((exam) => ({
      created_at: exam.createdAt,
      submitted_by_role: exam.submittedByRole,
      lines: describeNeuroExamForText(exam.findings),
    })),
    showPedsExamination: isPeds,
    pedsAgeLine: pedsAgeText,
    pedsVerificationNote: isPeds ? PEDS_WINDOWS_VERIFICATION_NOTE : null,
    pedsExam:
      pedsLatest && pedsChart
        ? {
            created_at: pedsLatest.createdAt,
            submitted_by_role: pedsLatest.submittedByRole,
            lines: describePedsExamForText(pedsLatest.findings, {
              achievedAgeLabel: (key) => {
                const row = pedsChart.rows.find((r) => r.key === key);
                return row ? achievedAgeLabel(row) : null;
              },
            }),
            earlierCount: pedsExams.length - 1,
          }
        : null,
    documents: (documents ?? []).map((d) => ({
      title: d.title,
      document_type:
        MEDICAL_DOCUMENT_TYPE_LABEL[d.document_type as MedicalDocumentType] ?? "Report",
      taken_on: d.taken_on,
      created_at: d.created_at,
    })),
  });

  // Uint8Array -> a fresh ArrayBuffer: pdf-lib's view can sit inside a
  // larger pooled buffer, and handing that straight to NextResponse would
  // serve whatever else happens to share it.
  const body = pdf.slice().buffer as ArrayBuffer;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${healthProfilePdfFilename(patientName, profile?.patient_code ?? null)}"`,
      // A medical record should not sit in a shared cache.
      "Cache-Control": "private, no-store",
    },
  });
}

type ChangeRequestExportRow = {
  submitted_by_role: string;
  proposed_data: unknown;
  status: string;
  admin_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type DocumentExportRow = {
  title: string;
  document_type: string;
  taken_on: string | null;
  created_at: string;
};

function exportUnavailable(): NextResponse {
  return NextResponse.json(
    {
      error:
        "We couldn't put your full health record together just now, so nothing was exported. Please try again in a moment.",
    },
    { status: 503 }
  );
}
