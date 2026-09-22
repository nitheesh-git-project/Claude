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
  title: "Book a Home Visit | Dr. Pooja's Physio",
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

  const { data: settingsRow } = await supabase
    .from("site_settings")
    .select("home_visit_enabled, home_visit_lead_time_hours, home_visit_cash_enabled")
    .maybeSingle();

  if (settingsRow?.home_visit_enabled !== true) {
    notFound();
  }

  const { data: packages } = await supabase
    .from("home_visit_packages")
    .select("id, title, visit_count, price_paise, visit_duration_minutes, travel_fee_included")
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

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
            packages={(packages ?? []) as WizardPackage[]}
            leadTimeHours={leadTimeHours}
            cashEnabled={cashEnabled}
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
