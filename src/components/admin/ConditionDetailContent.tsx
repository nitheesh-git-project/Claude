import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import ConditionRequestActions from "@/components/admin/ConditionRequestActions";
import ConditionAccessActions from "@/components/admin/ConditionAccessActions";
import ConditionDirectEditForm from "@/components/admin/ConditionDirectEditForm";
import PainMapExplorer from "@/components/profile/PainMapExplorer";
import MedicalDocumentsPanel from "@/components/profile/MedicalDocumentsPanel";
import type { MedicalDocumentRow } from "@/lib/medicalDocuments";
import SurfaceCard from "@/components/dashboard/SurfaceCard";
import SessionNoteHistory from "@/components/therapist/SessionNoteHistory";
import type { SessionNoteRow } from "@/lib/sessionNotes";
import {
  INTAKE_QUESTIONS,
  INTAKE_QUESTIONS_VERSION,
  CONDITION_STATUS_LABEL,
  mergeIntakeQuestionOverrides,
  parseAreaPain,
  type ConditionProfileStatus,
} from "@/lib/conditionIntake";
import { PAIN_MAP_REGIONS, type QuestionOverrideRow } from "@/lib/painMap";

// A plain module-level helper (not called inline in the component body)
// so the aging indicator's "as of render time" Date.now() read doesn't
// trip the impure-function-during-render lint rule -- see
// admin/dashboard/page.tsx's identical nowTimestamp() for the same reasoning.
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

// Shared body for both the standalone /admin/dashboard/conditions/[id]
// page and its @modal intercepted overlay — same split as
// PatientDetailContent for the same reason (Bug 10).
export default async function ConditionDetailContent({ id }: { id: string }) {
  const admin = createAdminClient();

  const [
    { data: patient },
    { data: profile },
    { data: changeRequests },
    { data: grants },
    { data: assessments },
    { data: intakeOverrideRows },
    { data: painMapOverrideRows },
    { data: sessionNoteRows },
    { data: medicalDocuments },
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
    admin
      .from("pain_assessments")
      .select("id, region, side, pain_percent, submitted_by_role, created_at")
      .eq("patient_id", id)
      .order("created_at", { ascending: false }),
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
    notFound();
  }

  const questions = mergeIntakeQuestionOverrides(INTAKE_QUESTIONS, intakeOverrideRows ?? []);
  const painMapOverridesByRegion: Record<string, QuestionOverrideRow[]> = {};
  for (const row of painMapOverrideRows ?? []) {
    (painMapOverridesByRegion[row.region] ??= []).push(row);
  }

  const therapistIds = [...new Set((grants ?? []).map((g) => g.therapist_id))];
  const { data: therapists } =
    therapistIds.length > 0
      ? await admin.from("profiles").select("id, full_name").in("id", therapistIds)
      : { data: [] as { id: string; full_name: string }[] };
  const therapistNameById = new Map((therapists ?? []).map((t) => [t.id, t.full_name]));

  const status = (profile?.status ?? "not_started") as ConditionProfileStatus;
  const currentData = (profile?.data ?? {}) as Record<string, string>;
  const isOutdatedVersion =
    status === "active" && typeof profile?.schema_version === "number" && profile.schema_version < INTAKE_QUESTIONS_VERSION;
  const pendingRequest = (changeRequests ?? []).find((r) => r.status === "pending");
  const requestHistory = (changeRequests ?? []).filter((r) => r.status !== "pending");
  const pendingDaysOld = pendingRequest ? daysSince(pendingRequest.created_at) : 0;

  const requestedGrants = (grants ?? []).filter((g) => g.status === "requested");
  const approvedGrants = (grants ?? []).filter((g) => g.status === "approved");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{patient.full_name}</h1>
        <p className="text-xs text-slate-500">{patient.email}</p>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold text-lg text-slate-800">Patient Care Intake</h2>
          <div className="flex items-center gap-2">
            {status === "active" && (
              <span className="rounded-full bg-slate-100 px-2 py-1 font-mono text-[10px] font-semibold text-slate-400">
                v{profile?.schema_version ?? 1}
              </span>
            )}
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              {CONDITION_STATUS_LABEL[status]}
            </span>
          </div>
        </div>

        {isOutdatedVersion && (
          <p className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Answered under an earlier version of this questionnaire (v{profile?.schema_version} vs current v
            {INTAKE_QUESTIONS_VERSION}) — question wording may have changed since.
          </p>
        )}

        {pendingRequest && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-2">
              <span>
                Submitted by {pendingRequest.submitted_by_role} —{" "}
                {new Date(pendingRequest.created_at).toLocaleString()}
              </span>
              {pendingDaysOld > 3 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                  Waiting {pendingDaysOld} days
                </span>
              )}
            </p>
            <dl className="space-y-1 mb-3">
              {questions.map((q) => {
                const value = (pendingRequest.proposed_data as Record<string, string>)[q.key];
                if (!value) return null;
                if (q.inputType === "area_pain_list") {
                  const areas = parseAreaPain(value);
                  if (areas.length === 0) return null;
                  return (
                    <div key={q.key} className="text-xs">
                      <dt className="font-semibold text-slate-600">{q.label}</dt>
                      <dd className="text-slate-700">
                        {areas
                          .map((a) => {
                            const label = PAIN_MAP_REGIONS.find((r) => r.key === a.region)?.label ?? a.region;
                            const base = `${label}${a.side !== "na" ? ` (${a.side})` : ""}: ${a.pain}/10`;
                            return a.note ? `${base} — "${a.note}"` : base;
                          })
                          .join(" · ")}
                      </dd>
                    </div>
                  );
                }
                return (
                  <div key={q.key} className="text-xs">
                    <dt className="font-semibold text-slate-600">{q.label}</dt>
                    <dd className="text-slate-700">{value}</dd>
                  </div>
                );
              })}
            </dl>
            <ConditionRequestActions requestId={pendingRequest.id} />
          </div>
        )}

        <p className="text-xs font-semibold text-slate-500 mb-2">Current (approved) data — admin can edit directly</p>
        <ConditionDirectEditForm
          questions={questions}
          patientId={id}
          currentData={currentData}
          disabled={!!pendingRequest}
        />

        {requestHistory.length > 0 && (
          <details className="mt-5">
            <summary className="text-xs font-semibold text-slate-500 cursor-pointer">
              Review history ({requestHistory.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {requestHistory.map((r) => (
                <li key={r.id} className="text-xs text-slate-600 border-t border-slate-100 pt-2">
                  {r.status === "approved" ? "Approved" : "Declined"} — submitted by {r.submitted_by_role},{" "}
                  {new Date(r.created_at).toLocaleString()}
                  {r.admin_notes && <p className="text-slate-500">Note: {r.admin_notes}</p>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-4">Therapist Access</h2>
        {requestedGrants.length === 0 && approvedGrants.length === 0 ? (
          <p className="text-xs text-slate-500">No therapist has requested access to this patient&apos;s condition data.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {[...requestedGrants, ...approvedGrants].map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {therapistNameById.get(g.therapist_id) ?? g.therapist_id}
                  </p>
                  <p className="text-xs text-slate-400">
                    {g.status === "requested" ? "Requested" : "Approved"} —{" "}
                    {new Date(g.requested_at).toLocaleString()}
                  </p>
                </div>
                <ConditionAccessActions grantId={g.id} status={g.status as "requested" | "approved"} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <SurfaceCard
        title="Test reports and scans"
        icon="fa-folder-open"
        subtitle="Uploaded by the patient themselves. Deleting one is the patient's own call, so there is no admin delete here."
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
        subtitle="Written by the treating therapist after each session. Clinician-only — the patient cannot see these, in the app or in their data export."
      >
        <SessionNoteHistory
          notes={(sessionNoteRows ?? []) as SessionNoteRow[]}
          therapistNameById={therapistNameById}
          emptyBody="Nothing recorded yet. Notes appear here as therapists write them up after delivered sessions."
        />
      </SurfaceCard>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Pain Map</h2>
        <p className="text-xs text-slate-500 mb-4">
          Exam findings, and the same figure switched to compare them against what the patient reported.
        </p>
        {/* Same one surface and the same recording dialog the therapist
            uses -- an admin entering an exam on someone's behalf should be
            filling in the identical form, not a second one that can drift. */}
        <PainMapExplorer
          assessments={assessments ?? []}
          areaPain={parseAreaPain(currentData.area_pain)}
          record={{
            endpoint: "/api/admin/pain-assessments/submit",
            patientId: id,
            overridesByRegion: painMapOverridesByRegion,
          }}
        />
        <p className="mt-3 text-xs text-slate-400">
          Recording here posts live immediately, same as a therapist&apos;s own entry — it adds a new
          reading rather than editing any past one, since Pain Map history is append-only.
        </p>
      </section>
    </div>
  );
}
