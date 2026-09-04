import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import SectionNav, { type SectionNavItem } from "@/components/SectionNav";
import PageHero from "@/components/marketing/PageHero";
import Section from "@/components/marketing/Section";
import IconCard from "@/components/marketing/IconCard";
import Testimonials, {
  type PublicTestimonial,
} from "@/components/marketing/Testimonials";
import ExploreSection from "@/components/marketing/ExploreSection";
import ClosingCta from "@/components/marketing/ClosingCta";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/primitives";
import { readHomeVisitEnabled } from "@/lib/homeVisitFlag";
import { MISSION, VISION, PRINCIPLES, COMMITMENTS } from "@/lib/mission";

export const metadata: Metadata = {
  title: "Our Mission | Dr. Pooja's Physio",
  description:
    "Why this practice exists, the four things we promise every patient, and the three things we will not do.",
};

// No per-user content — cache and revalidate on a timer like the rest of the
// public site.
export const revalidate = 300;

export default async function MissionPage() {
  const supabase = createPublicClient();

  const { data: testimonialRows } = await supabase
    .from("testimonials")
    .select("id, patient_name, quote, rating, condition_label")
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true })
    .limit(6);

  // Portraits in their own call: testimonials.avatar_url is
  // migration-dependent, and a database one merge behind should cost the
  // quotes their faces rather than the whole band.
  const { data: avatarRows } = await supabase
    .from("testimonials")
    .select("id, avatar_url");
  const avatarById = new Map(
    (avatarRows ?? []).map((row) => [row.id, row.avatar_url as string | null])
  );
  const testimonials: PublicTestimonial[] = (testimonialRows ?? []).map((t) => ({
    ...t,
    avatar_url: avatarById.get(t.id) ?? null,
  }));

  // Real, aggregated rating data — never individual reviews or names, see the
  // schema comment on public_rating_summary. It sits under the mission
  // because a promise is worth more next to a number nobody curated.
  const { data: ratingSummary } = await supabase
    .from("public_rating_summary")
    .select("avg_rating, rating_count")
    .single();
  const hasRealRatings = !!ratingSummary && ratingSummary.rating_count > 0;

  const homeVisitEnabled = await readHomeVisitEnabled();

  // Only sections that render: the testimonial band is admin-controlled, so
  // its rail entry is conditional. Order matches the DOM.
  const sectionNavItems: SectionNavItem[] = [
    { id: "why-we-exist", label: "Why We Exist", icon: "fa-bullseye" },
    { id: "what-we-promise", label: "What We Promise", icon: "fa-handshake" },
    { id: "what-we-wont-do", label: "What We Won't Do", icon: "fa-hand" },
    ...(testimonials.length > 0
      ? [{ id: "patient-stories", label: "Patient Stories", icon: "fa-star" }]
      : []),
    { id: "explore", label: "Explore the Site", icon: "fa-compass" },
    { id: "get-started", label: "Get Started", icon: "fa-rocket" },
  ];

  return (
    <>
      <SectionNav items={sectionNavItems} />

      <PageHero
        eyebrow="Our mission"
        title="Distance was never the clinical problem"
        subtitle="Physiotherapy needs someone watching you move. It never needed the same room."
        primary={{ href: "/book", label: "Book an assessment", icon: "fa-calendar-check" }}
        secondary={{ href: "/team", label: "Meet the team" }}
        photoId="hero-mission"
        alt="Two patients following their exercise plan together at home, laptop open in front of them"
      />

      {/* Mission and vision as one band, not two. They answer the same
          question at two time horizons, and splitting them into separate
          sections makes a visitor read the page twice to get one idea. */}
      <Section
        id="why-we-exist"
        tone="tint"
        eyebrow="Why we exist"
        title="The practice, in two sentences"
      >
        <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-8">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-700">
                Mission
              </p>
              <p className="font-display mt-4 text-lg font-semibold leading-relaxed tracking-[-0.01em] text-slate-900 sm:text-xl">
                {MISSION}
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="h-full rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-emerald-50/60 p-7 shadow-sm sm:p-8">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-700">
                Vision
              </p>
              <p className="font-display mt-4 text-lg font-semibold leading-relaxed tracking-[-0.01em] text-slate-900 sm:text-xl">
                {VISION}
              </p>
            </div>
          </Reveal>
        </div>
      </Section>

      <Section
        id="what-we-promise"
        eyebrow="What we promise"
        title="Four things, every patient"
        lede="Rules the platform enforces, not intentions."
      >
        <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PRINCIPLES.map((item) => (
            <StaggerItem key={item.key} className="h-full">
              <IconCard icon={item.icon} title={item.title} body={item.body} />
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      {/* The limits, stated on the page rather than buried in the FAQ. A
          clinic that names what it will not do is more believable than one
          claiming everything. */}
      <Section
        id="what-we-wont-do"
        tone="tint"
        eyebrow="And what we won't do"
        title="The limits, stated up front"
      >
        <Stagger className="grid gap-5 md:grid-cols-3">
          {COMMITMENTS.map((item) => (
            <StaggerItem key={item.key} className="h-full">
              <IconCard icon={item.icon} title={item.title} body={item.body} tone="slate" />
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      {testimonials.length > 0 && (
        <Section
          id="patient-stories"
          eyebrow="Patient stories"
          title="Whether any of it holds"
          lede={
            hasRealRatings
              ? `${Number(ratingSummary.avg_rating).toFixed(1)} average across ${ratingSummary.rating_count} completed sessions.`
              : "In their words, not ours."
          }
        >
          <Testimonials testimonials={testimonials} />
        </Section>
      )}

      <ExploreSection current="mission" homeVisitEnabled={homeVisitEnabled} />

      <ClosingCta
        title="The assessment is where this gets tested."
        body="An hour, one-to-one. If it is not right for you, we say so."
        primary={{ href: "/book", label: "Book an assessment", icon: "fa-calendar-check" }}
        secondary={{ href: "/how-it-works", label: "See how it works" }}
        photoId="cta-mission"
        photoAlt="Two people on a sofa in a bright room, one following a session on a laptop"
      />
    </>
  );
}
