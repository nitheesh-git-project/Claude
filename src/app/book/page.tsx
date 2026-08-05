import { Suspense } from "react";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import BookingWizard from "@/components/BookingWizard";

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
    <section className="py-12 px-4 sm:px-6 lg:px-8 bg-slate-100 min-h-screen">
      <div className="max-w-2xl mx-auto">
        <Suspense fallback={null}>
          <BookingWizard initialCategories={categories ?? []} />
        </Suspense>
      </div>
    </section>
  );
}
