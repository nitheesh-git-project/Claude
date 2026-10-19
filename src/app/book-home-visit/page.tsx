import { Suspense } from "react";
import HomeVisitOnly, { HomeVisitUnavailable } from "@/components/pricing/HomeVisitOnly";
import BookingExitLink from "@/components/booking/BookingExitLink";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import HomeVisitBookingWizard from "@/components/HomeVisitBookingWizard";
import { Reveal } from "@/components/motion/primitives";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";
import { loadHomeVisitConditions } from "@/lib/homeVisitRatesServer";
import { categoryForLegacyPackageLink } from "@/lib/homeVisitRates";
import { defaultCategoryId } from "@/lib/serviceOptions";

export const metadata: Metadata = {
  title: "Book a Home Visit | MoveRestore",
  description: "Book a physiotherapist to visit you at home.",
};

// Rendered per request, unlike /book and every other public page here, and
// the master switch is the whole reason.
//
// This page exists only while the clinic sells home visits: it reads
// `home_visit_enabled` and 404s when it is off. Under ISR that judgement is
// made when the page is *generated*, so an admin who switches home visits
// off is relying on a cache being purged for the door to actually close --
// `update-setting` does call `revalidatePath`, but anything that changes the
// column another way (a hand edit, a data reset, a restore) leaves the
// booking funnel for a service the clinic has stopped offering open until
// the window lapses. A patient reaching it is quoted a price and asked to
// pay for a visit nobody will make.
//
// The cost is two reads per view on a page reached by a deliberate tap, and
// every route behind it re-checks the switch server-side anyway. /home-visit
// stays ISR-cached: it is a marketing page rather than a checkout, and the
// same revalidate keeps it honest.
export const dynamic = "force-dynamic";

export default async function BookHomeVisitPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string | string[]; package?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedCategory = typeof params.category === "string" ? params.category : null;
  const requestedPackage = typeof params.package === "string" ? params.package : null;
  const supabase = createPublicClient();

  const [{ data: settingsRow }, { data: triesRow }, defaultServiceRead] = await Promise.all([
    supabase
      .from("site_settings")
      .select("home_visit_enabled, home_visit_lead_time_hours, home_visit_cash_enabled")
      .maybeSingle(),
    // Its own query, so a database without the column yet keeps the default
    // rather than losing the page.
    supabase.from("site_settings").select("payment_tries_before_access").maybeSingle(),
    // The service switched on as "Default on booking" (Catalog ->
    // Conditions), in its own query so a database without the column falls
    // back to the general consultation rather than losing the page.
    supabase.from("treatment_categories").select("id").eq("active", true).eq("is_default", true).limit(1),
  ]);
  // undefined = could not be read; null = read, and none is switched on.
  const defaultServiceId: string | null | undefined = defaultServiceRead.error
    ? undefined
    : ((defaultServiceRead.data?.[0]?.id as string | undefined) ?? null);

  if (settingsRow?.home_visit_enabled !== true) {
    notFound();
  }

  // Every condition, each as one visit at its home-visit price (its own
  // price, else the clinic-wide one -- src/lib/homeVisitRates.ts). The price
  // shown here is a quote; both checkouts re-resolve it from the condition.
  const { conditions } = await loadHomeVisitConditions(supabase);

  // Which condition the picker opens on. `?category=` is what the cards on
  // /home-visit and the booking hub send. `?package=` is the old link to a
  // price row: a condition's own price opens that condition, the clinic-wide
  // one opens the general consultation, and a course of visits is answered
  // as a programme rather than quietly swapped for a single visit.
  const offeredIds = new Set(conditions.map((c) => c.id));
  // The admin's "Default on booking" service, or the only condition there
  // is -- never the first by display order (see defaultCategoryId): with
  // several and none switched on, the picker opens unanswered.
  const fallbackCategoryId =
    defaultCategoryId(conditions, null, defaultServiceId) ||
    (conditions.length === 1 ? conditions[0].id : "");
  let initialCategoryId =
    defaultCategoryId(conditions, requestedCategory, defaultServiceId) || fallbackCategoryId;
  let requestedIsProgramme = false;
  if (!requestedCategory && requestedPackage) {
    const { data: legacyRow } = await supabase
      .from("home_visit_packages")
      .select("category_id, visit_count")
      .eq("id", requestedPackage)
      .maybeSingle();
    const answer = categoryForLegacyPackageLink(legacyRow ?? null, offeredIds, fallbackCategoryId);
    if (answer.programme) requestedIsProgramme = true;
    else initialCategoryId = answer.categoryId;
  }

  const leadTimeHours =
    settingsRow?.home_visit_lead_time_hours ?? DEFAULT_ADMIN_SETTINGS.homeVisitLeadTimeHours;
  // Defaults to true (DEFAULT_ADMIN_SETTINGS.homeVisitCashEnabled) -- only
  // an explicit false hides the pay-at-the-door option.
  const cashEnabled = settingsRow?.home_visit_cash_enabled !== false;

  return (
    <section className="min-h-screen bg-gradient-to-b from-teal-50/50 to-slate-100 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <HomeVisitOnly fallback={<HomeVisitUnavailable />}>
        <Reveal className="mb-8 text-center">
          <h1 className="font-display text-2xl font-extrabold text-slate-900 sm:text-3xl">
            Book a Home Visit
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            We&apos;ll check we can reach you first - nothing is charged until then.
          </p>
        </Reveal>
        <Suspense fallback={null}>
          <HomeVisitBookingWizard
            conditions={conditions}
            initialCategoryId={initialCategoryId}
            requestedIsProgramme={requestedIsProgramme}
            leadTimeHours={leadTimeHours}
            cashEnabled={cashEnabled}
            paymentTriesBeforeAccess={
              typeof triesRow?.payment_tries_before_access === "number"
                ? triesRow.payment_tries_before_access
                : DEFAULT_ADMIN_SETTINGS.paymentTriesBeforeAccess
            }
          />
        </Suspense>
        </HomeVisitOnly>
        {/* This route hides the site nav (see NAV_HIDDEN_ROUTES) so a stray
            link can't lose someone's progress mid-payment -- same reasoning
            as /book, and the same single deliberate exit, placed clear of
            the wizard's own Back/Continue controls. */}
        <BookingExitLink signedOutHref="/home-visit" signedOutLabel="Back to Home Visit" />
      </div>
    </section>
  );
}
