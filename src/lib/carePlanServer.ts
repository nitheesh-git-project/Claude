import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildOfferSnapshot,
  type CarePlanOfferKind,
  type CarePlanOfferSnapshot,
} from "@/lib/carePlans";

type AdminClient = SupabaseClient;

// Server-side helpers every care-plan route and page shares, so the
// authoring route, the therapist's dialog and the patient's screen cannot
// each grow their own slightly different idea of what may be recommended.

export type RecommendablePackage = {
  id: string;
  kind: CarePlanOfferKind;
  title: string;
  categoryId: string | null;
  /** The condition this treats, and which of the three condition types it
   *  belongs to. Both resolved here rather than in a component, because the
   *  therapist's picker asks for a condition and a number of sessions --
   *  never for a programme by name -- and the price has to come back from
   *  that pair. Null where an admin has not attached or tagged the
   *  category yet; such a programme is offered under "Any condition" rather
   *  than disappearing. */
  categoryTitle: string | null;
  specialty: "ortho" | "neuro" | "pediatrics" | null;
  snapshot: CarePlanOfferSnapshot;
};

/**
 * What a therapist may put in front of this patient.
 *
 * Admin-controlled on two axes: `active` (is this package real at all) and
 * `recommendable` (may a clinician offer it). Those are deliberately
 * separate from the three `visible_*` flags, which decide where a package is
 * *advertised* — an admin who stops selling something on the website has not
 * necessarily stopped it being the right treatment for someone already in
 * the practice.
 *
 * Home-visit packages are included only when the master switch is on, since
 * recommending a delivery mode the clinic has turned off would produce a
 * plan nobody can buy.
 */
export async function loadRecommendablePackages(
  admin: AdminClient,
  { categoryId }: { categoryId?: string | null } = {}
): Promise<RecommendablePackage[]> {
  const out: RecommendablePackage[] = [];

  try {
    let query = admin
      .from("treatment_category_packages")
      .select(
        "id, category_id, title, session_count, price_paise, compare_at_paise, validity_days, session_duration_minutes, min_gap_hours, max_sessions_per_week, therapist_locked, terms, active, recommendable"
      )
      .eq("active", true)
      .eq("recommendable", true)
      .order("display_order", { ascending: true });
    // Narrowed to the patient's own condition when we know it: a therapist
    // scanning every programme in the catalog is how the wrong one gets
    // picked.
    if (categoryId) query = query.eq("category_id", categoryId);
    const { data } = await query;
    for (const row of data ?? []) {
      out.push({
        id: row.id,
        kind: "session_package",
        title: row.title,
        categoryId: row.category_id ?? null,
        categoryTitle: null,
        specialty: null,
        snapshot: buildOfferSnapshot("session_package", row as Record<string, unknown>),
      });
    }
  } catch {
    // `recommendable` is a new column. An unknown-column error must cost
    // the recommend control, not the screen it sits on.
  }

  try {
    const { data: settings } = await admin
      .from("site_settings")
      .select("home_visit_enabled")
      .maybeSingle();
    if (settings?.home_visit_enabled === true) {
      const { data } = await admin
        .from("home_visit_packages")
        .select(
          "id, category_id, title, visit_count, price_paise, compare_at_paise, validity_days, visit_duration_minutes, min_gap_hours, max_visits_per_week, therapist_locked, terms, active, recommendable"
        )
        .eq("active", true)
        .eq("recommendable", true)
        .order("display_order", { ascending: true });
      for (const row of data ?? []) {
        out.push({
          id: row.id,
          kind: "home_visit_package",
          title: row.title,
          categoryId: row.category_id ?? null,
          categoryTitle: null,
          specialty: null,
          snapshot: buildOfferSnapshot("home_visit_package", row as Record<string, unknown>),
        });
      }
    }
  } catch {
    // Same tolerance as above.
  }

  // The category names and condition types, in their own call. `specialty`
  // is a new column, so an unknown-column error must cost the picker its
  // grouping rather than every programme in it -- the same reason the
  // package reads above are each wrapped.
  const categoryIds = [...new Set(out.map((p) => p.categoryId).filter((id): id is string => !!id))];
  if (categoryIds.length > 0) {
    let titleById = new Map<string, string>();
    let specialtyById = new Map<string, string | null>();
    try {
      const { data } = await admin
        .from("treatment_categories")
        .select("id, title")
        .in("id", categoryIds);
      titleById = new Map((data ?? []).map((c) => [c.id, c.title as string]));
    } catch {
      // Names lost; the picker falls back to the programme's own title.
    }
    try {
      const { data } = await admin
        .from("treatment_categories")
        .select("id, specialty")
        .in("id", categoryIds);
      specialtyById = new Map(
        (data ?? []).map((c) => [c.id, (c as { specialty: string | null }).specialty ?? null])
      );
    } catch {
      // Untagged database: every condition sits under one heading, which is
      // exactly how it read before the column existed.
    }
    for (const p of out) {
      if (!p.categoryId) continue;
      p.categoryTitle = titleById.get(p.categoryId) ?? null;
      const specialty = specialtyById.get(p.categoryId) ?? null;
      p.specialty =
        specialty === "ortho" || specialty === "neuro" || specialty === "pediatrics"
          ? specialty
          : null;
    }
  }

  return out;
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
      ? "id, category_id, title, session_count, price_paise, compare_at_paise, validity_days, session_duration_minutes, min_gap_hours, max_sessions_per_week, therapist_locked, terms, active, recommendable"
      : "id, category_id, title, visit_count, price_paise, compare_at_paise, validity_days, visit_duration_minutes, min_gap_hours, max_visits_per_week, therapist_locked, terms, active, recommendable";
  try {
    const { data } = await admin.from(table).select(columns).eq("id", packageId).maybeSingle();
    if (!data) return null;
    const row = data as Record<string, unknown>;
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
