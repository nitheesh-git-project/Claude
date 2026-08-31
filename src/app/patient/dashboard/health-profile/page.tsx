import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import DashboardShell from "@/components/dashboard/DashboardShell";
import ConditionIntakePanel from "@/components/profile/ConditionIntakePanel";
import SpecialtyExamPanel from "@/components/profile/SpecialtyExamPanel";
import SpecialtySnapshotStrip from "@/components/profile/SpecialtySnapshotStrip";
import PainTrendChart from "@/components/profile/PainTrendChart";
import IntakeTrendChart from "@/components/profile/IntakeTrendChart";
import HealthProfileSteps from "@/components/profile/HealthProfileSteps";
import HealthProfileActions from "@/components/profile/HealthProfileActions";
import MedicalDocumentsPanel from "@/components/profile/MedicalDocumentsPanel";
import CarePlanHistory from "@/components/therapist/CarePlanHistory";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCarePlanHistory } from "@/lib/carePlanServer";
import { buildPatientNavItems } from "@/lib/dashboardNavItems";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import {
  answerAuthorship,
  intakeTrendSeries,
  painTrendSeries,
  type AuthorshipRow,
  type IntakeTrendRow,
} from "@/lib/healthProfileSummary";
import type { MedicalDocumentRow } from "@/lib/medicalDocuments";
import type { PainAssessmentRow } from "@/lib/painMap";
import {
  intakeVersionForSpecialty,
  mergeIntakeQuestionOverrides,
  parseAreaPain,
  patientIntakeGate,
  questionsForSpecialty,
  type ConditionProfileStatus,
} from "@/lib/conditionIntake";
import {
  parseConditionSpecialty,
  specialtyPatientLabel,
} from "@/lib/conditionSpecialty";
import { isDebugNavVisible } from "@/lib/debugNavVisible";

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

// Before a therapist has filled this in, none of the four statuses above
// describes the screen: the patient has not failed to do anything, so an
// amber "not started" would be a to-do marker for a job that is not
// theirs. This is a state of its own, in the patient's terms.
const AWAITING_THERAPIST_HEADLINE = "Your therapist fills this in with you at your first session";

// "Your therapist has your answers" is the right line when the patient
// sent them. It is the wrong one the first time they see a record their
// therapist wrote -- it credits them with something they did not do, and
// this screen's whole job is being clear about who writes which half.
const THERAPIST_WROTE_IT_HEADLINE = "Your therapist filled this in with you";

export default async function PatientHealthProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  // Two-phase read. The specialty decides whether this page has a Pain
  // Map at all -- and for a neurological or paediatric profile it must not
  // merely hide it but never query pain_assessments in the first place, or
  // the "no dead props" rule is only cosmetic. That means knowing the
  // specialty before choosing what to fetch, which costs one extra round
  // trip on this page and the therapist's twin. `specialty` is also a new
  // column, so it is read on its own for the usual migration-tolerance
  // reason.
  const { data: specialtyRow } = await supabase
    .from("patient_condition_profiles")
    .select("specialty")
    .eq("patient_id", user.id)
    .maybeSingle();
  const specialty = parseConditionSpecialty(specialtyRow?.specialty);
  const isOrtho = specialty === "ortho";

  // Who left the autosaved draft. `draft_data` is one column shared by both
  // roles' autosave, so without this a therapist's abandoned half-edit is
  // announced back to the patient as their own unfinished work. New
  // column, so its own call.
  const { data: draftOwnerRow } = await supabase
    .from("patient_condition_profiles")
    .select("draft_saved_by_role")
    .eq("patient_id", user.id)
    .maybeSingle();
  const draftIsMine = draftOwnerRow?.draft_saved_by_role === "patient";

  const [
    { data: profile },
    { data: patientCodeRow },
    { data: conditionProfile },
    { data: lastRequest },
    { data: assessments },
    { data: intakeHistory },
    { data: medicalDocuments },
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
      .select("data, draft_data, schema_version, status, last_submitted_role")
      .eq("patient_id", user.id)
      .maybeSingle(),
    supabase
      .from("condition_change_requests")
      .select("status, admin_notes, proposed_data, created_at")
      .eq("patient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    isOrtho
      ? supabase
          .from("pain_assessments")
          .select("region, side, pain_percent, created_at, submitted_by_role")
          .eq("patient_id", user.id)
      : Promise.resolve({ data: [] as PainAssessmentRow[] }),
    // Two jobs from one read. It is the progress line for the specialties
    // with no exam layer -- every approved submission is a dated row, so
    // their headline figure can be read back out in order -- and it is how
    // the page knows who wrote each answer, so the counter can say "3
    // answered with your therapist" rather than implying four were left
    // blank. Nothing new is collected for either.
    supabase
      .from("condition_change_requests")
      .select("proposed_data, submitted_by_role, reviewed_at, created_at, status")
      .eq("patient_id", user.id)
      .eq("status", "approved")
      .order("created_at", { ascending: true }),
    supabase
      .from("patient_medical_documents")
      .select("id, title, document_type, taken_on, mime_type, size_bytes, created_at")
      .eq("patient_id", user.id)
      .order("created_at", { ascending: false }),
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
    supabase
      .from("intake_question_templates")
      .select("question_key, question_text, required, specialty"),

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

  const questions = mergeIntakeQuestionOverrides(
    questionsForSpecialty(specialty),
    intakeOverrideRows ?? [],
    specialty
  );
  const adminSettings = parseAdminSettings(settingsRow);
  // The sidebar must have the same shape on every screen, so these two
  // stand-alone pages resolve the Suggested Sessions entry the same way the
  // loader does. Counted rather than loaded -- the entry only needs to know
  // whether anything is waiting. Isolated and failure-tolerant: without the
  // care_plans table the entry is simply absent.
  const [{ count: activePlanCount }, { count: pendingSuggestionCount }] = await Promise.all([
    supabase
      .from("care_plans")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", user.id)
      .eq("status", "active"),
    supabase
      .from("session_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", user.id)
      .eq("status", "pending"),
  ]);

  const navItems = buildPatientNavItems({
    hasSuggestions: (activePlanCount ?? 0) > 0 || (pendingSuggestionCount ?? 0) > 0,
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
  const gate = patientIntakeGate({ data: currentData, status });
  const isOutdatedVersion =
    status === "active" &&
    typeof conditionProfile?.schema_version === "number" &&
    conditionProfile.schema_version < intakeVersionForSpecialty(specialty);
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

  const selfReportedAreas = isOrtho ? parseAreaPain(currentData.area_pain) : [];
  const trendPoints = painTrendSeries(assessments ?? []);
  const intakeTrend =
    isOrtho ? [] : intakeTrendSeries((intakeHistory ?? []) as IntakeTrendRow[], specialty);
  const authorship = answerAuthorship((intakeHistory ?? []) as AuthorshipRow[]);
  const milestoneCount =
    questions.find((q) => q.key === "peds_milestones")?.options?.length ?? 0;

  const showDebugNav = isDebugNavVisible();

  // Read with the admin client: a patient can select their own care_plans
  // through RLS, but not the therapist names attached to them
  // (profiles_select_own), which is the same lookup every dashboard makes
  // for a therapist's name.
  const carePlanAdmin = createAdminClient();
  const carePlanVersions = await loadCarePlanHistory(carePlanAdmin, user.id);
  const carePlanAuthorNames = new Map<string, string>();
  if (carePlanVersions.length > 0) {
    const { data: authors } = await carePlanAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", [...new Set(carePlanVersions.map((v) => v.authoredBy))]);
    for (const a of authors ?? []) carePlanAuthorNames.set(a.id, a.full_name);
  }

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
      headerSubtitle={
        gate.reason === "awaiting_therapist"
          ? "Your condition and your therapist's findings, once your first session has happened."
          : "Your condition, and what your therapist found."
      }
    >
      <div className="mx-auto max-w-5xl space-y-5">
        <div
          className={`flex items-start gap-3 rounded-2xl border p-4 ${
            gate.reason === "awaiting_therapist"
              ? "border-slate-200 bg-slate-50 text-slate-600"
              : STATUS_BANNER_STYLE[status]
          } print:hidden`}
        >
          <i
            aria-hidden
            className={`fa-solid ${
              gate.reason === "awaiting_therapist" ? "fa-user-doctor" : STATUS_ICON[status]
            } mt-0.5 text-sm`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {gate.reason === "awaiting_therapist"
                ? AWAITING_THERAPIST_HEADLINE
                : status === "active" && conditionProfile?.last_submitted_role === "therapist"
                  ? THERAPIST_WROTE_IT_HEADLINE
                  : STATUS_HEADLINE[status]}
            </p>
            {status === "active" &&
              conditionProfile?.last_submitted_role === "therapist" &&
              gate.canEdit && (
                <p className="mt-1 text-xs font-normal">
                  Read it over — if anything is not quite right, or you remember something later, you
                  can correct it yourself from here.
                </p>
              )}
            {gate.reason === "awaiting_therapist" && (
              <p className="mt-1 text-xs font-normal">
                They go through a short set of questions with you and write down your answers. It
                appears here straight away, and you can add to it from then on. In the meantime you
                can upload any scans or reports you already have — see below.
              </p>
            )}
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

        <SpecialtySnapshotStrip
          specialty={specialty}
          questions={questions}
          data={currentData}
          assessments={assessments ?? []}
          showProgress={!gate.canEdit}
        />

        {/* Full while the flow is still ahead of them; one line once they
            have written to the record themselves. */}
        <HealthProfileSteps
          specialty={specialty}
          collapsed={gate.canEdit && conditionProfile?.last_submitted_role === "patient"}
        />

        {/* Two columns on a wide screen, one on a phone: what you said on
            the left, what the exam found on the right. The body map is
            the heavier of the two, so it gets the sticky column -- a
            patient scrolling their own answers keeps the figure in view. */}
        <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr] lg:items-start">
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4">
                <h2 className="font-display text-lg font-bold text-slate-800">Your condition</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {gate.canEdit
                    ? `Recorded as ${specialtyPatientLabel(specialty).toLowerCase()}. Only your therapist and the clinic can read this.`
                    : "Only your therapist and the clinic can read this."}
                </p>
              </div>
              <ConditionIntakePanel
                specialty={specialty}
                questions={questions}
                endpoint="/api/patient/condition-profile/submit"
                draftEndpoint="/api/patient/condition-profile/save-draft"
                currentData={currentData}
                formInitialData={formInitialData}
                canEdit={gate.canEdit}
                authorship={authorship}
                draftIsMine={draftIsMine}
                locked={isPending}
                emptyStateText={
                  gate.reason === "awaiting_therapist"
                    ? "Nothing here for you to fill in yet."
                    : undefined
                }
                lockedMessage={
                  gate.reason === "awaiting_therapist"
                    ? "You'll be able to correct and add to this once your therapist has been through it with you."
                    : "You can edit again as soon as the clinic finishes checking your last submission."
                }
              />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-3">
                <h2 className="font-display text-lg font-bold text-slate-800">Are you getting better?</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {specialty === "ortho"
                    ? "The average pain your therapist measured at each exam, over time."
                    : specialty === "neuro"
                      ? "How much of the day you can manage on your own, each time it has been asked."
                      : "How many milestones your child has reached, each time this was updated."}
                </p>
              </div>
              {/* Ortho trends the Pain Map; the other two have no exam
                  layer yet, so they trend their own headline answer out of
                  the submissions already on file. Two components rather
                  than one with a flag, because the direction is opposite:
                  on a pain score down is good, on these two up is. */}
              {specialty === "ortho" ? (
                <PainTrendChart points={trendPoints} />
              ) : (
                <IntakeTrendChart
                  points={intakeTrend}
                  max={specialty === "neuro" ? 10 : milestoneCount}
                  unit={specialty === "neuro" ? "/ 10" : "milestones"}
                  caption={
                    specialty === "neuro"
                      ? "Each dot is a time your independence was recorded — the line going up is the goal."
                      : "Each dot is a time the milestone list was updated — the line going up is the goal."
                  }
                  emptyText={
                    specialty === "neuro"
                      ? "Nothing to chart yet — this line appears once your independence has been recorded twice, and shows whether it is going up."
                      : "Nothing to chart yet — this line appears once the milestone list has been updated twice, and shows what your child has gained."
                  }
                />
              )}
            </section>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:sticky lg:top-4">
            <div className="mb-4">
              <h2 className="font-display text-lg font-bold text-slate-800">
                {isOrtho ? "Your body map" : "Your examination"}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {isOrtho
                  ? "Filled in by your therapist after examining you — tap any marked point for that area's detail."
                  : "What your therapist found when they examined you."}
              </p>
            </div>
            <SpecialtyExamPanel
              specialty={specialty}
              assessments={assessments ?? []}
              areaPain={selfReportedAreas}
            />
          </section>
        </div>

        {/* Full width under both columns: reports belong to the whole
            chart rather than to either side of it, and a list of files
            reads better wide than squeezed beside a body map. */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4">
            <h2 className="font-display text-lg font-bold text-slate-800">Test reports and scans</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              X-rays, MRI reports, blood tests, prescriptions — anything another doctor gave you. Your
              therapist can open these before your session, so you don&apos;t have to remember to carry them.
            </p>
          </div>
          <MedicalDocumentsPanel
            documents={(medicalDocuments ?? []) as MedicalDocumentRow[]}
            canManage
            emptyMessage="Nothing uploaded yet. If a doctor has given you a scan or a test result, add it here."
          />
        </section>

        {/* The same care_plan_versions rows the therapist's chart renders --
            one authoritative record, two readers, in the patient's own
            voice. Their live recommendation and its Accept button live on
            Suggested Sessions; this is the history behind it. */}
        <CarePlanHistory
          versions={carePlanVersions}
          authorNames={carePlanAuthorNames}
          voice="patient"
        />
      </div>
    </DashboardShell>
  );
}
