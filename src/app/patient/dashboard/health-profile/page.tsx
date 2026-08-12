import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import DashboardShell from "@/components/dashboard/DashboardShell";
import ConditionIntakeForm from "@/components/profile/ConditionIntakeForm";
import PainMapSummary from "@/components/profile/PainMapSummary";
import { buildPatientNavItems } from "@/lib/dashboardNavItems";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { CONDITION_STATUS_LABEL, type ConditionProfileStatus } from "@/lib/conditionIntake";

export const metadata: Metadata = {
  title: "Health Profile | Dr. Pooja's Physio",
};

const STATUS_BANNER_STYLE: Record<ConditionProfileStatus, string> = {
  not_started: "bg-slate-50 border-slate-200 text-slate-600",
  draft: "bg-slate-50 border-slate-200 text-slate-600",
  pending_review: "bg-amber-50 border-amber-200 text-amber-700",
  active: "bg-emerald-50 border-emerald-200 text-emerald-700",
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
  ] = await Promise.all([
    supabase.from("profiles").select("full_name, email, avatar_url").eq("id", user.id).single(),
    supabase.from("profiles").select("patient_code").eq("id", user.id).maybeSingle(),
    supabase.from("patient_condition_profiles").select("data, status").eq("patient_id", user.id).maybeSingle(),
    supabase
      .from("condition_change_requests")
      .select("status, admin_notes, proposed_data, created_at")
      .eq("patient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("pain_assessments")
      .select("region, side, pain_percent, created_at")
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
  ]);

  const adminSettings = parseAdminSettings(settingsRow);
  const navItems = buildPatientNavItems({
    hasOwnedPackages: !!ownedPackagesCount && ownedPackagesCount > 0,
    hasAvailablePackages:
      adminSettings.sessionPackagesVisible && !!availablePackagesCount && availablePackagesCount > 0,
  });

  const status = (conditionProfile?.status ?? "not_started") as ConditionProfileStatus;
  const currentData = (conditionProfile?.data ?? {}) as Record<string, string>;
  const isPending = status === "pending_review";
  // A declined submission's answers stay loaded in the form so the
  // submitter edits and resubmits instead of retyping everything — see
  // condition_change_requests' "preserve proposed_data on decline" design.
  const formInitialData =
    lastRequest?.status === "declined"
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
      realtimeTables={["patient_condition_profiles", "condition_change_requests", "pain_assessments"]}
      headerTitle="Health Profile"
      headerSubtitle="Your condition history and your therapist's pain assessments."
    >
      <div className="max-w-2xl mx-auto space-y-6">
        <div className={`rounded-2xl border p-4 text-sm font-semibold ${STATUS_BANNER_STYLE[status]}`}>
          {CONDITION_STATUS_LABEL[status]}
          {isPending && lastRequest?.status === "pending" && (
            <p className="mt-1 text-xs font-normal">
              Submitted {new Date(lastRequest.created_at).toLocaleString()} — an admin will review it shortly.
              Your previous answers below are still what your therapist sees until then.
            </p>
          )}
          {!isPending && lastRequest?.status === "declined" && (
            <p className="mt-1 text-xs font-normal">
              Your last submission was declined: {lastRequest.admin_notes}. You can edit and resubmit below.
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-lg text-slate-800 mb-1">Your Condition</h2>
          <p className="text-xs text-slate-500 mb-4">
            Tell us about what brought you here — your therapist and admin can see this.
          </p>
          <ConditionIntakeForm
            endpoint="/api/patient/condition-profile/submit"
            currentData={formInitialData}
            disabled={isPending}
          />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-lg text-slate-800 mb-1">Pain Map</h2>
          <p className="text-xs text-slate-500 mb-4">
            Filled in by your therapist after an exam — you can&apos;t edit this, only view it.
          </p>
          <PainMapSummary assessments={assessments ?? []} />
        </div>
      </div>
    </DashboardShell>
  );
}
