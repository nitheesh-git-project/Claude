import { createPublicClient } from "@/lib/supabase/public";
import { SESSION_FEE_PAISE } from "@/lib/pricing";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";
import { Reveal, MotionButton } from "@/components/motion/primitives";
import JourneySteps from "@/components/home/JourneySteps";
import SectionNav, { type SectionNavItem } from "@/components/SectionNav";
import ProgramCards from "@/components/catalog/ProgramCards";
import PageHero from "@/components/marketing/PageHero";
import TrustBar from "@/components/marketing/TrustBar";
import Section from "@/components/marketing/Section";
import SplitFeature from "@/components/marketing/SplitFeature";
import ExploreGrid from "@/components/marketing/ExploreGrid";
import MissionPreview from "@/components/marketing/MissionPreview";
import Testimonials, {
  type PublicTestimonial,
} from "@/components/marketing/Testimonials";
import ClosingCta from "@/components/marketing/ClosingCta";
import { homeConnectors } from "@/lib/marketingNav";
import CareAreaShowcase from "@/components/marketing/CareAreaShowcase";

// This page has no per-user content — it can be cached and revalidated
// on a timer instead of hitting Supabase on every single visit.
export const revalidate = 300;

const TRUST_POINTS = [
  { icon: "fa-certificate", label: "Licensed physiotherapists" },
  { icon: "fa-user-check", label: "One-to-one, never a group" },
  { icon: "fa-file-medical", label: "Reports read before your session" },
  { icon: "fa-lock", label: "Secure UPI payment" },
];

export default async function Home() {
  const supabase = createPublicClient();
  const { data: categories } = await supabase
    .from("treatment_categories")
    .select("id, title, description, points, price_paise, duration_minutes, cta_label")
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  // "From ₹X" in the hero should track whatever admins actually configure
  // in Site Content, not a stale constant — falls back to the flat fee
  // only in the unlikely event no categories are active at all.
  const startingPricePaise =
    categories && categories.length > 0
      ? Math.min(...categories.map((c) => c.price_paise))
      : SESSION_FEE_PAISE;

  // Its own call, per the migration-dependent-column rule: a database
  // missing this one must only cost the walkthrough its configured pace.
  const { data: journeyRow } = await supabase
    .from("site_settings")
    .select("journey_step_seconds")
    .maybeSingle();
  const journeyStepSeconds =
    typeof journeyRow?.journey_step_seconds === "number"
      ? journeyRow.journey_step_seconds
      : DEFAULT_ADMIN_SETTINGS.journeyStepSeconds;

  // Home visits are behind an admin master switch and /home-visit 404s while
  // it is off, so both the delivery-mode band and the connector grid have to
  // be able to drop that mode rather than advertise a dead end. Read on its
  // own for the same migration-tolerance reason as the two above.
  const { data: homeVisitRow } = await supabase
    .from("site_settings")
    .select("home_visit_enabled")
    .maybeSingle();
  const homeVisitEnabled = homeVisitRow?.home_visit_enabled === true;

  // No programme catalog on the public site. A course of treatment is a
  // clinical recommendation a therapist writes after a session they ran, so
  // the public pages quote the one thing a visitor can decide for
  // themselves -- a first consultation -- and nothing multi-session. The
  // bands that used to print programme prices here were removed rather than
  // hidden behind a setting: a toggle somebody can flip back on is not the
  // same as the rule being gone, and a price list is exactly what this
  // change exists to stop a patient shopping from.

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

  const programs = (categories ?? []).map((c) => ({
    ...c,
    image_url: imageByCategoryId.get(c.id) ?? null,
  }));

  const { data: testimonialRows } = await supabase
    .from("testimonials")
    .select("id, patient_name, quote, rating, condition_label")
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true })
    .limit(3);

  // Portraits in their own call: testimonials.avatar_url is
  // migration-dependent, so a database one merge behind loses the faces
  // rather than the quotes.
  const { data: testimonialAvatars } = await supabase
    .from("testimonials")
    .select("id, avatar_url");
  const avatarById = new Map(
    (testimonialAvatars ?? []).map((row) => [row.id, row.avatar_url as string | null])
  );
  const testimonials: PublicTestimonial[] = (testimonialRows ?? []).map((t) => ({
    ...t,
    avatar_url: avatarById.get(t.id) ?? null,
  }));

  // Real, aggregated patient rating data (never individual reviews/names —
  // see the schema comment on public_rating_summary for why) surfaced
  // alongside the hand-curated testimonials above.
  const { data: ratingSummary } = await supabase
    .from("public_rating_summary")
    .select("avg_rating, rating_count")
    .single();
  const hasRealRatings = !!ratingSummary && ratingSummary.rating_count > 0;

  // The connector grid: every other page plus booking. Held in a variable so
  // the band's own copy can count it instead of hardcoding a number.
  const connectors = homeConnectors(homeVisitEnabled);

  // Only lists sections that actually render -- several of these blocks
  // below are conditional on admin-controlled data (categories,
  // testimonials), so a nav item pointing at a section that isn't on the
  // page would just do nothing when clicked. Order must match the DOM: the
  // scroll arrow walks this list top to bottom.
  const sectionNavItems: SectionNavItem[] = [
    { id: "two-ways", label: "Two Ways to Start", icon: "fa-video" },
    { id: "our-mission", label: "Our Mission", icon: "fa-bullseye" },
    { id: "what-we-treat", label: "What We Treat", icon: "fa-bone" },
    { id: "how-it-works", label: "How It Works", icon: "fa-route" },
    ...(categories && categories.length > 0
      ? [{ id: "programs", label: "Programs", icon: "fa-clipboard-list" }]
      : []),
    ...(testimonials.length > 0
      ? [{ id: "reviews", label: "Reviews", icon: "fa-star" }]
      : []),
    { id: "explore", label: "Explore the Site", icon: "fa-compass" },
    { id: "get-started", label: "Get Started", icon: "fa-rocket" },
  ];

  return (
    <>
      <SectionNav items={sectionNavItems} />

      <PageHero
        size="large"
        eyebrow="Licensed physiotherapy"
        title={
          <>
            Physiotherapy at home
            <span className="block bg-gradient-to-r from-teal-700 to-emerald-500 bg-clip-text text-transparent">
              over video, or in person
            </span>
          </>
        }
        subtitle="A licensed physiotherapist watches how you move, then builds your plan."
        primary={{ href: "/book", label: "Book a session", icon: "fa-calendar-check" }}
        secondary={{ href: "/how-it-works", label: "See how it works", icon: "fa-circle-play" }}
        stats={[
          { value: "60 min", label: "One-to-one assessment" },
          {
            value: `₹${(startingPricePaise / 100).toLocaleString("en-IN")}`,
            label: "Starting per session",
          },
          hasRealRatings
            ? {
                value: `★ ${Number(ratingSummary.avg_rating).toFixed(1)}`,
                label: `From ${ratingSummary.rating_count} sessions`,
              }
            : { value: "100+", label: "Patients treated" },
        ]}
        photoId="hero-therapy"
        alt="A patient smiling as she works through her exercises at home, laptop open in front of her"
        overlay={{
          icon: "fa-video",
          title: "Live, one-to-one",
          body: "Watched and corrected as you go.",
        }}
      />

      <TrustBar points={TRUST_POINTS} />

      {/* The single most important thing this page has to say, and the thing
          the old version buried: there are two ways to be treated, and both
          are the same clinicians. */}
      <Section
        id="two-ways"
        tone="tint"
        eyebrow="Two ways to start"
        title="Pick how you want to be seen"
        lede="Same physiotherapists. Screen or doorstep."
      >
        <div className="space-y-14 lg:space-y-20">
          <SplitFeature
            badge="Video session"
            eyebrow="Option one"
            title="A video session, wherever you are"
            body="An hour, one-to-one. They test how you move and find the cause."
            bullets={[
              "Your own timezone",
              "Runs in the browser",
              "Your scans read beforehand",
            ]}
            photoId="mode-video"
            alt="A patient on her sofa in a video session, her physiotherapist live on the laptop screen"
            cta={{ href: "/book", label: "Book a video session" }}
          />

          {homeVisitEnabled && (
            <SplitFeature
              reverse
              badge="Home visit"
              eyebrow="Option two"
              title="Or a physiotherapist at your door"
              body="Needs hands on it? The same team comes to you."
              bullets={[
                "Hands-on, at home",
                "Pincode confirmed before you pay",
                "Pay online or cash",
              ]}
              photoId="mode-home-visit"
              alt="A physiotherapist guiding an older patient through an arm exercise at home"
              cta={{ href: "/home-visit", label: "See home visits" }}
            />
          )}
        </div>
      </Section>

      {/* Why the practice exists, before what it treats: someone deciding
          whether to trust a clinic they cannot walk into asks "who are you"
          first. Mission and vision in full, the promises as headlines that
          link through -- see MissionPreview. */}
      <Section
        id="our-mission"
        // A connector band, so it takes the same floating-panel treatment as
        // the explore grid at the foot of the page — and it keeps this from
        // running into the white "what we treat" band directly below.
        tone="panel"
        eyebrow="Our mission"
        title="Why we do this"
      >
        <MissionPreview />
      </Section>

      {/* Breadth of care, as six photographs. The old version of this band
          was six paragraphs of prose, which is exactly the density the
          redesign exists to remove. */}
      <Section
        id="what-we-treat"
        eyebrow="What we treat"
        title="Find what hurts"
      >
        <CareAreaShowcase href="/book" ctaLabel="Book an assessment" />
      </Section>

      <Section
        id="how-it-works"
        tone="tint"
        eyebrow="How it works"
        title="Three steps, start to finish"
      >
        <JourneySteps stepSeconds={journeyStepSeconds} />
        <Reveal className="mt-10 text-center">
          <MotionButton href="/how-it-works" variant="secondary">
            See the full walkthrough
            <i className="fa-solid fa-arrow-right text-xs text-teal-600" />
          </MotionButton>
        </Reveal>
      </Section>

      {/* CONDITIONS — admin-controlled content, so the layout stays generic
          and simply adapts to whatever categories are configured. */}
      {categories && categories.length > 0 && (
        <Section
          id="programs"
          eyebrow="Structured programmes"
          title="What you can book today"
          lede="Same 60-minute assessment. Different protocol."
        >
          <ProgramCards programs={programs} />
        </Section>
      )}


      {testimonials.length > 0 && (
        <Section
          id="reviews"
          tone="tint"
          eyebrow="Patient stories"
          title="Recoveries guided over video"
          lede={
            hasRealRatings
              ? `${Number(ratingSummary.avg_rating).toFixed(1)} average across ${ratingSummary.rating_count} completed sessions.`
              : undefined
          }
        >
          <Testimonials testimonials={testimonials} />
        </Section>
      )}

      {/* The connector band: every other page on the site, shown rather than
          listed. See ExploreGrid and marketingNav.ts. */}
      <Section
        id="explore"
        tone="panel"
        eyebrow="Explore"
        title="The whole site, in one place"
        // Counted rather than written out: this said "six" for one commit
        // after an eighth page was added, and Home Visit drops out of the
        // list entirely when the admin switch is off.
        lede={`${connectors.length - 1} more pages, plus booking.`}
      >
        <ExploreGrid connectors={connectors} />
      </Section>

      <ClosingCta
        title="Start with one assessment."
        body="One 60-minute session. Leave with a plan."
        primary={{ href: "/book", label: "Book a session", icon: "fa-calendar-check" }}
        secondary={{ href: "/get-started", label: "Explore all options" }}
        photoId="step-book"
        photoAlt="A patient at home, smiling as she books her session on her phone"
      />
    </>
  );
}
