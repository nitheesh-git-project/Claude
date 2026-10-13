// Everything the admin's Programmes section shows, read in one place.
//
// One programme is a recommendation (care_plans + its versions + the
// clinic's reviews) and/or the purchase it became (patient_package_purchases
// or home_visit_package_purchases) and the sessions drawn from it. They were
// read on two screens that never met; this module joins them into one row
// each (`ProgrammeRow`, src/lib/programmePipeline.ts), with one ID and its
// progress (src/lib/programmeId.ts), and also hands back the same tag keyed
// by purchase and by appointment so every other screen that lists a
// programme session can say which programme it belongs to.
//
// Every read is isolated and tolerant: the new ID columns are
// migration-dependent, so a database that has not had schema.sql applied
// loses the new IDs (rows fall back to the old SP/HS code) rather than the
// list. A read that fails is named in `failed`, never shown as "nothing".
//
// Money is filled only for a desk that can open Money, so it never reaches
// the page props of one that cannot.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllRows, readAllRowsByIds } from "@/lib/supabase/readAllRows";
import { carePlanState, parseOfferSnapshot, type CarePlanStatus } from "@/lib/carePlans";
import { formatRupees } from "@/lib/formatMoney";
import { programmeTag, type ProgrammeTag } from "@/lib/programmeId";
import {
  buildProgrammeTimeline,
  programmeStage,
  type ProgrammeRow,
  type ProgrammeSession,
} from "@/lib/programmePipeline";

type AdminClient = SupabaseClient;

type PlanRow = {
  id: string;
  patient_id: string;
  therapist_id: string;
  status: string;
  category_id: string | null;
  current_version_id: string | null;
  accepted_version_id: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  created_at: string;
  updated_at: string | null;
};

type VersionRow = {
  id: string;
  care_plan_id: string;
  version_no: number;
  authored_at: string;
  authored_by: string | null;
  entered_by: string | null;
  offer_kind: string;
  offer_snapshot: unknown;
  expires_at: string | null;
  clinical_rationale: string | null;
};

type ReviewRow = {
  care_plan_id: string;
  reviewer_id: string | null;
  decision: "approved" | "rejected" | "edited_and_approved";
  reason: string | null;
  created_at: string;
};

type PurchaseBase = {
  id: string;
  purchase_code: string | null;
  patient_id: string;
  package_id: string;
  amount_paid_paise: number | null;
  payment_status: string;
  status: string | null;
  locked_therapist_id: string | null;
  expires_at: string | null;
  created_at: string;
  paid_at: string | null;
  refund_amount_paise: number | null;
  refunded_at: string | null;
  care_plan_version_id: string | null;
};

type PackagePurchase = PurchaseBase & { category_id: string; session_count: number };
type VisitPurchase = PurchaseBase & {
  visit_count: number;
  travel_fee_paise: number | null;
  payment_mode: string | null;
};

type SessionRow = {
  id: string;
  session_code: string | null;
  status: string;
  slot_time: string | null;
  therapist_id: string | null;
  created_at: string | null;
  completed_at: string | null;
  package_purchase_id?: string | null;
  home_visit_purchase_id?: string | null;
};

type MoneyCols = { id: string; list_price_paise: number | null; discount_paise: number | null; promo_code_id: string | null };

export type AdminProgrammesData = {
  rows: ProgrammeRow[];
  /** Purchase id -> its tag, for Money rows and person pages. */
  tagsByPurchase: Record<string, ProgrammeTag>;
  /** Appointment id -> the programme it was drawn from. */
  tagsByAppointment: Record<string, ProgrammeTag>;
  /** Care plan id -> its programme ID (no progress), for the review queue. */
  codesByPlan: Record<string, string>;
  conditions: { id: string; title: string }[];
  therapists: { id: string; name: string }[];
  /** Reads that failed, in words. Empty when everything loaded. */
  failed: string[];
  /** The new IDs could not be read (schema.sql not applied yet). */
  idsMissing: boolean;
};

const OPEN_SESSION = (status: string) => status !== "cancelled" && status !== "completed";

function rupees(paise: number | null | undefined): string | null {
  return typeof paise === "number" ? `₹${formatRupees(paise)}` : null;
}

/** A purchase the patient owns: paid, or agreed to pay at the door. An
 *  abandoned checkout is not a programme. */
function owned(p: { payment_status: string; payment_mode?: string | null; status?: string | null }): boolean {
  if (p.payment_status === "paid") return true;
  return p.payment_mode === "cash_on_visit" && p.payment_status !== "failed" && p.status !== "cancelled";
}

export async function loadAdminProgrammes(
  admin: AdminClient,
  opts: {
    nowMs: number;
    canSeeMoney: boolean;
    /** The therapist's reasoning and the patient's reason for declining are
     *  clinical and personal; they go only to a desk that works the
     *  recommendations (Programmes at `manage`), never to one that reads the
     *  list to reconcile money. */
    canSeeClinical: boolean;
  }
): Promise<AdminProgrammesData> {
  const failed: string[] = [];
  const note = (what: string, error: unknown) => {
    if (!error) return false;
    console.error(`Programmes: could not read ${what}`, error);
    failed.push(what);
    return true;
  };

  // ---- First wave: the rows themselves -----------------------------------
  const [plansRes, packageRes, visitRes, pkgSessionsRes, visitSessionsRes, categoriesRes] = await Promise.all([
    readAllRows<PlanRow>(() =>
      admin
        .from("care_plans")
        .select(
          "id, patient_id, therapist_id, status, category_id, current_version_id, accepted_version_id, accepted_at, declined_at, decline_reason, created_at, updated_at"
        )
        .not("current_version_id", "is", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
    ),
    readAllRows<PackagePurchase>(() =>
      admin
        .from("patient_package_purchases")
        .select(
          "id, purchase_code, patient_id, package_id, category_id, session_count, amount_paid_paise, payment_status, status, locked_therapist_id, expires_at, created_at, paid_at, refund_amount_paise, refunded_at, care_plan_version_id"
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
    ),
    readAllRows<VisitPurchase>(() =>
      admin
        .from("home_visit_package_purchases")
        .select(
          "id, purchase_code, patient_id, package_id, visit_count, amount_paid_paise, travel_fee_paise, payment_mode, payment_status, status, locked_therapist_id, expires_at, created_at, paid_at, refund_amount_paise, refunded_at, care_plan_version_id"
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
    ),
    readAllRows<SessionRow>(() =>
      admin
        .from("appointments")
        .select("id, session_code, status, slot_time, therapist_id, created_at, completed_at, package_purchase_id")
        .not("package_purchase_id", "is", null)
        .order("slot_time", { ascending: true })
        .order("id", { ascending: true })
    ),
    readAllRows<SessionRow>(() =>
      admin
        .from("appointments")
        .select("id, session_code, status, slot_time, therapist_id, created_at, completed_at, home_visit_purchase_id")
        .not("home_visit_purchase_id", "is", null)
        .order("slot_time", { ascending: true })
        .order("id", { ascending: true })
    ),
    readAllRows<{ id: string; title: string }>(() =>
      admin.from("treatment_categories").select("id, title").order("display_order").order("id")
    ),
  ]);
  note("recommendations", plansRes.error);
  note("programme purchases", packageRes.error);
  note("home-visit programmes", visitRes.error);
  note("programme sessions", pkgSessionsRes.error || visitSessionsRes.error);
  note("conditions", categoriesRes.error);

  const plans = plansRes.rows;
  const packages = packageRes.rows;
  const visits = visitRes.rows.filter((v) => v.care_plan_version_id || (v.visit_count ?? 0) >= 2);
  const planIds = plans.map((p) => p.id);
  const pkgIds = packages.map((p) => p.id);
  const visitIds = visits.map((v) => v.id);

  // ---- Second wave: what hangs off them, each read on its own --------------
  const [versionsRes, reviewsRes, planCodesRes, pkgCodesRes, visitCodesRes, pkgMoneyRes, visitMoneyRes, packageTitles, visitPackages] =
    await Promise.all([
      planIds.length
        ? readAllRowsByIds<VersionRow>(planIds, (ids) =>
            admin
              .from("care_plan_versions")
              .select(
                "id, care_plan_id, version_no, authored_at, authored_by, entered_by, offer_kind, offer_snapshot, expires_at, clinical_rationale"
              )
              .in("care_plan_id", ids)
              .order("id", { ascending: true })
          )
        : Promise.resolve({ rows: [] as VersionRow[], truncated: false, error: null }),
      planIds.length
        ? readAllRowsByIds<ReviewRow>(planIds, (ids) =>
            admin
              .from("care_plan_reviews")
              .select("care_plan_id, reviewer_id, decision, reason, created_at")
              .in("care_plan_id", ids)
              .order("created_at", { ascending: true })
          )
        : Promise.resolve({ rows: [] as ReviewRow[], truncated: false, error: null }),
      // The new columns, each on its own: an unknown-column error costs the
      // IDs, never the list.
      readAllRows<{ id: string; programme_code: string | null; previous_programme_codes: string[] | null }>(() =>
        admin.from("care_plans").select("id, programme_code, previous_programme_codes").order("id")
      ),
      readAllRows<{ id: string; programme_code: string | null }>(() =>
        admin.from("patient_package_purchases").select("id, programme_code").order("id")
      ),
      readAllRows<{ id: string; programme_code: string | null }>(() =>
        admin.from("home_visit_package_purchases").select("id, programme_code").order("id")
      ),
      opts.canSeeMoney && pkgIds.length
        ? readAllRowsByIds<MoneyCols>(pkgIds, (ids) =>
            admin
              .from("patient_package_purchases")
              .select("id, list_price_paise, discount_paise, promo_code_id")
              .in("id", ids)
              .order("id")
          )
        : Promise.resolve({ rows: [] as MoneyCols[], truncated: false, error: null }),
      opts.canSeeMoney && visitIds.length
        ? readAllRowsByIds<MoneyCols>(visitIds, (ids) =>
            admin
              .from("home_visit_package_purchases")
              .select("id, list_price_paise, discount_paise, promo_code_id")
              .in("id", ids)
              .order("id")
          )
        : Promise.resolve({ rows: [] as MoneyCols[], truncated: false, error: null }),
      readAllRows<{ id: string; title: string; category_id: string | null }>(() =>
        admin.from("treatment_category_packages").select("id, title, category_id").order("id")
      ),
      readAllRows<{ id: string; title: string; category_id: string | null }>(() =>
        admin.from("home_visit_packages").select("id, title, category_id").order("id")
      ),
    ]);
  note("recommendation versions", versionsRes.error);
  note("approval decisions", reviewsRes.error);
  const idsMissing = !!(planCodesRes.error || pkgCodesRes.error || visitCodesRes.error);
  if (idsMissing) {
    console.error("Programmes: programme IDs unreadable (schema.sql not applied?)", planCodesRes.error ?? pkgCodesRes.error ?? visitCodesRes.error);
  }
  // Money detail is a garnish on the row; losing it is said, not fatal.
  note("discounts", pkgMoneyRes.error || visitMoneyRes.error);

  const planCode = new Map(planCodesRes.rows.map((r) => [r.id, r]));
  const pkgCode = new Map(pkgCodesRes.rows.map((r) => [r.id, r.programme_code]));
  const visitCode = new Map(visitCodesRes.rows.map((r) => [r.id, r.programme_code]));
  const money = new Map([...pkgMoneyRes.rows, ...visitMoneyRes.rows].map((r) => [r.id, r]));
  const categoryTitle = new Map(categoriesRes.rows.map((c) => [c.id, c.title]));
  const packageCategory = new Map(packageTitles.rows.map((p) => [p.id, p.category_id]));
  const visitPackageCategory = new Map(visitPackages.rows.map((p) => [p.id, p.category_id]));

  // Promo codes and names, for the ids just read.
  const promoIds = [...new Set([...money.values()].map((m) => m.promo_code_id).filter((x): x is string => !!x))];
  const versions = versionsRes.rows;
  const reviews = reviewsRes.rows;
  const personIds = [
    ...new Set(
      [
        ...plans.flatMap((p) => [p.patient_id, p.therapist_id]),
        ...packages.flatMap((p) => [p.patient_id, p.locked_therapist_id]),
        ...visits.flatMap((p) => [p.patient_id, p.locked_therapist_id]),
        ...versions.flatMap((v) => [v.authored_by, v.entered_by]),
        ...reviews.map((r) => r.reviewer_id),
        ...pkgSessionsRes.rows.map((s) => s.therapist_id),
        ...visitSessionsRes.rows.map((s) => s.therapist_id),
      ].filter((x): x is string => !!x)
    ),
  ];
  const [peopleRes, promoRes] = await Promise.all([
    personIds.length
      ? readAllRowsByIds<{ id: string; full_name: string | null }>(personIds, (ids) =>
          admin.from("profiles").select("id, full_name").in("id", ids).order("id")
        )
      : Promise.resolve({ rows: [] as { id: string; full_name: string | null }[], truncated: false, error: null }),
    promoIds.length
      ? readAllRowsByIds<{ id: string; code: string }>(promoIds, (ids) =>
          admin.from("promo_codes").select("id, code").in("id", ids).order("id")
        )
      : Promise.resolve({ rows: [] as { id: string; code: string }[], truncated: false, error: null }),
  ]);
  note("names", peopleRes.error);
  const name = new Map(peopleRes.rows.map((p) => [p.id, p.full_name ?? "Unknown"]));
  const promoCode = new Map(promoRes.rows.map((p) => [p.id, p.code]));
  const nameOf = (id: string | null | undefined) => (id ? name.get(id) ?? "Unknown" : null);

  const versionsByPlan = new Map<string, VersionRow[]>();
  const planByVersion = new Map<string, string>();
  for (const v of versions) {
    planByVersion.set(v.id, v.care_plan_id);
    const list = versionsByPlan.get(v.care_plan_id) ?? [];
    list.push(v);
    versionsByPlan.set(v.care_plan_id, list);
  }
  for (const list of versionsByPlan.values()) list.sort((a, b) => a.version_no - b.version_no);
  const reviewsByPlan = new Map<string, ReviewRow[]>();
  for (const r of reviews) {
    const list = reviewsByPlan.get(r.care_plan_id) ?? [];
    list.push(r);
    reviewsByPlan.set(r.care_plan_id, list);
  }

  const sessionsByPurchase = new Map<string, SessionRow[]>();
  for (const s of pkgSessionsRes.rows) {
    if (!s.package_purchase_id) continue;
    const list = sessionsByPurchase.get(s.package_purchase_id) ?? [];
    list.push(s);
    sessionsByPurchase.set(s.package_purchase_id, list);
  }
  for (const s of visitSessionsRes.rows) {
    if (!s.home_visit_purchase_id) continue;
    const list = sessionsByPurchase.get(s.home_visit_purchase_id) ?? [];
    list.push(s);
    sessionsByPurchase.set(s.home_visit_purchase_id, list);
  }

  type AnyPurchase =
    | { kind: "package"; row: PackagePurchase }
    | { kind: "home_visit"; row: VisitPurchase };

  // The purchase each plan became: the one the patient owns, preferring the
  // accepted version's. Unowned retries are checkouts, not programmes.
  const ownedByPlan = new Map<string, AnyPurchase>();
  const claimed = new Set<string>();
  const allPurchases: AnyPurchase[] = [
    ...packages.map((row) => ({ kind: "package" as const, row })),
    ...visits.map((row) => ({ kind: "home_visit" as const, row })),
  ];
  for (const p of allPurchases) {
    if (!p.row.care_plan_version_id || !owned(p.row)) continue;
    const planId = planByVersion.get(p.row.care_plan_version_id);
    if (!planId) continue;
    const existing = ownedByPlan.get(planId);
    if (!existing || (existing.row.paid_at ?? "") < (p.row.paid_at ?? "")) ownedByPlan.set(planId, p);
  }
  for (const p of ownedByPlan.values()) claimed.add(p.row.id);

  const tagsByPurchase: Record<string, ProgrammeTag> = {};
  const tagsByAppointment: Record<string, ProgrammeTag> = {};
  const codesByPlan: Record<string, string> = {};

  function shapeSessions(purchaseId: string | null): {
    sessions: ProgrammeSession[];
    done: number;
    booked: number;
    next: ProgrammeRow["nextSession"];
  } {
    const list = purchaseId ? sessionsByPurchase.get(purchaseId) ?? [] : [];
    const sessions = list.map((s) => ({
      id: s.id,
      sessionCode: s.session_code,
      status: s.status,
      slotTime: s.slot_time,
      therapistName: nameOf(s.therapist_id),
      createdAt: s.created_at,
      completedAt: s.completed_at,
    }));
    const done = list.filter((s) => s.status === "completed").length;
    const booked = list.filter((s) => OPEN_SESSION(s.status)).length;
    const upcoming = list
      .filter((s) => OPEN_SESSION(s.status) && s.slot_time && new Date(s.slot_time).getTime() >= opts.nowMs)
      .sort((a, b) => (a.slot_time ?? "").localeCompare(b.slot_time ?? ""))[0];
    return {
      sessions,
      done,
      booked,
      next: upcoming?.slot_time ? { slotTime: upcoming.slot_time, sessionCode: upcoming.session_code } : null,
    };
  }

  function moneyFor(purchase: AnyPurchase | null, listFallback: number | null): ProgrammeRow["money"] {
    if (!opts.canSeeMoney) return null;
    if (!purchase) {
      return { listPricePaise: listFallback, discountPaise: 0, promoCode: null, paidPaise: null, travelFeePaise: 0, refundPaise: null };
    }
    const m = money.get(purchase.row.id);
    const discount = m?.discount_paise ?? 0;
    const paid = purchase.row.amount_paid_paise ?? null;
    return {
      listPricePaise: m?.list_price_paise ?? (paid !== null ? paid + discount : listFallback),
      discountPaise: discount,
      promoCode: m?.promo_code_id ? promoCode.get(m.promo_code_id) ?? null : null,
      paidPaise: paid,
      travelFeePaise: purchase.kind === "home_visit" ? purchase.row.travel_fee_paise ?? 0 : 0,
      refundPaise: purchase.row.refund_amount_paise ?? null,
    };
  }

  function purchaseCode(p: AnyPurchase): string | null {
    return (p.kind === "package" ? pkgCode.get(p.row.id) : visitCode.get(p.row.id)) ?? null;
  }

  function purchaseTotal(p: AnyPurchase): number {
    return p.kind === "package" ? p.row.session_count ?? 0 : p.row.visit_count ?? 0;
  }

  function register(tag: ProgrammeTag | null, purchase: AnyPurchase | null, sessions: ProgrammeSession[]) {
    if (!tag) return;
    if (purchase) tagsByPurchase[purchase.row.id] = tag;
    for (const s of sessions) tagsByAppointment[s.id] = tag;
  }

  const rows: ProgrammeRow[] = [];

  // ---- One row per recommendation ----------------------------------------
  for (const plan of plans) {
    const planVersions = versionsByPlan.get(plan.id) ?? [];
    const current = planVersions.find((v) => v.id === plan.current_version_id) ?? planVersions[planVersions.length - 1];
    const snapshot = parseOfferSnapshot(current?.offer_snapshot);
    const purchase = ownedByPlan.get(plan.id) ?? null;
    const state = carePlanState(
      { status: plan.status as CarePlanStatus },
      { expires_at: current?.expires_at ?? null },
      opts.nowMs
    );
    const { sessions, done, booked, next } = shapeSessions(purchase?.row.id ?? null);
    const total = purchase ? purchaseTotal(purchase) : snapshot?.sessionCount ?? 0;
    const codes = planCode.get(plan.id);
    const code = codes?.programme_code ?? (purchase ? purchaseCode(purchase) : null);
    if (code) codesByPlan[plan.id] = code;
    const tag = programmeTag({
      programmeCode: code,
      legacyCode: purchase?.row.purchase_code ?? null,
      previousCodes: codes?.previous_programme_codes ?? [],
      done,
      total,
    });
    register(tag, purchase, sessions);

    const mode = purchase ? (purchase.kind === "home_visit" ? "home_visit" : "online") : current?.offer_kind === "home_visit_package" ? "home_visit" : "online";
    const conditionId = snapshot?.categoryId ?? plan.category_id ?? null;
    const planReviews = reviewsByPlan.get(plan.id) ?? [];
    const approval = planReviews.find((r) => r.decision !== "rejected");
    const rejection = [...planReviews].reverse().find((r) => r.decision === "rejected");
    const sentAt =
      approval?.created_at ??
      (planReviews.length === 0 && plan.status !== "pending_review" && plan.status !== "rejected"
        ? planVersions[0]?.authored_at ?? null
        : null);
    const m = moneyFor(purchase, snapshot?.pricePaise ?? null);

    rows.push({
      key: `plan:${plan.id}`,
      code,
      display: tag?.display ?? "No ID yet",
      otherCodes: tag?.otherCodes ?? [],
      carePlanId: plan.id,
      purchaseId: purchase?.row.id ?? null,
      purchaseKind: purchase?.kind ?? null,
      mode,
      conditionId,
      conditionTitle: (conditionId && categoryTitle.get(conditionId)) || snapshot?.title || "Treatment programme",
      patientId: plan.patient_id,
      patientName: nameOf(plan.patient_id) ?? "Unknown",
      therapistId: purchase?.row.locked_therapist_id ?? plan.therapist_id,
      therapistName: nameOf(purchase?.row.locked_therapist_id ?? plan.therapist_id),
      authorName: nameOf(plan.therapist_id),
      stage: programmeStage({
        planState: state,
        purchase: purchase ? { status: purchase.row.status ?? "active", done, booked, total } : null,
      }),
      done,
      booked,
      total,
      createdAt: planVersions[0]?.authored_at ?? plan.created_at,
      paidAt: purchase?.row.paid_at ?? null,
      expiresAt: purchase ? purchase.row.expires_at : current?.expires_at ?? null,
      nextSession: next,
      sessions,
      timeline: buildProgrammeTimeline({
        versions: planVersions.map((v) => ({
          authoredAt: v.authored_at,
          versionNo: v.version_no,
          byClinic: !!v.entered_by && v.entered_by !== v.authored_by,
          authorName: nameOf(v.authored_by),
        })),
        reviews: planReviews.map((r) => ({
          at: r.created_at,
          decision: r.decision,
          reviewerName: nameOf(r.reviewer_id),
          reason: r.reason,
        })),
        sentAt,
        acceptedAt: plan.accepted_at,
        declinedAt: plan.declined_at,
        declineReason: opts.canSeeClinical ? plan.decline_reason : null,
        withdrawnAt: plan.status === "withdrawn" ? plan.updated_at : null,
        lapsedAt: state === "lapsed" ? current?.expires_at ?? null : null,
        paidAt: purchase?.row.paid_at ?? null,
        paidLabel: m ? rupees(m.paidPaise) : null,
        sessions,
        expiredAt: purchase?.row.status === "expired" ? purchase.row.expires_at : null,
        refundedAt: purchase?.row.refunded_at ?? null,
        refundLabel: m ? rupees(m.refundPaise) : null,
      }),
      money: m,
      paymentMode: purchase?.kind === "home_visit" ? (purchase.row.payment_mode === "cash_on_visit" ? "cash_on_visit" : "prepaid") : null,
      rationale: opts.canSeeClinical ? current?.clinical_rationale ?? null : null,
      declineReason: opts.canSeeClinical ? plan.decline_reason : null,
      reviewReason: rejection?.reason ?? null,
    });
  }

  // ---- And one per programme bought without one (old catalog courses) ----
  for (const purchase of allPurchases) {
    if (claimed.has(purchase.row.id) || !owned(purchase.row)) continue;
    const { sessions, done, booked, next } = shapeSessions(purchase.row.id);
    const total = purchaseTotal(purchase);
    const code = purchaseCode(purchase);
    const tag = programmeTag({ programmeCode: code, legacyCode: purchase.row.purchase_code, done, total });
    register(tag, purchase, sessions);
    const conditionId =
      purchase.kind === "package"
        ? purchase.row.category_id ?? packageCategory.get(purchase.row.package_id) ?? null
        : visitPackageCategory.get(purchase.row.package_id) ?? null;
    const m = moneyFor(purchase, null);
    rows.push({
      key: `purchase:${purchase.row.id}`,
      code,
      display: tag?.display ?? "No ID yet",
      otherCodes: tag?.otherCodes ?? [],
      carePlanId: null,
      purchaseId: purchase.row.id,
      purchaseKind: purchase.kind,
      mode: purchase.kind === "home_visit" ? "home_visit" : "online",
      conditionId,
      conditionTitle: (conditionId && categoryTitle.get(conditionId)) || (purchase.kind === "home_visit" ? "Home visits" : "Treatment programme"),
      patientId: purchase.row.patient_id,
      patientName: nameOf(purchase.row.patient_id) ?? "Unknown",
      therapistId: purchase.row.locked_therapist_id,
      therapistName: nameOf(purchase.row.locked_therapist_id),
      authorName: null,
      stage: programmeStage({ planState: null, purchase: { status: purchase.row.status ?? "active", done, booked, total } }),
      done,
      booked,
      total,
      createdAt: purchase.row.paid_at ?? purchase.row.created_at,
      paidAt: purchase.row.paid_at,
      expiresAt: purchase.row.expires_at,
      nextSession: next,
      sessions,
      timeline: buildProgrammeTimeline({
        versions: [],
        reviews: [],
        sentAt: null,
        acceptedAt: null,
        declinedAt: null,
        declineReason: null,
        withdrawnAt: null,
        lapsedAt: null,
        paidAt: purchase.row.paid_at,
        paidLabel: m ? rupees(m.paidPaise) : null,
        sessions,
        expiredAt: purchase.row.status === "expired" ? purchase.row.expires_at : null,
        refundedAt: purchase.row.refunded_at,
        refundLabel: m ? rupees(m.refundPaise) : null,
      }),
      money: m,
      paymentMode: purchase.kind === "home_visit" ? (purchase.row.payment_mode === "cash_on_visit" ? "cash_on_visit" : "prepaid") : null,
      rationale: null,
      declineReason: null,
      reviewReason: null,
    });
  }

  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

  const conditionIds = new Set(rows.map((r) => r.conditionId).filter((x): x is string => !!x));
  const therapistIds = new Map<string, string>();
  for (const r of rows) if (r.therapistId && r.therapistName) therapistIds.set(r.therapistId, r.therapistName);

  return {
    rows,
    tagsByPurchase,
    tagsByAppointment,
    codesByPlan,
    conditions: categoriesRes.rows.filter((c) => conditionIds.has(c.id)).map((c) => ({ id: c.id, title: c.title })),
    therapists: [...therapistIds.entries()]
      .map(([id, n]) => ({ id, name: n }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    failed,
    idsMissing,
  };
}
