import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { Reveal, Stagger, StaggerItem, MotionButton, FloatingOrbs } from "@/components/motion/primitives";

export const metadata: Metadata = {
  title: "Conditions Treated | Dr. Pooja's Physio",
  description:
    "Specialized virtual rehabilitation programs for spine & posture issues and post-surgical recovery.",
};

// No per-user content on this page — cache and revalidate on a timer
// instead of hitting Supabase on every single visit.
export const revalidate = 300;

export default async function ConditionsPage() {
  const supabase = createPublicClient();
  const { data: categories } = await supabase
    .from("treatment_categories")
    .select("id, title, description, points, price_paise, duration_minutes, cta_label")
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  return (
    <section className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <Reveal className="relative overflow-hidden bg-gradient-to-br from-teal-900 to-emerald-800 text-white p-8 sm:p-10 rounded-2xl mb-10 shadow-xl">
        <FloatingOrbs className="opacity-30" />
        <h1 className="relative font-display text-3xl sm:text-4xl font-extrabold">
          Specialized Virtual Rehabilitation Programs
        </h1>
        <p className="relative text-teal-100 mt-3 text-sm max-w-2xl">
          Clinical assessment and personalized exercise therapy designed for
          high recovery success over video calls.
        </p>
      </Reveal>
      <Stagger className="space-y-8">
        {(categories ?? []).map((cat, i) => (
          <StaggerItem key={cat.id}>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:shadow-slate-900/5 hover:border-teal-200 transition-shadow grid md:grid-cols-3 gap-6 items-center">
              <div className="md:col-span-2">
                <span className="text-xs font-bold text-teal-700 uppercase tracking-wider">
                  Category {i + 1}
                </span>
                <h2 className="font-display text-2xl font-bold text-slate-900 mt-1">
                  {cat.title}
                </h2>
                {cat.description && (
                  <p className="text-xs text-slate-600 mt-2">{cat.description}</p>
                )}
                {Array.isArray(cat.points) && cat.points.length > 0 && (
                  <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
                    {(cat.points as string[]).map((p) => (
                      <li key={p}>
                        <i className="fa-solid fa-circle-check text-teal-600 mr-2"></i>
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-slate-900">
                  ₹{(cat.price_paise / 100).toFixed(0)} INR{" "}
                  <span className="text-xs text-slate-500 font-normal">
                    / session
                  </span>
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {cat.duration_minutes} min session
                </p>
                <MotionButton
                  href={`/book?category=${cat.id}`}
                  variant="primary"
                  fullWidth
                  className="mt-3 justify-center text-xs py-2.5"
                >
                  {cat.cta_label}
                </MotionButton>
              </div>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
