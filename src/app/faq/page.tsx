import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { Reveal } from "@/components/motion/primitives";
import FaqAccordion from "@/components/FaqAccordion";

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
      <Reveal className="text-center max-w-2xl mx-auto mb-12">
        <h1 className="font-display text-3xl font-bold text-slate-900">
          Frequently Asked Questions
        </h1>
        <p className="text-slate-600 mt-2 text-sm">
          Can&apos;t find your answer here? Reach out and we&apos;ll get back
          to you.
        </p>
      </Reveal>

      {faqs && faqs.length > 0 ? (
        <FaqAccordion faqs={faqs} />
      ) : (
        <p className="text-center text-sm text-slate-500">
          No questions posted yet — check back soon.
        </p>
      )}
    </section>
  );
}
