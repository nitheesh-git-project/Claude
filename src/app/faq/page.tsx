import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import FaqAccordion from "@/components/FaqAccordion";
import SectionNav, { type SectionNavItem } from "@/components/SectionNav";
import PageHero from "@/components/marketing/PageHero";
import Section from "@/components/marketing/Section";
import ExploreSection from "@/components/marketing/ExploreSection";
import ClosingCta from "@/components/marketing/ClosingCta";
import { readHomeVisitEnabled } from "@/lib/homeVisitFlag";

export const metadata: Metadata = {
  title: "FAQ | Dr. Pooja's Physio",
  description:
    "Cost, refunds, privacy and how a video physiotherapy session actually runs — answered before you book.",
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
  const homeVisitEnabled = await readHomeVisitEnabled();

  const sectionNavItems: SectionNavItem[] = [
    { id: "questions", label: "Questions", icon: "fa-circle-question" },
    { id: "explore", label: "Explore the Site", icon: "fa-compass" },
    { id: "still-unsure", label: "Still Unsure?", icon: "fa-calendar-check" },
  ];

  return (
    <>
      <SectionNav items={sectionNavItems} />

      <PageHero
        eyebrow="Questions"
        title="Answered before you book"
        subtitle="Cost, refunds, privacy, and what a session is actually like. If your question is not here, the assessment call is the place to ask it."
        primary={{ href: "/book", label: "Book an assessment", icon: "fa-calendar-check" }}
        secondary={{ href: "/how-it-works", label: "See how it works" }}
        photoId="hero-faq"
        alt="A clinician talking a patient through their treatment options across a desk"
      />

      <Section id="questions" eyebrow="Common questions" title="Everything people ask">
        <div className="mx-auto max-w-3xl">
          {rows.length > 0 ? (
            <FaqAccordion faqs={rows} />
          ) : (
            <p className="text-center text-sm text-slate-500">
              No questions posted yet — check back soon.
            </p>
          )}
        </div>
      </Section>

      <ExploreSection current="faq" homeVisitEnabled={homeVisitEnabled} />

      <ClosingCta
        id="still-unsure"
        title="Still unsure whether this will help?"
        body="The assessment exists to answer exactly that. If virtual care is not right for your case, your therapist will tell you so."
        primary={{ href: "/book", label: "Book an assessment", icon: "fa-calendar-check" }}
      />
    </>
  );
}
