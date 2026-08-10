import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import BookingWizard from "@/components/BookingWizard";
import BookingBackToSessions from "@/components/BookingBackToSessions";
import { Reveal } from "@/components/motion/primitives";
import { parseBookingLanguages } from "@/lib/adminSettings";

export const metadata: Metadata = {
  title: "Book a Session | Dr. Pooja's Physio",
  description: "Book your virtual physical therapy session.",
};

// createPublicClient() never touches cookies(), so this page ISR-caches the
// same as Conditions/Team/FAQ instead of being forced into per-request
// dynamic rendering -- BookingWizard's own client-side getUser() call still
// handles the logged-in-patient autofill separately, after hydration; this
// just gets Step 1's category dropdown populated immediately instead of
// blank until a client-side fetch resolves.
export const revalidate = 300;

export default async function BookPage() {
  const supabase = createPublicClient();
  const [{ data: categories }, { data: settingsRow }] = await Promise.all([
    supabase
      .from("treatment_categories")
      .select("id, title, price_paise, duration_minutes")
      .eq("active", true)
      .order("display_order", { ascending: true })
      .order("id", { ascending: true }),

    // Step 1's language chips. Kept as its own query (rather than joined
    // into the one above) for the same migration-tolerance reason as the
    // admin dashboard's: if booking_languages doesn't exist yet, this one
    // query fails and parseBookingLanguages falls back to ["English"],
    // instead of the failure blanking the category list too.
    supabase.from("site_settings").select("booking_languages").maybeSingle(),
  ]);

  return (
    <section className="py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-teal-50/50 to-slate-100 min-h-screen">
      <div className="max-w-2xl mx-auto">
        <Reveal className="text-center mb-8">
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
            Book Your Session
          </h1>
          <p className="text-slate-600 text-sm mt-1.5">
            A few quick steps — pick a time, tell us what&apos;s going on, and
            you&apos;re booked.
          </p>
        </Reveal>
        <Suspense fallback={null}>
          {/* Both read the query string, so they share the page's one
              Suspense boundary. */}
          <BookingBackToSessions />
          <BookingWizard
            initialCategories={categories ?? []}
            bookingLanguages={parseBookingLanguages(settingsRow?.booking_languages)}
          />
        </Suspense>
        {/* Outside the wizard card, bottom-right. /book deliberately hides
            the site nav (see NAV_HIDDEN_ROUTES) so a stray link can't lose
            someone's booking progress mid-payment, which left the page with
            no way out at all -- this is the one deliberate exit, placed
            clear of the wizard's own Back/Continue controls so it can't be
            hit by mistake. Sits here rather than inside BookingWizard so it
            shows for every one of the wizard's states (loading, in-progress,
            email-confirmation, paid) without being repeated four times. */}
        <div className="flex justify-end mt-6">
          <Link
            href="/"
            className="text-xs font-semibold text-slate-500 hover:text-teal-700 bg-white/70 hover:bg-white border border-slate-200 px-4 py-2.5 rounded-xl transition shadow-sm flex items-center gap-2"
          >
            <i className="fa-solid fa-arrow-left text-[10px]"></i>
            Back to Home
          </Link>
        </div>
      </div>
    </section>
  );
}
