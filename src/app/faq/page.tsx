import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { Reveal, MotionButton, FloatingOrbs } from "@/components/motion/primitives";
import FaqAccordion from "@/components/FaqAccordion";
import SectionNav, { type SectionNavItem } from "@/components/SectionNav";

export const metadata: Metadata = {
  title: "FAQ | Dr. Pooja's Physio",
  description:
    "Answers about booking, video consultations, pricing, and how virtual physical therapy actually works.",
};

export const revalidate = 300;

type Faq = { id: string; question: string; answer: string };

export default async function FaqPage() {
  const supabase = createPublicClient();
  const { data: faqs } = await supabase
    .from("faqs")
    .select("id, question, answer")
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  const rows = (faqs ?? []) as Faq[];

  const sectionNavItems: SectionNavItem[] = [
    { id: "questions", label: "Questions", icon: "fa-circle-question" },
    { id: "still-unsure", label: "Still Unsure?", icon: "fa-calendar-check" },
  ];

  return (
    <>
      <SectionNav items={sectionNavItems} />

      <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-b from-teal-50/70 to-white py-16">
        <FloatingOrbs />
        <Reveal className="relative mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            Questions, answered
          </h1>
          <p className="mt-4 text-base text-slate-600">
            The things people most often want to know before booking their
            first virtual session.
          </p>
        </Reveal>
      </div>

      <section id="questions" className="mx-auto max-w-3xl scroll-mt-28 px-4 py-16 sm:px-6 lg:px-8">
        {rows.length > 0 ? (
          <FaqAccordion faqs={rows} />
        ) : (
          <p className="text-center text-sm text-slate-500">
            No questions posted yet — check back soon.
          </p>
        )}

        {/* Wrapper carries the id because Reveal is a pure animation
            primitive and takes no id of its own. */}
        <div id="still-unsure" className="scroll-mt-28">
          <Reveal delay={0.1} className="mt-12 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
            <h2 className="font-display text-lg font-bold text-slate-900">
              Still unsure whether this will help you?
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
              The assessment exists to answer exactly that. If virtual care
              isn&apos;t right for your case, your therapist will tell you so.
            </p>
            <div className="mt-6 flex justify-center">
              <MotionButton href="/book" variant="primary">
                <i className="fa-solid fa-calendar-check" /> Book an Assessment
              </MotionButton>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
