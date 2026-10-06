import { Suspense } from "react";
import BookingExitLink from "@/components/booking/BookingExitLink";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import HomeVisitBookingWizard, {
  type WizardPackage,
} from "@/components/HomeVisitBookingWizard";
import { Reveal } from "@/components/motion/primitives";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";

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

export default async function BookHomeVisitPage() {
  const supabase = createPublicClient();

  const [{ data: settingsRow }, { data: triesRow }] = await Promise.all([
    supabase
      .from("site_settings")
      .select("home_visit_enabled, home_visit_lead_time_hours, home_visit_cash_enabled")
      .maybeSingle(),
    // Its own query, so a database without the column yet keeps the default
    // rather than losing the page.
    supabase.from("site_settings").select("payment_tries_before_access").maybeSingle(),
  ]);

  if (settingsRow?.home_visit_enabled !== true) {
    notFound();
  }

  // Everything the service picker's card and detail view read. All of these
  // except the focal pair are original columns on this table, so they come
  // in the one query; `image_url` among them, which is why /home-visit has
  // always been able to show a photograph and this page has not.
  const { data: packages } = await supabase
    .from("home_visit_packages")
    // One string literal rather than a concatenation: supabase-js infers the
    // row type from the literal, and joining two halves with `+` throws that
    // away and hands every caller `GenericStringError`.
    // prettier-ignore
    .select("id, title, visit_count, price_paise, visit_duration_minutes, travel_fee_included, subtitle, description, terms, badge_label, highlight, benefits, compare_at_paise, validity_days, therapist_locked, image_url")
    .eq("active", true)
    // Not a course row: those exist only for recommendations (carePlanServer.ts).
    .eq("care_plan_course", false)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  // Where the subject of each cover sits. Its own call, because these two
  // are migration-dependent where every column above is not: folded in, an
  // unapplied migration would take the whole booking funnel down rather
  // than costing the photographs their position.
  const { data: packageFocals } = await supabase
    .from("home_visit_packages")
    .select("id, image_focal_x, image_focal_y")
    .eq("active", true);

  const focalByPackageId = new Map(
    (packageFocals ?? []).map((row) => [
      row.id,
      { image_focal_x: row.image_focal_x, image_focal_y: row.image_focal_y },
    ])
  );
  const wizardPackages = (packages ?? []).map((p) => ({
    ...p,
    ...(focalByPackageId.get(p.id) ?? {}),
  })) as WizardPackage[];

  const leadTimeHours =
    settingsRow?.home_visit_lead_time_hours ?? DEFAULT_ADMIN_SETTINGS.homeVisitLeadTimeHours;
  // Defaults to true (DEFAULT_ADMIN_SETTINGS.homeVisitCashEnabled) -- only
  // an explicit false hides the pay-at-the-door option.
  const cashEnabled = settingsRow?.home_visit_cash_enabled !== false;

  return (
    <section className="min-h-screen bg-gradient-to-b from-teal-50/50 to-slate-100 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
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
            packages={wizardPackages}
            leadTimeHours={leadTimeHours}
            cashEnabled={cashEnabled}
            paymentTriesBeforeAccess={
              typeof triesRow?.payment_tries_before_access === "number"
                ? triesRow.payment_tries_before_access
                : DEFAULT_ADMIN_SETTINGS.paymentTriesBeforeAccess
            }
          />
        </Suspense>
        {/* This route hides the site nav (see NAV_HIDDEN_ROUTES) so a stray
            link can't lose someone's progress mid-payment -- same reasoning
            as /book, and the same single deliberate exit, placed clear of
            the wizard's own Back/Continue controls. */}
        <BookingExitLink signedOutHref="/home-visit" signedOutLabel="Back to Home Visit" />
      </div>
    </section>
  );
}
