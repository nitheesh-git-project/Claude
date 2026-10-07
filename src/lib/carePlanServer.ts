import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildOfferSnapshot,
  type CarePlanOfferKind,
  type CarePlanOfferSnapshot,
  type CourseRate,
  type RecommendableRate,
} from "@/lib/carePlans";

export type { RecommendableRate };

type AdminClient = SupabaseClient;

// Server-side helpers every care-plan route and page shares, so the
// authoring route, the therapist's dialog and the patient's screen cannot
// each grow their own slightly different idea of what may be recommended.

/**
 * Every rate a recommendation may be written at.
 *
 * Video: each active condition at its own price -- the same price /book
 * charges for one consultation, so "N sessions" costs N consultations.
 * Hands-on: the single home-visit price (a one-visit package; one attached to
 * the condition wins over a general one), only while home visits are
 * switched on -- recommending a delivery mode the clinic has turned off would
 * produce a plan nobody can buy.
 *
 * Each read keeps its own tolerance (`specialty` and `image_url` are newer
 * columns), so an unknown-column error costs one detail of the picker rather
 * than the screen it sits on.
 */
export async function loadRecommendableRates(admin: AdminClient): Promise<RecommendableRate[]> {
  const soften = async <T>(run: () => PromiseLike<T>, fallback: T): Promise<T> => {
    try {
      return await run();
    } catch {
      return fallback;
    }
  };

  type CategoryRow = { id: string; title: string; price_paise: number; duration_minutes: number | null; active: boolean };
  type VisitRow = {
    id: string;
    category_id: string | null;
    price_paise: number;
    visit_duration_minutes: number | null;
    travel_fee_included: boolean | null;
  };

  const [categories, imageRows, specialtyRows, settings] = await Promise.all([
    soften(
      async () =>
        (
          await admin
            .from("treatment_categories")
            .select("id, title, price_paise, duration_minutes, active")
            .eq("active", true)
            .order("display_order", { ascending: true })
        ).data as CategoryRow[] | null,
      null
    ),
    soften(
      async () => (await admin.from("treatment_categories").select("id, image_url")).data,
      null as { id: string; image_url: string | null }[] | null
    ),
    soften(
      async () => (await admin.from("treatment_categories").select("id, specialty")).data,
      null as { id: string; specialty: string | null }[] | null
    ),
    soften(
      async () =>
        (
          await admin
            .from("site_settings")
            .select("home_visit_enabled, package_default_validity_days, home_visit_default_validity_days")
            .maybeSingle()
        ).data,
      null as {
        home_visit_enabled: boolean | null;
        package_default_validity_days: number | null;
        home_visit_default_validity_days: number | null;
      } | null
    ),
  ]);

  const homeVisitEnabled = settings?.home_visit_enabled === true;
  const visits = homeVisitEnabled
    ? await soften(
        async () =>
          (
            await admin
              .from("home_visit_packages")
              .select("id, category_id, price_paise, visit_duration_minutes, travel_fee_included")
              .eq("active", true)
              .eq("visit_count", 1)
              .eq("care_plan_course", false)
              .order("price_paise", { ascending: true })
          ).data as VisitRow[] | null,
        null
      )
    : null;

  const imageById = new Map((imageRows ?? []).map((c) => [c.id, c.image_url ?? null]));
  const specialtyById = new Map((specialtyRows ?? []).map((c) => [c.id, c.specialty ?? null]));
  const generalVisit = (visits ?? []).find((v) => v.category_id === null) ?? (visits ?? [])[0] ?? null;

  const out: RecommendableRate[] = [];
  for (const c of categories ?? []) {
    if (!(c.price_paise > 0)) continue;
    const raw = specialtyById.get(c.id) ?? null;
    const specialty = raw === "ortho" || raw === "neuro" || raw === "pediatrics" ? raw : null;
    const imageUrl = imageById.get(c.id) ?? null;
    out.push({
      id: `session_package:${c.id}`,
      kind: "session_package",
      categoryId: c.id,
      categoryTitle: c.title,
      imageUrl,
      perSessionPaise: c.price_paise,
      sessionDurationMinutes: c.duration_minutes ?? null,
      validityDays: settings?.package_default_validity_days ?? null,
      travelFeeIncluded: false,
      specialty,
    });
    const visit = (visits ?? []).find((v) => v.category_id === c.id) ?? generalVisit;
    if (visit && visit.price_paise > 0) {
      out.push({
        id: `home_visit_package:${c.id}`,
        kind: "home_visit_package",
        categoryId: c.id,
        categoryTitle: c.title,
        imageUrl,
        perSessionPaise: visit.price_paise,
        sessionDurationMinutes: visit.visit_duration_minutes ?? null,
        validityDays: settings?.home_visit_default_validity_days ?? null,
        travelFeeIncluded: visit.travel_fee_included === true,
        specialty,
      });
    }
  }
  return out;
}

/**
 * The live rate for one condition and delivery mode, re-read server-side.
 * Authoring and checkout both call this rather than trusting a number the
 * browser sent or one frozen in a snapshot.
 */
export async function resolveCourseRate(
  admin: AdminClient,
  kind: CarePlanOfferKind,
  categoryId: string
): Promise<RecommendableRate | null> {
  const rates = await loadRecommendableRates(admin);
  return rates.find((r) => r.kind === kind && r.categoryId === categoryId) ?? null;
}

/**
 * The hidden catalog row a per-session purchase hangs off (see the
 * `care_plan_course` block at the end of schema.sql). One per condition and
 * delivery mode, created the first time it is needed. Its own count and price
 * are placeholders the catalog CHECKs require: the purchase carries the real
 * count and amount, and no catalog screen lists the row.
 */
export async function ensureCourseTemplate(
  admin: AdminClient,
  rate: CourseRate
): Promise<string | null> {
  const table = rate.kind === "session_package" ? "treatment_category_packages" : "home_visit_packages";
  const find = async () => {
    const { data } = await admin
      .from(table)
      .select("id")
      .eq("care_plan_course", true)
      .eq("category_id", rate.categoryId)
      .maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  };
  const existing = await find();
  if (existing) return existing;

  const common = {
    category_id: rate.categoryId,
    price_paise: Math.max(1, rate.perSessionPaise),
    active: true,
    recommendable: false,
    therapist_locked: true,
    care_plan_course: true,
  };
  const row =
    rate.kind === "session_package"
      ? {
          ...common,
          title: `${rate.categoryTitle} - recommended course`,
          session_count: 2,
          session_duration_minutes: rate.sessionDurationMinutes,
        }
      : {
          ...common,
          title: `${rate.categoryTitle} - recommended home visits`,
          visit_count: 1,
          visit_duration_minutes: rate.sessionDurationMinutes ?? 60,
          travel_fee_included: rate.travelFeeIncluded,
          visible_on_home_visit_page: false,
          visible_in_dashboard: false,
        };
  const { data, error } = await admin
    .from(table)
    .insert(row as Record<string, unknown>)
    .select("id")
    .single();
  if (!error && data) return (data as { id: string }).id;
  // Lost the race to another writer: the unique index kept one row, use it.
  if (error?.code === "23505") return find();
  console.error("ensureCourseTemplate failed", table, error?.message);
  return null;
}

/**
 * Re-reads one package server-side and rebuilds its snapshot.
 *
 * The authoring route calls this rather than trusting anything the browser
 * sent: the package id is the only thing a therapist chooses, and every
 * number attached to it is resolved here.
 */
export async function resolveRecommendablePackage(
  admin: AdminClient,
  kind: CarePlanOfferKind,
  packageId: string
): Promise<{ snapshot: CarePlanOfferSnapshot; categoryId: string | null } | null> {
  const table = kind === "session_package" ? "treatment_category_packages" : "home_visit_packages";
  const columns =
    kind === "session_package"
      ? "id, category_id, title, session_count, price_paise, compare_at_paise, validity_days, session_duration_minutes, min_gap_hours, max_sessions_per_week, therapist_locked, active, recommendable"
      : "id, category_id, title, visit_count, price_paise, compare_at_paise, validity_days, visit_duration_minutes, min_gap_hours, max_visits_per_week, therapist_locked, terms, active, recommendable";
  try {
    const { data } = await admin.from(table).select(columns).eq("id", packageId).maybeSingle();
    if (!data) return null;
    // Through `unknown`: `columns` is a union of two select strings, which
    // supabase-js's own type-level parser cannot resolve to a row shape.
    // The row is read as a bag here anyway -- `buildOfferSnapshot` takes it
    // as one on purpose, since the two catalog tables name their columns
    // differently.
    const row = data as unknown as Record<string, unknown>;
    if (row.active === false || row.recommendable === false) return null;
    return {
      snapshot: buildOfferSnapshot(kind, row),
      categoryId: (row.category_id as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

export type CarePlanWithVersion = {
  id: string;
  patientId: string;
  therapistId: string;
  status: string;
  acceptedAt: string | null;
  /** When the clinic published it. Null on a plan written before the review
   *  step, or while the switch was off. */
  reviewedAt: string | null;
  createdAt: string;
  version: {
    id: string;
    versionNo: number;
    authoredBy: string;
    authoredAt: string;
    offerKind: CarePlanOfferKind;
    packageId: string;
    offerSnapshot: unknown;
    handsOnRequired: boolean;
    frequencyPerWeek: number | null;
    clinicalRationale: string | null;
    instructions: string | null;
    expiresAt: string | null;
  } | null;
};

/**
 * The patient's live plan, if they have one, with its current version.
 *
 * Read in its own call and failure-tolerant, per the
 * migration-dependent-column rule: these tables are new, and a database
 * that has not re-run schema.sql must lose the recommendation rather than
 * the dashboard it appears on.
 */
export async function loadActiveCarePlan(
  admin: AdminClient,
  patientId: string
): Promise<CarePlanWithVersion | null> {
  try {
    const { data: plan } = await admin
      .from("care_plans")
      .select("id, patient_id, therapist_id, status, accepted_at, created_at, current_version_id")
      .eq("patient_id", patientId)
      .eq("status", "active")
      .maybeSingle();
    if (!plan?.current_version_id) return null;

    // `reviewed_at` is newer than the rest of this row, so it is read on its
    // own and merged in. Folding it into the select above would mean a
    // database one apply behind losing the patient their whole
    // recommendation rather than losing it the timestamp it is dated by.
    const reviewedAt = await readReviewedAt(admin, plan.id);

    const { data: version } = await admin
      .from("care_plan_versions")
      .select(
        "id, version_no, authored_by, authored_at, offer_kind, session_package_id, home_visit_package_id, offer_snapshot, hands_on_required, frequency_per_week, clinical_rationale, instructions, expires_at"
      )
      .eq("id", plan.current_version_id)
      .maybeSingle();

    return {
      id: plan.id,
      patientId: plan.patient_id,
      therapistId: plan.therapist_id,
      status: plan.status,
      acceptedAt: plan.accepted_at,
      reviewedAt,
      createdAt: plan.created_at,
      version: version
        ? {
            id: version.id,
            versionNo: version.version_no,
            authoredBy: version.authored_by,
            authoredAt: version.authored_at,
            offerKind: version.offer_kind as CarePlanOfferKind,
            packageId: version.session_package_id ?? version.home_visit_package_id,
            offerSnapshot: version.offer_snapshot,
            handsOnRequired: version.hands_on_required,
            frequencyPerWeek: version.frequency_per_week,
            clinicalRationale: version.clinical_rationale,
            instructions: version.instructions,
            expiresAt: version.expires_at,
          }
        : null,
    };
  } catch {
    return null;
  }
}

export type CarePlanHistoryVersion = {
  id: string;
  planId: string;
  planStatus: string;
  versionNo: number;
  authoredBy: string;
  authoredAt: string;
  offerSnapshot: unknown;
  handsOnRequired: boolean;
  frequencyPerWeek: number | null;
  clinicalRationale: string | null;
  instructions: string | null;
  isCurrent: boolean;
};

/**
 * Every version of every plan this patient has ever been given, newest
 * first.
 *
 * One record, two readers: the Health Profile's history band and the
 * patient's Suggested Sessions screen both render out of this rather than
 * keeping their own copy. That is the point of versioning it -- a second
 * copy is a second thing to keep in sync, and clinical history that can
 * drift is not history.
 *
 * `includeUnapproved` is the one thing the two readers disagree about, and
 * it defaults to the patient's answer. A thread still sitting in the
 * clinic's queue must not appear on the patient's own screens: they would
 * be reading a recommendation nobody has stood behind yet, and a rejected
 * one is a proposal the clinic declined to make. The therapist who wrote it
 * and the admin deciding on it both need to see exactly those.
 */
export async function loadCarePlanHistory(
  admin: AdminClient,
  patientId: string,
  { includeUnapproved = false }: { includeUnapproved?: boolean } = {}
): Promise<CarePlanHistoryVersion[]> {
  try {
    let plansQuery = admin
      .from("care_plans")
      .select("id, status")
      .eq("patient_id", patientId);
    if (!includeUnapproved) {
      plansQuery = plansQuery.not("status", "in", "(pending_review,rejected)");
    }
    const { data: plans } = await plansQuery;
    if (!plans || plans.length === 0) return [];

    const statusById = new Map(plans.map((p) => [p.id, p.status]));
    const { data: versions } = await admin
      .from("care_plan_versions")
      .select(
        "id, care_plan_id, version_no, authored_by, authored_at, offer_snapshot, hands_on_required, frequency_per_week, clinical_rationale, instructions, is_current"
      )
      .in(
        "care_plan_id",
        plans.map((p) => p.id)
      )
      .order("authored_at", { ascending: false });

    return (versions ?? []).map((v) => ({
      id: v.id,
      planId: v.care_plan_id,
      planStatus: statusById.get(v.care_plan_id) ?? "active",
      versionNo: v.version_no,
      authoredBy: v.authored_by,
      authoredAt: v.authored_at,
      offerSnapshot: v.offer_snapshot,
      handsOnRequired: v.hands_on_required,
      frequencyPerWeek: v.frequency_per_week,
      clinicalRationale: v.clinical_rationale,
      instructions: v.instructions,
      isCurrent: v.is_current,
    }));
  } catch {
    return [];
  }
}

export type CarePlanReviewRecord = {
  id: string;
  decision: "approved" | "rejected" | "edited_and_approved";
  reason: string;
  reviewerId: string | null;
  createdAt: string;
};

/**
 * The clinic's decisions on a patient's threads, newest first.
 *
 * Read for the clinician's own screens and the admin's queue. A therapist
 * whose recommendation was turned down is the one person who has to act on
 * it -- they rewrite -- so the reason has to reach them, not sit in an audit
 * log only admins read.
 */
export async function loadCarePlanReviews(
  admin: AdminClient,
  carePlanIds: string[]
): Promise<Map<string, CarePlanReviewRecord[]>> {
  const byPlan = new Map<string, CarePlanReviewRecord[]>();
  if (carePlanIds.length === 0) return byPlan;
  try {
    const { data } = await admin
      .from("care_plan_reviews")
      .select("id, care_plan_id, decision, reason, reviewer_id, created_at")
      .in("care_plan_id", carePlanIds)
      .order("created_at", { ascending: false });
    for (const row of data ?? []) {
      const list = byPlan.get(row.care_plan_id) ?? [];
      list.push({
        id: row.id,
        decision: row.decision as CarePlanReviewRecord["decision"],
        reason: row.reason,
        reviewerId: row.reviewer_id ?? null,
        createdAt: row.created_at,
      });
      byPlan.set(row.care_plan_id, list);
    }
  } catch {
    // New table. Losing the decisions must cost the note explaining a
    // rejection, never the screen it appears on.
  }
  return byPlan;
}

/**
 * The patient's most recent thread whatever state it is in, for the people
 * who need to see one that has not been published.
 *
 * `loadActiveCarePlan` deliberately stays scoped to 'active' -- it feeds the
 * patient's own screens, and a plan waiting on the clinic is not something
 * the patient should be offered or even told about, since it may never be
 * approved. This is its clinician-side twin: the therapist needs to know
 * their submission is queued rather than lost, and needs the reason if it
 * was turned down.
 */
export async function loadLatestCarePlanForClinician(
  admin: AdminClient,
  patientId: string
): Promise<{ plan: CarePlanWithVersion; reviews: CarePlanReviewRecord[] } | null> {
  try {
    const { data: plan } = await admin
      .from("care_plans")
      .select("id, patient_id, therapist_id, status, accepted_at, created_at, current_version_id")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!plan) return null;

    const { data: version } = plan.current_version_id
      ? await admin
          .from("care_plan_versions")
          .select(
            "id, version_no, authored_by, authored_at, offer_kind, session_package_id, home_visit_package_id, offer_snapshot, hands_on_required, frequency_per_week, clinical_rationale, instructions, expires_at"
          )
          .eq("id", plan.current_version_id)
          .maybeSingle()
      : { data: null };

    const reviews = (await loadCarePlanReviews(admin, [plan.id])).get(plan.id) ?? [];

    return {
      plan: {
        id: plan.id,
        patientId: plan.patient_id,
        therapistId: plan.therapist_id,
        status: plan.status,
        acceptedAt: plan.accepted_at,
        reviewedAt: await readReviewedAt(admin, plan.id),
        createdAt: plan.created_at,
        version: version
          ? {
              id: version.id,
              versionNo: version.version_no,
              authoredBy: version.authored_by,
              authoredAt: version.authored_at,
              offerKind: version.offer_kind as CarePlanOfferKind,
              packageId: version.session_package_id ?? version.home_visit_package_id,
              offerSnapshot: version.offer_snapshot,
              handsOnRequired: version.hands_on_required,
              frequencyPerWeek: version.frequency_per_week,
              clinicalRationale: version.clinical_rationale,
              instructions: version.instructions,
              expiresAt: version.expires_at,
            }
          : null,
      },
      reviews,
    };
  } catch {
    return null;
  }
}

/**
 * When the clinic published a plan, read on its own.
 *
 * The column arrived with the review step, later than the row it sits on, so
 * it follows the migration-dependent-column rule: one unknown-column error
 * costs a timestamp rather than the recommendation it belongs to.
 */
async function readReviewedAt(
  admin: AdminClient,
  carePlanId: string
): Promise<string | null> {
  try {
    const { data } = await admin
      .from("care_plans")
      .select("reviewed_at")
      .eq("id", carePlanId)
      .maybeSingle();
    return (data as { reviewed_at?: string | null } | null)?.reviewed_at ?? null;
  } catch {
    return null;
  }
}
