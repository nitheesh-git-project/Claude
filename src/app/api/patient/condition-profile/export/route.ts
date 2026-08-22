import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildHealthProfilePdf, healthProfilePdfFilename } from "@/lib/healthProfilePdf";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import {
  CONDITION_STATUS_LABEL,
  INTAKE_QUESTIONS,
  mergeIntakeQuestionOverrides,
  type ConditionProfileStatus,
} from "@/lib/conditionIntake";
import { MEDICAL_DOCUMENT_TYPE_LABEL, type MedicalDocumentType } from "@/lib/medicalDocuments";

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

  const [
    { data: profile },
    { data: conditionProfile },
    { data: changeRequests },
    { data: assessments },
    { data: documents },
    { data: intakeOverrideRows },
    { data: painMapOverrideRows },
    { data: settingsRow },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name, email, patient_code").eq("id", user.id).single(),
    supabase
      .from("patient_condition_profiles")
      .select("data, schema_version, status, updated_at")
      .eq("patient_id", user.id)
      .maybeSingle(),
    supabase
      .from("condition_change_requests")
      .select("submitted_by_role, proposed_data, status, admin_notes, created_at")
      .eq("patient_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("pain_assessments")
      .select("region, side, pain_percent, submitted_by_role, answers, created_at")
      .eq("patient_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("patient_medical_documents")
      .select("title, document_type, taken_on, created_at")
      .eq("patient_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("intake_question_templates").select("question_key, question_text, required"),
    supabase.from("pain_map_question_templates").select("region, question_key, question_text"),
    supabase.from("site_settings").select(SITE_SETTINGS_SELECT).maybeSingle(),
  ]);

  if (request.nextUrl.searchParams.get("format") === "json") {
    const payload = {
      exported_at: new Date().toISOString(),
      patient: {
        name: profile?.full_name ?? null,
        email: profile?.email ?? null,
        patient_code: profile?.patient_code ?? null,
      },
      condition_profile: conditionProfile ?? null,
      submission_history: changeRequests ?? [],
      pain_map_assessments: assessments ?? [],
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

  const pdf = await buildHealthProfilePdf({
    siteName: parseAdminSettings(settingsRow).siteName,
    patientName,
    patientCode: profile?.patient_code ?? null,
    patientEmail: profile?.email ?? null,
    exportedAt: new Date(),
    status: CONDITION_STATUS_LABEL[status],
    questions: mergeIntakeQuestionOverrides(INTAKE_QUESTIONS, intakeOverrideRows ?? []),
    answers: (conditionProfile?.data ?? {}) as Record<string, string>,
    assessments: (assessments ?? []).map((a) => ({
      region: a.region,
      side: a.side,
      pain_percent: a.pain_percent,
      submitted_by_role: a.submitted_by_role,
      answers: (a.answers ?? null) as Record<string, string> | null,
      created_at: a.created_at,
    })),
    painMapOverridesByRegion,
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
