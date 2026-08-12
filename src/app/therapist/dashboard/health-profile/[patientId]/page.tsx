import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardShell from "@/components/dashboard/DashboardShell";
import ConditionIntakeForm from "@/components/profile/ConditionIntakeForm";
import PainMapView from "@/components/profile/PainMapView";
import PainAssessmentForm from "@/components/therapist/PainAssessmentForm";
import RequestConditionAccessButton from "@/components/therapist/RequestConditionAccessButton";
import { THERAPIST_NAV_ITEMS } from "@/lib/dashboardNavItems";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { CONDITION_STATUS_LABEL, type ConditionProfileStatus } from "@/lib/conditionIntake";
import type { QuestionOverrideRow } from "@/lib/painMap";

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
  // authorization, same reasoning as /api/packages/purchase-detail.
  const [
    { data: profile },
    { data: therapistCodeRow },
    { data: patient },
    { data: conditionProfile },
    { data: lastRequest },
    { data: assessments },
    { data: grant },
    { data: overrideRows },
    { data: settingsRow },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).single(),
    supabase.from("profiles").select("therapist_code").eq("id", user.id).maybeSingle(),
    supabase.from("profiles").select("id, full_name, email").eq("id", patientId).eq("role", "patient").maybeSingle(),
    supabase
      .from("patient_condition_profiles")
      .select("data, draft_data, status")
      .eq("patient_id", patientId)
      .maybeSingle(),
    supabase
      .from("condition_change_requests")
      .select("status, proposed_data, created_at")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("pain_assessments").select("region, side, pain_percent, created_at").eq("patient_id", patientId),
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
  ]);

  if (!patient) {
    notFound();
  }

  const overridesByRegion: Record<string, QuestionOverrideRow[]> = {};
  for (const row of overrideRows ?? []) {
    (overridesByRegion[row.region] ??= []).push(row);
  }

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
  const hasApprovedAccess = grant?.status === "approved";
  const adminSettings = parseAdminSettings(settingsRow);

  const showDebugNav =
    process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV === "true" ||
    (process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV !== "false" && process.env.NODE_ENV !== "production");

  return (
    <DashboardShell
      brandLabel="Therapist Panel"
      brandIcon="fa-user-doctor"
      basePath="/therapist/dashboard"
      navItems={THERAPIST_NAV_ITEMS}
      userName={profile?.full_name ?? "Therapist"}
      userEmail={user.email ?? ""}
      userAvatarUrl={profile?.avatar_url ?? null}
      userCode={therapistCodeRow?.therapist_code ?? null}
      offsetTop={showDebugNav}
      sessionTimeoutMinutes={adminSettings.sessionTimeoutMinutes}
      realtimeTables={["condition_access_grants", "patient_condition_profiles", "pain_assessments"]}
      headerTitle={patient.full_name}
      headerSubtitle={patient.email}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        <Link href="/therapist/dashboard/health-profile" className="text-xs text-teal-700 font-semibold">
          ← Back to Health Profiles
        </Link>

        {!hasApprovedAccess && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-bold text-lg text-slate-800 mb-1">Edit access</h2>
            {grant?.status === "requested" && (
              <p className="text-sm text-amber-700">Waiting for admin approval to edit this patient&apos;s data.</p>
            )}
            {grant?.status === "declined" && (
              <p className="text-sm text-slate-600">Your last access request was declined.</p>
            )}
            {(!grant || grant.status === "declined" || grant.status === "revoked") && (
              <div className="mt-2">
                <RequestConditionAccessButton patientId={patientId} />
              </div>
            )}
            <p className="text-xs text-slate-400 mt-3">
              You can already view everything below — approval is only needed to make changes.
            </p>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-bold text-lg text-slate-800">Patient Care Intake</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              {CONDITION_STATUS_LABEL[status]}
            </span>
          </div>
          {hasApprovedAccess ? (
            <ConditionIntakeForm
              endpoint="/api/therapist/condition-profile/submit"
              draftEndpoint="/api/therapist/condition-profile/save-draft"
              patientId={patientId}
              currentData={formInitialData}
              disabled={status === "pending_review"}
            />
          ) : (
            <p className="text-sm text-slate-600 whitespace-pre-line">
              {Object.values(currentData).some(Boolean)
                ? Object.entries(currentData)
                    .filter(([, v]) => v)
                    .map(([, v]) => v)
                    .join("\n")
                : "No intake submitted yet."}
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-lg text-slate-800 mb-4">Pain Map</h2>
          {hasApprovedAccess ? (
            <PainAssessmentForm
              patientId={patientId}
              assessments={assessments ?? []}
              overridesByRegion={overridesByRegion}
            />
          ) : (
            <PainMapView assessments={assessments ?? []} />
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
