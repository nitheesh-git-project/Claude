import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { pricingForRequest } from "@/lib/countryPricingServer";
import { HOME_VISIT_OUTSIDE_INDIA_ERROR } from "@/lib/countryPricing";
import {
  resolveHomeVisitAddress,
  type HomeVisitAddressPayload,
  type ResolvedHomeVisitAddress,
} from "@/lib/homeVisitAddress";
import {
  isProfileActive,
  isPatientProfile,
  profileCheckUnavailable,
} from "@/lib/supabase/requireActiveProfile";
import {
  findProgrammePurchase,
  homeVisitRefusal,
  loadProgrammeForCheckout,
  programmeListPricePaise,
} from "@/lib/programmeCheckoutServer";
import { resolveProgrammeQuote } from "@/lib/programmeCheckoutQuote";
import { claimPromoCodeForPurchase, releasePromoCodeForPurchase } from "@/lib/promoCodesServer";
import { readPromoCodesEnabled } from "@/lib/acquisitionSettings";
import { countPriorCommittedSessions } from "@/lib/priorSessionsServer";
import type { DiscountOutcome } from "@/lib/discounts";

// Buying the plan a therapist recommended.
//
// The patient sends one thing that decides the price: which recommendation
// they are accepting (plus, optionally, a promo code's name and, for home
// visits, where).
// Everything else -- what it costs, how many sessions it is, how long it
// lasts -- is re-derived here from the catalog row the version names. A
// body that carried a price or a session count would be a body worth
// tampering with, so it carries neither.
//
// The purchase row itself is an ordinary `patient_package_purchases` /
// `home_visit_package_purchases` row with `care_plan_version_id` set. That
// is deliberate: every piece of machinery that already works on a purchase
// -- the entitlement backfill, booking, the therapist lock, expiry,
// refunds, the ledger mirror -- keeps working unchanged, and the only new
// thing is the link back to the recommendation it came from.
export async function POST(request: NextRequest) {

  // Who is asking, before anything the caller sent is looked at. An
  // anonymous request is refused here rather than after body validation,
  // so an unauthenticated caller never drives this route's parsing and is
  // never told what shape the request should have been.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { data: body, error: parseError } = await parseJsonBody<{
    carePlanVersionId?: string;
    // Only read for a home-visit recommendation. Either an address the
    // patient already has on file, or a new one to save.
    addressId?: string | null;
    address?: HomeVisitAddressPayload | null;
    // The name of a promo code the patient applied on the review page --
    // an identifier, never an amount. Every figure comes from its row.
    promoCode?: string | null;
  }>(request);
  if (parseError) return parseError;

  const carePlanVersionId = body.carePlanVersionId?.trim();
  if (!carePlanVersionId) {
    return NextResponse.json({ error: "Missing carePlanVersionId" }, { status: 400 });
  }

  // Same gate as the other purchase-start routes: a completed,
  // signature-verified payment is itself the vetting `approved` provides,
  // and a patient who has just been seen by a therapist is by definition
  // not a fake signup.
  const activeStanding = await isProfileActive(user.id);
  if (activeStanding === null) return profileCheckUnavailable();
  if (!activeStanding) {
    return NextResponse.json(
      { error: "Your account is not active - it may have been suspended." },
      { status: 403 }
    );
  }
  const isPatient = await isPatientProfile(user.id);
  if (isPatient === null) return profileCheckUnavailable();
  if (!isPatient) {
    return NextResponse.json(
      { error: "This account can't buy sessions. Sessions are bought under a patient account." },
      { status: 403 }
    );
  }

  const admin = createAdminClient();

  // Which plan, whether it may be bought now, and what the catalog prices it
  // at -- the same checks /api/care-plan/quote makes, from the same module,
  // so the page cannot be shown a price for a plan this route then refuses.
  const loaded = await loadProgrammeForCheckout(admin, user.id, carePlanVersionId);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }
  const programme = loaded.programme;
  const offerKind = programme.offerKind;
  const live = { snapshot: programme.snapshot, categoryId: programme.categoryId };
  const packageId = programme.packageId;

  // A recommended home visit needs somewhere to be delivered, and this is
  // the point at which that is decided.
  //
  // This route used to insert a home-visit purchase with neither
  // `default_address_id` nor `travel_fee_paise` set. Both are load-bearing:
  // /api/home-visit/book-visits refuses outright without the first ("this
  // package has no saved address on file" -- discovered by the patient
  // after paying), and the second is what the therapist is reimbursed for
  // travelling.
  // The visitor's country: an online programme is priced for it, and a home
  // visit is refused outside India unless an admin has allowed it.
  const requestPricing = await pricingForRequest(admin, request);

  let resolvedAddress: ResolvedHomeVisitAddress | null = null;
  if (offerKind === "home_visit_package") {
    // Outside India, and the master switch: an admin who turns home visits
    // off has stopped the service, and a recommendation written before that
    // must not stay purchasable. A failed read still refuses, as a 503.
    const refusal = await homeVisitRefusal(
      admin,
      requestPricing.homeVisitsOffered,
      HOME_VISIT_OUTSIDE_INDIA_ERROR
    );
    if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });

    const resolution = await resolveHomeVisitAddress(admin, user.id, {
      addressId: body.addressId,
      address: body.address,
    });
    if (!resolution.ok) {
      return NextResponse.json({ error: resolution.error }, { status: resolution.status });
    }
    resolvedAddress = resolution.address;
  }

  // The programme line as charged: outside India an online programme costs
  // the rupee equal of its local price, the figure the page showed. A
  // home-visit programme is delivered in India and stays in rupees.
  const listPricePaise = programmeListPricePaise(programme, requestPricing.pricing);
  const table = programme.table;
  const typedPromoCode = (body.promoCode ?? "").trim();

  // Idempotency before the order is minted: the unique index on
  // care_plan_version_id means a second Accept finds the first purchase
  // rather than creating a parallel one. A purchase that is still unpaid is
  // reused, so a patient who abandoned checkout and came back does not
  // accumulate orders -- and its figures are rewritten below, because the
  // address, the travel and the code may all have changed since.
  const existingPurchase = await findProgrammePurchase(admin, programme);

  if (existingPurchase?.payment_status === "paid") {
    return NextResponse.json({ error: "You've already bought this plan." }, { status: 409 });
  }

  let purchaseId = existingPurchase?.id ?? null;

  if (!purchaseId) {
    // Continuity: the therapist who recommended it is the one who delivers
    // it, which is the point of recommending after seeing someone.
    const lockedTherapistId = live.snapshot.therapistLocked ? programme.therapistId : null;

    // Inserted at list price; the code (if any) is claimed against this row
    // next, and the figures the order is minted at are written back with
    // its id. The two branches are written out rather than unioned into one
    // object: the tables genuinely have different columns (session_count vs
    // visit_count, and only the online one carries a category), and a union
    // here is a shape the query builder cannot check.
    const created =
      offerKind === "session_package"
        ? await admin
            .from("patient_package_purchases")
            .insert({
              patient_id: user.id,
              package_id: packageId,
              category_id: live.categoryId,
              session_count: live.snapshot.sessionCount,
              amount_paid_paise: listPricePaise,
              care_plan_version_id: carePlanVersionId,
              locked_therapist_id: lockedTherapistId,
            })
            .select("id")
            .single()
        : await admin
            .from("home_visit_package_purchases")
            .insert({
              patient_id: user.id,
              package_id: packageId,
              visit_count: live.snapshot.sessionCount,
              amount_paid_paise: listPricePaise,
              travel_fee_paise: resolvedAddress?.travelFeePaise ?? 0,
              payment_mode: "prepaid",
              default_address_id: resolvedAddress?.addressId ?? null,
              care_plan_version_id: carePlanVersionId,
              locked_therapist_id: lockedTherapistId,
            })
            .select("id")
            .single();

    if (created.error || !created.data) {
      if (created.error?.code === "23505") {
        return NextResponse.json(
          { error: "This plan is already being paid for. Refresh and try again." },
          { status: 409 }
        );
      }
      console.error(
        "Failed to create a purchase for a care plan",
        carePlanVersionId,
        created.error
      );
      return NextResponse.json(
        { error: "Could not start payment. Please try again." },
        { status: 500 }
      );
    }
    purchaseId = created.data.id;
  }
  const purchaseRowId: string = purchaseId!;

  // The code, claimed under the same row lock a session's claim takes, so a
  // code's cap is one number across sessions and programmes. A refused code
  // refuses the checkout: the page showed a total with it applied, and
  // charging more than that is the one outcome a payment screen must never
  // produce. A retry carrying no code (or a refused one) gives back any
  // claim an earlier attempt left on this purchase, so the row names the
  // code its price actually used.
  let promoOutcome: DiscountOutcome | null = null;
  if (typedPromoCode) {
    const enabled = await readPromoCodesEnabled(admin);
    const claim = enabled
      ? await claimPromoCodeForPurchase(admin, {
          code: typedPromoCode,
          patientId: user.id,
          purchaseKind: offerKind,
          purchaseId: purchaseRowId,
          listPricePaise,
          patientHasPaidBefore: await patientHasPaidBefore(admin, user.id),
        })
      : ({ ok: false, reason: "unknown", message: "That code isn't recognised." } as const);
    if (!claim.ok) {
      await releasePromoCodeForPurchase(admin, offerKind, purchaseRowId, user.id);
      return NextResponse.json({ error: claim.message }, { status: 409 });
    }
    promoOutcome = claim.outcome;
  } else if (existingPurchase) {
    await releasePromoCodeForPurchase(admin, offerKind, purchaseRowId, user.id);
  }

  const quote = resolveProgrammeQuote({
    listPricePaise,
    sessionCount: live.snapshot.sessionCount,
    travel: resolvedAddress
      ? { state: "ready", perVisitPaise: resolvedAddress.travelFeePaise }
      : { state: "none" },
    travelIncluded: live.snapshot.travelFeeIncluded,
    promo: promoOutcome,
  });
  if (quote.promoRefusal) {
    // A code that would leave nothing to pay for the programme: refused with
    // its own sentence rather than turned into a token charge or a purchase
    // nobody paid for (see programmeCheckoutQuote.ts).
    await releasePromoCodeForPurchase(admin, offerKind, purchaseRowId, user.id);
    return NextResponse.json({ error: quote.promoRefusal }, { status: 409 });
  }
  if (quote.totalPaise === null || !quote.payable) {
    return NextResponse.json({ error: "That programme has no price set." }, { status: 400 });
  }
  const chargePaise = quote.totalPaise;

  let razorpay: Razorpay;
  try {
    razorpay = new Razorpay({
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });
  } catch (err) {
    console.error("Razorpay client construction failed -- check env vars", err);
    return NextResponse.json(
      { error: "Payments are temporarily unavailable. Please try again shortly." },
      { status: 500 }
    );
  }

  // An earlier attempt's order, reused only at the price just resolved --
  // the rule mintAppointmentOrder follows for a session. Handing an old
  // order back before re-pricing is how a code applied after a failed try
  // showed its discount on the page while the sheet charged the old amount.
  let reusable: { id: string; amount: number; currency: string } | null = null;
  if (existingPurchase?.razorpay_order_id) {
    try {
      const prior = await razorpay.orders.fetch(existingPurchase.razorpay_order_id);
      if (prior.status === "paid") {
        // Razorpay already has this money; the browser callback never
        // landed. The webhook fulfils the purchase from that capture, so
        // the honest answer is "already paid", never a second order.
        return NextResponse.json(
          {
            alreadyPaid: true,
            error:
              "This programme was already paid for in a previous attempt - no need to pay again. Refresh in a moment to see it.",
          },
          { status: 409 }
        );
      }
      if (prior.status === "created" || prior.status === "attempted") {
        reusable = { id: prior.id, amount: Number(prior.amount), currency: prior.currency };
      }
    } catch (err) {
      // Too old for Razorpay to still have, most likely. Mint a fresh one
      // rather than blocking the patient from paying at all.
      console.error(
        "Failed to re-check prior Razorpay order for care plan purchase",
        existingPurchase.razorpay_order_id,
        err
      );
    }
  }

  if (reusable && reusable.amount !== chargePaise) {
    // The price moved (a code added, removed or run out, or a different
    // address). Replacing the order is safe only if no payment against it is
    // still in flight -- an authorised one may yet capture, and minting a
    // second order beside it is how a patient pays twice. A lookup that
    // fails is "try again", never "nothing in flight".
    try {
      const priorPayments = await razorpay.orders.fetchPayments(reusable.id);
      const inFlight = priorPayments.items.some(
        (p) => p.status === "created" || p.status === "authorized" || p.status === "captured"
      );
      if (inFlight) {
        return NextResponse.json(
          {
            error:
              "Your last payment for this programme is still being processed. Wait a minute, then refresh before trying again.",
          },
          { status: 409 }
        );
      }
    } catch (err) {
      console.error("Failed to check payments on prior Razorpay order", reusable.id, err);
      return NextResponse.json(
        { error: "We couldn't check your last payment attempt just now. Please try again." },
        { status: 503 }
      );
    }
    reusable = null;
  }

  let order: { id: string; amount: number | string; currency: string };
  if (reusable) {
    order = reusable;
  } else {
    try {
      order = await razorpay.orders.create({
        // The charge, which for a home visit is the programme plus travel.
        // amount_paid_paise on the purchase stays the programme line alone,
        // so travel never lands in revenue.
        amount: chargePaise,
        currency: "INR",
        receipt: purchaseRowId,
      });
    } catch (err) {
      console.error("Razorpay order creation failed for care plan purchase", purchaseRowId, err);
      return NextResponse.json(
        { error: "Could not start payment. Please try again." },
        { status: 500 }
      );
    }
  }

  // The figures this order was minted at, written beside its id so verify,
  // the webhook and every later booking read the same programme price.
  // amount_paid_paise is what is collected for the programme (after the
  // code, before travel); list_price_paise and discount_paise say what it
  // would have been and what came off. Each session booked against the
  // purchase is then amount_paid_paise / count, so revenue and the
  // therapist's share read the discounted figure exactly as a discounted
  // single session does.
  const baseUpdate: Record<string, unknown> = {
    razorpay_order_id: order.id,
    amount_paid_paise: quote.payablePaise,
  };
  if (resolvedAddress) {
    baseUpdate.travel_fee_paise = resolvedAddress.travelFeePaise;
    baseUpdate.default_address_id = resolvedAddress.addressId;
  }
  const discountFacts = {
    list_price_paise: quote.listPricePaise,
    discount_paise: quote.discountPaise,
  };
  let { error: updateError } = await admin
    .from(table)
    .update({ ...baseUpdate, ...discountFacts })
    .eq("id", purchaseRowId);
  if (updateError?.code === "42703" && quote.discountPaise === 0) {
    // A database one apply behind has no discount columns. With nothing
    // taken off there is nothing for them to record, so the order still
    // goes ahead; with a discount it must not, or the books would hold a
    // reduced price with no record of why.
    ({ error: updateError } = await admin.from(table).update(baseUpdate).eq("id", purchaseRowId));
  }
  if (updateError) {
    console.error("Failed to save the order for care plan purchase", purchaseRowId, updateError);
    return NextResponse.json(
      { error: "Could not start payment. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    orderId: order.id,
    amount: Number(order.amount),
    currency: order.currency,
    purchaseId: purchaseRowId,
    offerKind,
    breakdown: {
      listPricePaise: quote.listPricePaise,
      discountPaise: quote.discountPaise,
      packagePricePaise: quote.payablePaise,
      travelFeePaise: quote.travelPerVisitPaise ?? 0,
      travelPaise: quote.travelPaise,
      totalPaise: quote.totalPaise,
    },
  });
}

/**
 * Whether a `first_session_only` code is closed to this patient -- the same
 * question, through the same query, the session checkout asks. Unreadable
 * means "has been here before", which costs such a code rather than giving
 * one away.
 */
async function patientHasPaidBefore(
  admin: ReturnType<typeof createAdminClient>,
  patientId: string
): Promise<boolean> {
  const prior = await countPriorCommittedSessions(admin, patientId);
  if (prior.failed) return true;
  return (prior.count ?? 0) > 0;
}
