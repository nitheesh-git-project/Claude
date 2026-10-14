import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { readPatientCheckoutStanding, profileCheckUnavailable } from "@/lib/supabase/requireActiveProfile";
import { pricingForRequest } from "@/lib/countryPricingServer";
import { HOME_VISIT_OUTSIDE_INDIA_ERROR } from "@/lib/countryPricing";
import { normalizePincode, isValidPincodeShape } from "@/lib/homeVisitAreas";
import { lookupServiceArea } from "@/lib/serviceAreaServer";
import {
  findProgrammePurchase,
  homeVisitRefusal,
  loadProgrammeForCheckout,
  previewProgrammePromo,
  programmeListPricePaise,
} from "@/lib/programmeCheckoutServer";
import { resolveProgrammeQuote, type ProgrammeTravel } from "@/lib/programmeCheckoutQuote";

// What a recommended programme costs, for the review-and-pay page.
//
// A read: nothing is claimed and nothing is held. The authority is
// /api/care-plan/create-order, which resolves the same inputs through the
// same modules and claims the code under `claim_promo_code_for_purchase()`'s
// row lock -- so this answer may be a moment stale, and the order refuses
// rather than charging a figure this route did not print.
//
// The body names the recommendation, the code the patient typed, and for a
// home visit which address (one on file, or a pincode for a new one). No
// amount, count or fee is ever read from it.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // The same allowance every other quote spends: loose enough for a patient
  // trying a code and an address or two, keyed on the account.
  const limited = await enforceRateLimit(request, "checkout", { identifier: user.id });
  if (limited) return limited;

  const standing = await readPatientCheckoutStanding(user.id);
  if (standing === "unavailable") return profileCheckUnavailable();
  if (standing === "suspended") {
    return NextResponse.json(
      { error: "Your account is not active - it may have been suspended." },
      { status: 403 }
    );
  }
  if (standing === "not_patient") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    carePlanVersionId?: string;
    promoCode?: string | null;
    addressId?: string | null;
    pincode?: string | null;
  }>(request);
  if (parseError) return parseError;

  const carePlanVersionId = body.carePlanVersionId?.trim();
  if (!carePlanVersionId) {
    return NextResponse.json({ error: "Missing carePlanVersionId" }, { status: 400 });
  }

  const admin = createAdminClient();
  const loaded = await loadProgrammeForCheckout(admin, user.id, carePlanVersionId);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }
  const programme = loaded.programme;
  const isHomeVisit = programme.offerKind === "home_visit_package";

  const requestPricing = await pricingForRequest(admin, request);
  if (isHomeVisit) {
    const refusal = await homeVisitRefusal(
      admin,
      requestPricing.homeVisitsOffered,
      HOME_VISIT_OUTSIDE_INDIA_ERROR
    );
    if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
  }

  // Travel, from the served area's own row. An address on file is read as
  // this patient's (the service-role client bypasses RLS, so the ownership
  // check is explicit); a new one is only a pincode until it is paid for.
  let travel: ProgrammeTravel = { state: "none" };
  if (isHomeVisit) {
    let pincode = "";
    const addressId = body.addressId?.trim();
    if (addressId) {
      const { data: saved } = await admin
        .from("patient_addresses")
        .select("id, patient_id, pincode")
        .eq("id", addressId)
        .maybeSingle();
      if (!saved || saved.patient_id !== user.id) {
        return NextResponse.json({ error: "That address isn't on your account." }, { status: 400 });
      }
      pincode = normalizePincode(saved.pincode);
    } else {
      pincode = normalizePincode(body.pincode ?? "");
    }
    if (!isValidPincodeShape(pincode)) {
      travel = { state: "needs_address" };
    } else {
      // A failed read is "we couldn't check", never "not served" -- the
      // latter would refuse a programme the patient's own clinician
      // recommended over a lookup that never answered.
      const lookup = await lookupServiceArea(admin, pincode);
      travel = !lookup.ok
        ? { state: "unknown" }
        : lookup.area
          ? { state: "ready", perVisitPaise: lookup.area.travel_fee_paise }
          : { state: "unserviceable" };
    }
  }

  const listPricePaise = programmeListPricePaise(programme, requestPricing.pricing);
  const existing = await findProgrammePurchase(admin, programme);
  if (existing?.payment_status === "paid") {
    return NextResponse.json({ error: "You've already bought this plan." }, { status: 409 });
  }

  const promo = await previewProgrammePromo(admin, {
    code: body.promoCode ?? "",
    patientId: user.id,
    purchaseId: existing?.id ?? null,
    listPricePaise,
  });

  let quote = resolveProgrammeQuote({
    listPricePaise,
    sessionCount: programme.snapshot.sessionCount,
    travel,
    travelIncluded: programme.snapshot.travelFeeIncluded,
    promo: promo.outcome,
  });
  let promoError = promo.error;
  if (quote.promoRefusal) {
    // Shown beside the field, and the total quoted without the code -- the
    // figure the patient would actually be charged if they paid now.
    promoError = quote.promoRefusal;
    quote = resolveProgrammeQuote({
      listPricePaise,
      sessionCount: programme.snapshot.sessionCount,
      travel,
      travelIncluded: programme.snapshot.travelFeeIncluded,
      promo: null,
    });
  }

  return NextResponse.json({
    offerKind: programme.offerKind,
    sessionCount: programme.snapshot.sessionCount,
    listPricePaise: quote.listPricePaise,
    discountPaise: quote.discountPaise,
    payablePaise: quote.payablePaise,
    travelState: quote.travelState,
    travelPerVisitPaise: quote.travelPerVisitPaise,
    travelPaise: quote.travelPaise,
    travelIncluded: quote.travelIncluded,
    totalPaise: quote.totalPaise,
    payable: quote.payable,
    promo: {
      code: quote.discountPaise > 0 ? promo.code : null,
      error: promoError,
    },
    promoCodesEnabled: promo.enabled,
    // The country row the figures were made with, or null for rupees; the
    // page formats every figure above with it.
    pricing: isHomeVisit ? null : requestPricing.pricing,
  });
}
