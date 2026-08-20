import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import DashboardShell from "@/components/dashboard/DashboardShell";
import ConditionIntakePanel from "@/components/profile/ConditionIntakePanel";
import PainMapView from "@/components/profile/PainMapView";
import PainComparisonView from "@/components/profile/PainComparisonView";
import HealthProfileActions from "@/components/profile/HealthProfileActions";
import { buildPatientNavItems } from "@/lib/dashboardNavItems";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import {
  INTAKE_QUESTIONS,
  INTAKE_QUESTIONS_VERSION,
  mergeIntakeQuestionOverrides,
  parseAreaPain,
  type ConditionProfileStatus,
} from "@/lib/conditionIntake";

export const metadata: Metadata = {
  title: "Health Profile | Dr. Pooja's Physio",
};

const STATUS_BANNER_STYLE: Record<ConditionProfileStatus, string> = {
  not_started: "bg-slate-50 border-slate-200 text-slate-600",
  draft: "bg-slate-50 border-slate-200 text-slate-600",
  pending_review: "bg-amber-50 border-amber-200 text-amber-700",
  active: "bg-emerald-50 border-emerald-200 text-emerald-700",
};

// What the four statuses mean *to a patient*, in their terms -- the raw
// CONDITION_STATUS_LABEL wording ("Pending admin review") is the admin's
// vocabulary and stays on the admin/therapist screens.
const STATUS_HEADLINE: Record<ConditionProfileStatus, string> = {
  not_started: "You haven't told us about your condition yet",
  draft: "You started this and haven't sent it in yet",
  pending_review: "Sent in — the clinic is checking it",
  active: "Your therapist has your answers",
};

export default async function PatientHealthProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const [
    { data: profile },
    { data: patientCodeRow },
    { data: conditionProfile },
    { data: lastRequest },
    { data: assessments },
    { count: ownedPackagesCount },
    { count: availablePackagesCount },
    { data: settingsRow },
    { data: intakeOverrideRows },
    { count: onlineSessionCount },
    { count: homeVisitCount },
    { count: ownedHomeVisitCount },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name, email, avatar_url").eq("id", user.id).single(),
    supabase.from("profiles").select("patient_code").eq("id", user.id).maybeSingle(),
    supabase
      .from("patient_condition_profiles")
      .select("data, draft_data, schema_version, status")
      .eq("patient_id", user.id)
      .maybeSingle(),
    supabase
      .from("condition_change_requests")
      .select("status, admin_notes, proposed_data, created_at")
      .eq("patient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("pain_assessments")
      .select("region, side, pain_percent, created_at, submitted_by_role")
      .eq("patient_id", user.id),
    supabase
      .from("patient_package_purchases")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", user.id)
      .eq("payment_status", "paid"),
    supabase
      .from("treatment_category_packages")
      .select("id", { count: "exact", head: true })
      .eq("active", true),
    supabase.from("site_settings").select(SITE_SETTINGS_SELECT).maybeSingle(),
    supabase.from("intake_question_templates").select("question_key, question_text, required"),

    // The Home Visit nav entries are conditional, and every page rendering
    // this shell has to pass the same booleans or the sidebar gains and
    // loses entries as you move between them. Count-only queries: a round
    // trip each, no rows.
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", user.id)
      .not("visit_mode", "eq", "home_visit"),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", user.id)
      .eq("visit_mode", "home_visit"),
    supabase
      .from("home_visit_package_purchases")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", user.id)
      .eq("payment_status", "paid"),
  ]);

  const questions = mergeIntakeQuestionOverrides(INTAKE_QUESTIONS, intakeOverrideRows ?? []);
  const adminSettings = parseAdminSettings(settingsRow);
  const navItems = buildPatientNavItems({
    hasOwnedPackages: !!ownedPackagesCount && ownedPackagesCount > 0,
    hasAvailablePackages:
      adminSettings.sessionPackagesVisible && !!availablePackagesCount && availablePackagesCount > 0,
    hasOnlineSessions: (onlineSessionCount ?? 0) > 0,
    hasHomeVisits: (homeVisitCount ?? 0) > 0,
    hasOwnedHomeVisitPackages: (ownedHomeVisitCount ?? 0) > 0,
  });

  const status = (conditionProfile?.status ?? "not_started") as ConditionProfileStatus;
  const currentData = (conditionProfile?.data ?? {}) as Record<string, string>;
  const isPending = status === "pending_review";
  const isOutdatedVersion =
    status === "active" &&
    typeof conditionProfile?.schema_version === "number" &&
    conditionProfile.schema_version < INTAKE_QUESTIONS_VERSION;
  // Resume priority: an in-progress autosaved draft beats everything else
  // (it's the most recent thing the patient was actually doing); then a
  // declined submission's answers, so the submitter edits and resubmits
  // instead of retyping (see condition_change_requests' "preserve
  // proposed_data on decline" design); otherwise the last approved data.
  const draftData = (conditionProfile?.draft_data ?? null) as Record<string, string> | null;
  const hasDraft = !!draftData && Object.values(draftData).some(Boolean);
  const formInitialData = hasDraft
    ? draftData!
    : lastRequest?.status === "declined"
      ? ((lastRequest.proposed_data ?? {}) as Record<string, string>)
      : currentData;

  const showDebugNav =
    process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV === "true" ||
    (process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV !== "false" && process.env.NODE_ENV !== "production");

  return (
    <DashboardShell
      brandLabel="Patient Panel"
      brandIcon="fa-user-injured"
      basePath="/patient/dashboard"
      navItems={navItems}
      userName={profile?.full_name ?? "Patient"}
      userEmail={profile?.email ?? user.email ?? ""}
      userAvatarUrl={profile?.avatar_url ?? null}
      userCode={patientCodeRow?.patient_code ?? null}
      offsetTop={showDebugNav}
      sessionTimeoutMinutes={adminSettings.sessionTimeoutMinutes}
      realtimeTables={[
        "patient_condition_profiles",
        "condition_change_requests",
        "pain_assessments",
        "intake_question_templates",
      ]}
      headerTitle="Health Profile"
      headerSubtitle="What you told us about your condition, and what your therapist found."
    >
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex justify-end">
          <HealthProfileActions />
        </div>

        <div className={`rounded-2xl border p-4 text-sm font-semibold ${STATUS_BANNER_STYLE[status]}`}>
          {STATUS_HEADLINE[status]}
          {isPending && lastRequest?.status === "pending" && (
            <p className="mt-1 text-xs font-normal">
              Sent {new Date(lastRequest.created_at).toLocaleString()}. Until it&apos;s checked, your therapist
              still sees your previous answers — you can edit again once it clears.
            </p>
          )}
          {!isPending && lastRequest?.status === "declined" && (
            <p className="mt-1 text-xs font-normal">
              Your last submission came back with a note: {lastRequest.admin_notes}. Open the questions again to
              fix it and resend.
            </p>
          )}
          {!isPending && isOutdatedVersion && (
            <p className="mt-1 text-xs font-normal">
              We&apos;ve changed some of these questions since you answered — worth a quick look.
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-lg text-slate-800 mb-1">1. What you told us</h2>
          <p className="text-xs text-slate-500 mb-4">
            A few questions about what hurts, asked one at a time. Your therapist and the clinic&apos;s admin read
            this — nobody else.
          </p>
          <ConditionIntakePanel
            questions={questions}
            endpoint="/api/patient/condition-profile/submit"
            draftEndpoint="/api/patient/condition-profile/save-draft"
            currentData={currentData}
            formInitialData={formInitialData}
            locked={isPending}
            lockedMessage="You can edit again as soon as the clinic finishes checking your last submission."
          />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-lg text-slate-800 mb-1">2. What your therapist found</h2>
          <p className="text-xs text-slate-500 mb-4">
            Your therapist records this after examining you, so it fills in on its own after a session. View only
            — nothing for you to do here.
          </p>
          <PainMapView assessments={assessments ?? []} />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-lg text-slate-800 mb-1">3. The two side by side</h2>
          <p className="text-xs text-slate-500 mb-4">
            Where you said it hurts and where your therapist found it, on one figure — how progress shows up over
            time.
          </p>
          <PainComparisonView assessments={assessments ?? []} areaPain={parseAreaPain(currentData.area_pain)} />
        </div>
      </div>
    </DashboardShell>
  );
}
