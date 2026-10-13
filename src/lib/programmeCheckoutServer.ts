// The server half of a recommended programme's checkout: which plan is being
// bought, what it costs right now, and what a promo code does to it.
//
// Shared by `/api/care-plan/quote` (what the review-and-pay page prints) and
// `/api/care-plan/create-order` (what Razorpay is asked for), so the two
// cannot grow different answers about whether a plan is buyable, what its
// list price is, or whether a code applies. The arithmetic itself is the
// dependency-free `programmeCheckoutQuote.ts`; this module only gathers its
// inputs from rows the patient cannot edit.
//
// The browser sends exactly one id that matters -- the recommendation's
// version -- plus a code's name and, for home visits, which address. Every
// figure is read here.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCourseRate, resolveRecommendablePackage } from "@/lib/carePlanServer";
import {
  buildCourseSnapshot,
  carePlanState,
  parseOfferSnapshot,
  type CarePlanOfferKind,
  type CarePlanOfferSnapshot,
} from "@/lib/carePlans";
import { priceForCountry, type CountryPricing } from "@/lib/countryPricing";
import { readPromoCodesEnabled } from "@/lib/acquisitionSettings";
import { previewPromoCode } from "@/lib/promoCodesServer";
import type { DiscountOutcome } from "@/lib/discounts";

type AdminClient = SupabaseClient;

export type ProgrammePurchaseTable = "patient_package_purchases" | "home_visit_package_purchases";

/** A recommendation that may be paid for right now, re-priced from the live
 *  catalog. */
export type CheckoutProgramme = {
  versionId: string;
  planId: string;
  therapistId: string;
  offerKind: CarePlanOfferKind;
  packageId: string;
  categoryId: string | null;
  snapshot: CarePlanOfferSnapshot;
  table: ProgrammePurchaseTable;
};

export type Refusal = { ok: false; status: number; error: string };

/**
 * The recommendation, checked the way paying for it needs: it exists, it is
 * this patient's, it is the version the therapist currently stands behind,
 * it is still waiting on the patient, and the catalog still prices it the
 * way the card said. Moved here unchanged from create-order so the quote
 * refuses exactly what the order would.
 */
export async function loadProgrammeForCheckout(
  admin: AdminClient,
  patientId: string,
  carePlanVersionId: string
): Promise<{ ok: true; programme: CheckoutProgramme } | Refusal> {
  const { data: version } = await admin
    .from("care_plan_versions")
    .select(
      "id, care_plan_id, offer_kind, session_package_id, home_visit_package_id, offer_snapshot, is_current, expires_at"
    )
    .eq("id", carePlanVersionId)
    .maybeSingle();

  if (!version) {
    return { ok: false, status: 404, error: "That recommendation no longer exists." };
  }

  const { data: plan } = await admin
    .from("care_plans")
    .select("id, patient_id, therapist_id, status")
    .eq("id", version.care_plan_id)
    .maybeSingle();

  if (!plan || plan.patient_id !== patientId) {
    return { ok: false, status: 403, error: "That recommendation isn't yours." };
  }

  // Only the version the therapist currently stands behind is purchasable.
  // An older one is what they used to think.
  if (!version.is_current) {
    return {
      ok: false,
      status: 409,
      error: "Your therapist has updated this recommendation. Refresh to see the current one.",
    };
  }

  const state = carePlanState(
    { status: plan.status as never },
    { expires_at: version.expires_at },
    Date.now()
  );
  if (state === "accepted") {
    return { ok: false, status: 409, error: "You've already bought this plan." };
  }
  if (state !== "awaiting_patient") {
    return {
      ok: false,
      status: 409,
      error:
        state === "lapsed"
          ? "This recommendation has expired. Ask your therapist to send a fresh one."
          : "This recommendation is no longer open.",
    };
  }

  const packageId = version.session_package_id ?? version.home_visit_package_id;
  if (!packageId) {
    return { ok: false, status: 400, error: "That recommendation is incomplete." };
  }

  const offerKind = version.offer_kind as CarePlanOfferKind;
  // A per-session recommendation is re-priced from the condition's live
  // per-session rate; an older one written against an admin programme is
  // re-read from that programme. Either way the patient is charged what the
  // catalog says now, and refused rather than charged a different figure
  // than the card they read.
  const snapshot = parseOfferSnapshot(version.offer_snapshot);
  let live: { snapshot: CarePlanOfferSnapshot; categoryId: string | null } | null;
  if (snapshot?.course && snapshot.categoryId) {
    const rate = await resolveCourseRate(admin, offerKind, snapshot.categoryId);
    live = rate
      ? { snapshot: buildCourseSnapshot(rate, snapshot.sessionCount), categoryId: rate.categoryId }
      : null;
  } else {
    live = await resolveRecommendablePackage(admin, offerKind, packageId);
  }
  if (!live) {
    return {
      ok: false,
      status: 409,
      error:
        "The treatment your therapist recommended is no longer available. They'll need to send a new recommendation.",
    };
  }

  if (
    snapshot &&
    (snapshot.pricePaise !== live.snapshot.pricePaise ||
      snapshot.sessionCount !== live.snapshot.sessionCount)
  ) {
    return {
      ok: false,
      status: 409,
      error:
        "The price of this treatment has changed since your therapist recommended it. We've asked them to confirm it before you pay.",
    };
  }

  if (!live.snapshot.pricePaise || live.snapshot.pricePaise <= 0) {
    return { ok: false, status: 400, error: "That programme has no price set." };
  }

  return {
    ok: true,
    programme: {
      versionId: version.id,
      planId: plan.id,
      therapistId: plan.therapist_id,
      offerKind,
      packageId,
      categoryId: live.categoryId,
      snapshot: live.snapshot,
      table:
        offerKind === "session_package"
          ? "patient_package_purchases"
          : "home_visit_package_purchases",
    },
  };
}

/**
 * Whether a home-visit programme may be bought from here, now.
 *
 * Outside India unless an admin allowed it, and the clinic's master switch.
 * A failed read of the switch still refuses -- taking money for a visit
 * nobody has confirmed we still make is the worse direction -- but says
 * which of the two happened: "the clinic has stopped" and "we could not
 * check" send the patient to different places, and 503 is retryable.
 */
export async function homeVisitRefusal(
  admin: AdminClient,
  homeVisitsOffered: boolean,
  homeVisitOutsideIndiaError: string
): Promise<Refusal | null> {
  if (!homeVisitsOffered) {
    return { ok: false, status: 403, error: homeVisitOutsideIndiaError };
  }
  const { data: settingsRow, error: settingsError } = await admin
    .from("site_settings")
    .select("home_visit_enabled")
    .maybeSingle();
  if (settingsError) {
    console.error("care-plan checkout: could not read home_visit_enabled", settingsError.message);
    return {
      ok: false,
      status: 503,
      error: "We couldn't start that payment just now. Please try again.",
    };
  }
  if (settingsRow?.home_visit_enabled !== true) {
    return {
      ok: false,
      status: 403,
      error: "Home visits aren't available right now. Please talk to your therapist.",
    };
  }
  return null;
}

/**
 * The programme line, as charged. Outside India a video programme costs the
 * rupee equal of its local price (raised, converted, rounded up to .99) --
 * the figure the page shows. A home-visit programme is delivered in India
 * and stays in rupees wherever the patient is.
 */
export function programmeListPricePaise(
  programme: CheckoutProgramme,
  pricing: CountryPricing | null
): number {
  return programme.offerKind === "session_package" && pricing
    ? priceForCountry(programme.snapshot.pricePaise, pricing).chargePaise
    : programme.snapshot.pricePaise;
}

/** The unpaid (or paid) purchase a checkout of this version already made. */
export type ExistingProgrammePurchase = {
  id: string;
  payment_status: string;
  razorpay_order_id: string | null;
};

export async function findProgrammePurchase(
  admin: AdminClient,
  programme: CheckoutProgramme
): Promise<ExistingProgrammePurchase | null> {
  const { data } = await admin
    .from(programme.table)
    .select("id, payment_status, razorpay_order_id")
    .eq("care_plan_version_id", programme.versionId)
    .maybeSingle();
  return (data as ExistingProgrammePurchase | null) ?? null;
}

/**
 * What a typed code would do to this programme, without claiming it.
 *
 * Being a moment stale costs nothing here -- nothing has been promised --
 * because create-order claims it again under the row lock and refuses
 * rather than charging a figure the page did not show.
 */
export async function previewProgrammePromo(
  admin: AdminClient,
  args: {
    code: string;
    patientId: string;
    purchaseId: string | null;
    listPricePaise: number;
  }
): Promise<{ outcome: DiscountOutcome | null; code: string | null; error: string | null; enabled: boolean }> {
  const enabled = await readPromoCodesEnabled(admin);
  const typed = args.code.trim();
  if (!typed) return { outcome: null, code: null, error: null, enabled };
  if (!enabled) return { outcome: null, code: null, error: "That code isn't recognised.", enabled };
  const result = await previewPromoCode(admin, {
    code: typed,
    patientId: args.patientId,
    target: { kind: "programme", purchaseId: args.purchaseId },
    listPricePaise: args.listPricePaise,
  });
  if (!result.ok) return { outcome: null, code: null, error: result.message, enabled };
  return { outcome: result.outcome, code: result.code, error: null, enabled };
}
