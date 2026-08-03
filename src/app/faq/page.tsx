import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";

export const metadata: Metadata = {
  title: "FAQ | Dr. Pooja's Physio",
  description:
    "Answers to common questions about booking, video consultations, pricing, and how virtual physical therapy works.",
};

export const revalidate = 300;

export default async function FaqPage() {
  const supabase = createPublicClient();
  const { data: faqs } = await supabase
    .from("faqs")
    .select("id, question, answer")
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  return (
    <section className="py-12 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <h1 className="text-3xl font-bold text-slate-900">
          Frequently Asked Questions
        </h1>
        <p className="text-slate-600 mt-2 text-sm">
          Can&apos;t find your answer here? Reach out and we&apos;ll get back
          to you.
        </p>
      </div>

      {faqs && faqs.length > 0 ? (
        <div className="space-y-3">
          {faqs.map((f) => (
            <details
              key={f.id}
              className="group bg-white rounded-xl border border-slate-200 shadow-sm p-5 open:shadow-md transition"
            >
              <summary className="flex items-center justify-between gap-4 cursor-pointer font-bold text-sm text-slate-900 list-none">
                {f.question}
                <i className="fa-solid fa-chevron-down text-teal-600 text-xs transition group-open:rotate-180"></i>
              </summary>
              <p className="text-slate-600 text-sm leading-relaxed mt-3">
                {f.answer}
              </p>
            </details>
          ))}
        </div>
      ) : (
        <p className="text-center text-sm text-slate-500">
          No questions posted yet — check back soon.
        </p>
      )}
    </section>
  );
}
