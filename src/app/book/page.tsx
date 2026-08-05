import { Suspense } from "react";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import BookingWizard from "@/components/BookingWizard";
import { Reveal } from "@/components/motion/primitives";

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
  const { data: categories } = await supabase
    .from("treatment_categories")
    .select("id, title, price_paise, duration_minutes")
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

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
          <BookingWizard initialCategories={categories ?? []} />
        </Suspense>
      </div>
    </section>
  );
}
