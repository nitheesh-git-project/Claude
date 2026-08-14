import { Suspense } from "react";
import Link from "next/link";
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

// Same reasoning as /book: createPublicClient() never touches cookies(), so
// this stays ISR-cached rather than being forced dynamic. The wizard's own
// client-side getUser() handles logged-in autofill after hydration; this
// just gets the package list on screen immediately.
export const revalidate = 300;

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
            We&apos;ll check we can reach you first — nothing is charged until then.
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
        <div className="mt-6 flex justify-end">
          <Link
            href="/home-visit"
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 text-xs font-semibold text-slate-500 shadow-sm transition hover:bg-white hover:text-teal-700"
          >
            <i className="fa-solid fa-arrow-left text-[10px]"></i>
            Back to Home Visit
          </Link>
        </div>
      </div>
    </section>
  );
}
