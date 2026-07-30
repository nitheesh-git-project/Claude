import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Conditions Treated | Dr. Pooja's Physio",
  description:
    "Specialized virtual rehabilitation programs for spine & posture issues and post-surgical recovery.",
};

export default async function ConditionsPage() {
  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("treatment_categories")
    .select("id, title, description, points, price_paise, duration_minutes, cta_label")
    .eq("active", true)
    .order("display_order", { ascending: true });

  return (
    <section className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="bg-teal-900 text-white p-8 rounded-2xl mb-10 shadow-lg">
        <h1 className="text-3xl font-extrabold">
          Specialized Virtual Rehabilitation Programs
        </h1>
        <p className="text-teal-100 mt-2 text-sm max-w-2xl">
          Clinical assessment and personalized exercise therapy designed for
          high recovery success over video calls.
        </p>
      </div>
      <div className="space-y-8">
        {(categories ?? []).map((cat, i) => (
          <div
            key={cat.id}
            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm grid md:grid-cols-3 gap-6 items-center"
          >
            <div className="md:col-span-2">
              <span className="text-xs font-bold text-teal-700 uppercase tracking-wider">
                Category {i + 1}
              </span>
              <h2 className="text-2xl font-bold text-slate-900 mt-1">
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
              <Link
                href={`/book?category=${cat.id}`}
                className="mt-3 inline-block w-full bg-teal-700 hover:bg-teal-800 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition text-center"
              >
                {cat.cta_label}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
