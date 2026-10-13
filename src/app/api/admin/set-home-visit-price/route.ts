import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";
import { loadHomeVisitPriceRows } from "@/lib/homeVisitRatesServer";
import {
  clinicWideHomeVisitRate,
  DEFAULT_HOME_VISIT_MINUTES,
  ownHomeVisitRate,
} from "@/lib/homeVisitRates";

// Catalog -> Conditions -> Home visits. One visit each, so a price is the
// whole of what is set here: no visit count, no validity, no days.
//
//   { categoryId: null, pricePaise, durationMinutes }  the clinic-wide price
//   { categoryId, pricePaise }                          a condition's own price
//   { categoryId, useClinicWide: true }                 drop the condition's own
//
// Stored on `home_visit_packages` (see src/lib/homeVisitRates.ts for why).
// A price is edited in place: a purchase snapshots its own amount and visit
// count at checkout, so a new figure only reaches future sales. "Use
// clinic-wide" switches the row off rather than deleting it, because old
// purchases and recommendations may point at it.
//
// The visit length is the clinic's, not a condition's: setting it on the
// clinic-wide row moves every condition's own row with it, and a new own
// price starts from it.

/** The most a single visit can be priced at: a typo guard, not a policy. */
const MAX_PRICE_PAISE = 10_000_000; // ₹1,00,000
const MIN_MINUTES = 15;
const MAX_MINUTES = 480;

const DUPLICATE_MESSAGE =
  "Someone else set this price at the same moment. Nothing was changed - refresh to see theirs, then try again.";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("catalog");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    categoryId?: string | null;
    pricePaise?: number;
    durationMinutes?: number;
    useClinicWide?: boolean;
  }>(request);
  if (parseError) return parseError;

  const categoryId =
    typeof body.categoryId === "string" && body.categoryId.trim() !== "" ? body.categoryId.trim() : null;
  const useClinicWide = body.useClinicWide === true;

  if (useClinicWide && !categoryId) {
    return NextResponse.json(
      { error: "Only a condition's own price can be dropped. The clinic-wide price can be changed, not removed." },
      { status: 400 }
    );
  }

  const pricePaise = body.pricePaise;
  if (!useClinicWide) {
    if (
      typeof pricePaise !== "number" ||
      !Number.isSafeInteger(pricePaise) ||
      pricePaise <= 0 ||
      pricePaise > MAX_PRICE_PAISE
    ) {
      return NextResponse.json(
        { error: "Enter a price above ₹0 and no more than ₹1,00,000." },
        { status: 400 }
      );
    }
  }

  const durationMinutes = body.durationMinutes;
  if (
    durationMinutes !== undefined &&
    (typeof durationMinutes !== "number" ||
      !Number.isInteger(durationMinutes) ||
      durationMinutes < MIN_MINUTES ||
      durationMinutes > MAX_MINUTES)
  ) {
    return NextResponse.json(
      { error: `A visit lasts between ${MIN_MINUTES} and ${MAX_MINUTES} minutes, in whole minutes.` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  let categoryTitle: string | null = null;
  if (categoryId) {
    const { data: category, error: categoryError } = await admin
      .from("treatment_categories")
      .select("id, title")
      .eq("id", categoryId)
      .maybeSingle();
    if (categoryError) return serverError("admin/set-home-visit-price", categoryError);
    if (!category) {
      return NextResponse.json({ error: "That condition doesn't exist any more." }, { status: 404 });
    }
    categoryTitle = category.title as string;
  }

  const rows = await loadHomeVisitPriceRows(admin);
  if (rows === null) {
    return NextResponse.json(
      { error: "Couldn't read the current home-visit prices. Nothing was changed - try again." },
      { status: 503 }
    );
  }
  const clinic = clinicWideHomeVisitRate(rows);
  const current = categoryId ? ownHomeVisitRate(rows, categoryId) : clinic;
  const label = categoryTitle ? `Home-visit price · ${categoryTitle}` : "Home-visit price · clinic-wide";

  // ---- Use clinic-wide: switch the condition's own row(s) off ----------
  if (useClinicWide) {
    if (!current) {
      return NextResponse.json({ success: true, unchanged: true });
    }
    // Every active one-visit row for the condition, not only the one this
    // module picked: on a database without the unique index there may be two,
    // and leaving the second on would leave an own price the screen says is gone.
    const { error } = await admin
      .from("home_visit_packages")
      .update({ active: false })
      .eq("category_id", categoryId!)
      .eq("visit_count", 1)
      .eq("care_plan_course", false)
      .eq("active", true);
    if (error) return serverError("admin/set-home-visit-price", error);

    revalidatePath("/home-visit");
    await recordAdminActivity(admin, adminUser.id, {
      action: "catalog.update",
      targetId: current.packageId,
      targetLabel: label,
      details: {
        change: "use_clinic_wide",
        fromPricePaise: current.pricePaise,
        toPricePaise: clinic?.pricePaise ?? null,
      },
    });
    return NextResponse.json({ success: true });
  }

  const price = pricePaise as number;
  const minutes =
    durationMinutes ??
    current?.durationMinutes ??
    clinic?.durationMinutes ??
    DEFAULT_HOME_VISIT_MINUTES;

  // ---- Change an existing price in place --------------------------------
  if (current) {
    const { error } = await admin
      .from("home_visit_packages")
      .update({
        price_paise: price,
        visit_duration_minutes: minutes,
        // A price row is one visit with no validity of its own; the
        // clinic-wide default in Settings decides when it lapses.
        validity_days: null,
        compare_at_paise: null,
      })
      .eq("id", current.packageId);
    if (error) return serverError("admin/set-home-visit-price", error);
  } else {
    const { error } = await admin.from("home_visit_packages").insert({
      title: categoryTitle ? `${categoryTitle} home visit` : "Home visit",
      category_id: categoryId,
      visit_count: 1,
      price_paise: price,
      visit_duration_minutes: minutes,
      validity_days: null,
      travel_fee_included: false,
      therapist_locked: true,
      recommendable: true,
      visible_on_home_visit_page: true,
      visible_in_dashboard: true,
      care_plan_course: false,
      active: true,
    });
    if (error) {
      // The unique index on one active price per condition: two admins
      // setting the same price at once. Said, never a 500.
      if (error.code === "23505") {
        return NextResponse.json({ error: DUPLICATE_MESSAGE }, { status: 409 });
      }
      return serverError("admin/set-home-visit-price", error);
    }
  }

  // The visit length is the clinic's: moving it on the clinic-wide row moves
  // every condition's own row too, so one condition cannot quietly book a
  // shorter visit than the rest.
  let lengthNotMoved = false;
  if (!categoryId && durationMinutes !== undefined) {
    const { error } = await admin
      .from("home_visit_packages")
      .update({ visit_duration_minutes: durationMinutes })
      .not("category_id", "is", null)
      .eq("visit_count", 1)
      .eq("care_plan_course", false)
      .eq("active", true);
    if (error) {
      console.error("admin/set-home-visit-price: own rows kept their visit length", error.message);
      lengthNotMoved = true;
    }
  }

  revalidatePath("/home-visit");
  await recordAdminActivity(admin, adminUser.id, {
    action: current ? "catalog.update" : "catalog.create",
    targetId: current?.packageId ?? categoryId ?? null,
    targetLabel: label,
    details: {
      change: categoryId ? "own_price" : "clinic_wide_price",
      fromPricePaise: current?.pricePaise ?? null,
      toPricePaise: price,
      durationMinutes: minutes,
    },
  });

  return NextResponse.json({
    success: true,
    ...(lengthNotMoved
      ? {
          warning:
            "Saved, but the conditions with their own price kept their old visit length. Save again to move them.",
        }
      : {}),
  });
}
