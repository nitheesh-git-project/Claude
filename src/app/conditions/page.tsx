import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import SectionNav, { type SectionNavItem } from "@/components/SectionNav";
import ProgramCards from "@/components/catalog/ProgramCards";
import PageHero from "@/components/marketing/PageHero";
import Section from "@/components/marketing/Section";
import ExploreSection from "@/components/marketing/ExploreSection";
import ClosingCta from "@/components/marketing/ClosingCta";
import CareAreaShowcase from "@/components/marketing/CareAreaShowcase";
import { readHomeVisitEnabled } from "@/lib/homeVisitFlag";

export const metadata: Metadata = {
  title: "Conditions Treated | Dr. Pooja's Physio",
  description:
    "Back, neck, knee, posture, sports and mobility problems — each with a defined assessment and a structured programme behind it.",
};

// No per-user content on this page — cache and revalidate on a timer
// instead of hitting Supabase on every single visit.
export const revalidate = 300;

type Category = {
  id: string;
  title: string;
  description: string | null;
  points: unknown;
  price_paise: number;
  duration_minutes: number;
  cta_label: string;
};

export default async function ConditionsPage() {
  const supabase = createPublicClient();
  const { data: categories } = await supabase
    .from("treatment_categories")
    .select("id, title, description, points, price_paise, duration_minutes, cta_label")
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  const rows = (categories ?? []) as Category[];

  // No programme catalog here either -- see the note on the home page.
  // A course of treatment comes from a therapist's recommendation after a
  // session they ran, so the public pages quote a first consultation and
  // nothing multi-session.

  // Cover photos live in their own call: treatment_categories.image_url is
  // migration-dependent (added at the end of schema.sql), and one
  // unknown-column error must cost the programmes their photo rather than
  // blank the whole catalog. Same convention as the package detail reads.
  const { data: categoryImages } = await supabase
    .from("treatment_categories")
    .select("id, image_url");
  const imageByCategoryId = new Map(
    (categoryImages ?? []).map((row) => [row.id, row.image_url])
  );

  const programs = rows.map((c) => ({
    ...c,
    image_url: imageByCategoryId.get(c.id) ?? null,
  }));

  const homeVisitEnabled = await readHomeVisitEnabled();

  // Only sections that actually render -- the programmes are
  // admin-controlled, so a rail item pointing at an absent section would be a
  // dead pill and a skipped stop for the scroll arrow. Order matches the DOM.
  const sectionNavItems: SectionNavItem[] = [
    { id: "areas", label: "What We Treat", icon: "fa-bone" },
    ...(rows.length > 0 ? [{ id: "programs", label: "Programs", icon: "fa-clipboard-list" }] : []),
    { id: "explore", label: "Explore the Site", icon: "fa-compass" },
    { id: "not-sure", label: "Not Sure?", icon: "fa-circle-question" },
  ];

  return (
    <>
      <SectionNav items={sectionNavItems} />

      <PageHero
        eyebrow="Conditions treated"
        title="Tell us what hurts"
        subtitle="Six areas of practice. Each with a real programme behind it."
        primary={{ href: "/book", label: "Book an assessment", icon: "fa-calendar-check" }}
        secondary={{ href: "/faq", label: "Read common questions" }}
        photoId="hero-conditions"
        alt="A patient holding a balance exercise on her mat at home, laptop open beside her"
      />

      {/* Breadth first, catalog second. The old page opened straight into the
          admin-configured programme cards, so a visitor whose complaint was
          not one of the configured programme titles concluded we did not
          treat it. */}
      <Section
        id="areas"
        eyebrow="Areas of practice"
        title="Where we can help"
        lede="Whichever fits, the first step is the same."
      >
        <CareAreaShowcase href="/book" ctaLabel="Book an assessment" />
      </Section>

      {rows.length > 0 && (
        <Section
          id="programs"
          tone="tint"
          eyebrow="Structured programmes"
          title="What you can book today"
          lede="Same 60-minute assessment. Different protocol."
        >
          <ProgramCards programs={programs} />
        </Section>
      )}


      <ExploreSection current="conditions" homeVisitEnabled={homeVisitEnabled} />

      <ClosingCta
        id="not-sure"
        title="Not sure which one fits?"
        body="Book the standard assessment. Your therapist picks the protocol."
        primary={{ href: "/book", label: "Book an assessment", icon: "fa-calendar-check" }}
        secondary={{ href: "/faq", label: "Read the FAQ" }}
        photoId="cta-conditions"
        photoAlt="A patient sitting at home, laughing as she books on her phone"
      />
    </>
  );
}
