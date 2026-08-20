import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import DashboardShell from "@/components/dashboard/DashboardShell";
import ConditionIntakePanel from "@/components/profile/ConditionIntakePanel";
import PainMapExplorer from "@/components/profile/PainMapExplorer";
import PainTrendChart from "@/components/profile/PainTrendChart";
import HealthSnapshotStrip from "@/components/profile/HealthSnapshotStrip";
import HealthProfileSteps from "@/components/profile/HealthProfileSteps";
import HealthProfileActions from "@/components/profile/HealthProfileActions";
import { buildPatientNavItems } from "@/lib/dashboardNavItems";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { healthSnapshot, painTrendSeries } from "@/lib/healthProfileSummary";
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

const STATUS_ICON: Record<ConditionProfileStatus, string> = {
  not_started: "fa-clipboard-question",
  draft: "fa-pen-to-square",
  pending_review: "fa-hourglass-half",
  active: "fa-circle-check",
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

  const selfReportedAreas = parseAreaPain(currentData.area_pain);
  const snapshot = healthSnapshot({ questions, data: currentData, assessments: assessments ?? [] });
  const trendPoints = painTrendSeries(assessments ?? []);

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
      <div className="mx-auto max-w-5xl space-y-5">
        <div
          className={`flex items-start gap-3 rounded-2xl border p-4 ${STATUS_BANNER_STYLE[status]} print:hidden`}
        >
          <i aria-hidden className={`fa-solid ${STATUS_ICON[status]} mt-0.5 text-sm`} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{STATUS_HEADLINE[status]}</p>
            {isPending && lastRequest?.status === "pending" && (
              <p className="mt-1 text-xs font-normal">
                Sent {new Date(lastRequest.created_at).toLocaleString()}. Until it&apos;s checked, your therapist
                still sees your previous answers — you can edit again once it clears.
              </p>
            )}
            {!isPending && lastRequest?.status === "declined" && (
              <p className="mt-1 text-xs font-normal">
                Your last submission came back with a note: {lastRequest.admin_notes}. Open the questions again
                to fix it and resend.
              </p>
            )}
            {!isPending && isOutdatedVersion && (
              <p className="mt-1 text-xs font-normal">
                We&apos;ve changed some of these questions since you answered — worth a quick look.
              </p>
            )}
          </div>
          <HealthProfileActions />
        </div>

        <HealthSnapshotStrip snapshot={snapshot} />

        <HealthProfileSteps />

        {/* Two columns on a wide screen, one on a phone: what you said on
            the left, what the exam found on the right. The body map is
            the heavier of the two, so it gets the sticky column -- a
            patient scrolling their own answers keeps the figure in view. */}
        <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr] lg:items-start">
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4">
                <h2 className="font-display text-lg font-bold text-slate-800">What you told us</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Your own words, answered one question at a time. Only your therapist and the clinic&apos;s
                  admin can read this.
                </p>
              </div>
              <ConditionIntakePanel
                questions={questions}
                endpoint="/api/patient/condition-profile/submit"
                draftEndpoint="/api/patient/condition-profile/save-draft"
                currentData={currentData}
                formInitialData={formInitialData}
                locked={isPending}
                lockedMessage="You can edit again as soon as the clinic finishes checking your last submission."
              />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-3">
                <h2 className="font-display text-lg font-bold text-slate-800">Are you getting better?</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  The average pain your therapist measured at each exam, over time.
                </p>
              </div>
              <PainTrendChart points={trendPoints} />
            </section>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:sticky lg:top-4">
            <div className="mb-4">
              <h2 className="font-display text-lg font-bold text-slate-800">Your body map</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Filled in by your therapist after examining you — tap any marked point for that area&apos;s
                detail. Nothing here for you to fill in.
              </p>
            </div>
            <PainMapExplorer assessments={assessments ?? []} areaPain={selfReportedAreas} />
          </section>
        </div>
      </div>
    </DashboardShell>
  );
}
