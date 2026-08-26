import { createPublicClient } from "@/lib/supabase/public";
import { SESSION_FEE_PAISE } from "@/lib/pricing";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";
import { Reveal, MotionButton } from "@/components/motion/primitives";
import JourneySteps from "@/components/home/JourneySteps";
import SessionPackages from "@/components/home/SessionPackages";
import SectionNav, { type SectionNavItem } from "@/components/SectionNav";
import ProgramCards from "@/components/catalog/ProgramCards";
import PageHero from "@/components/marketing/PageHero";
import TrustBar from "@/components/marketing/TrustBar";
import Section from "@/components/marketing/Section";
import SplitFeature from "@/components/marketing/SplitFeature";
import ExploreGrid from "@/components/marketing/ExploreGrid";
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
  { icon: "fa-user-check", label: "One-to-one, never a group class" },
  { icon: "fa-file-medical", label: "Your reports read before the session" },
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

  // Isolated from the categories query above -- session_packages_visible
  // and the package-specific columns are all migration-dependent, and a
  // missing migration should only hide this section, never blank the
  // categories that already render fine without it.
  const { data: settingsRow } = await supabase
    .from("site_settings")
    .select("session_packages_visible")
    .maybeSingle();

  // Its own call for the same reason the one above is separate: this column
  // is newer than that one, and a database missing it must only cost the
  // walkthrough its configured pace, not hide the packages section too.
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

  const { data: rawPackages } = settingsRow?.session_packages_visible
    ? await supabase
        .from("treatment_category_packages")
        .select(
          "id, title, subtitle, image_url, promises, badge_label, highlight, session_count, price_paise, compare_at_paise, validity_days, therapist_locked, category_id"
        )
        .eq("active", true)
        .eq("visible_on_home", true)
        .order("display_order", { ascending: true })
        .order("id", { ascending: true })
    : { data: null };

  // The package detail dialog's copy (long description, terms, scheduling
  // limits) lives in migration-dependent columns, so it is read in its own
  // call and merged in: an unknown-column error here costs the dialog those
  // fields instead of blanking the whole packages section.
  const packageIds = (rawPackages ?? []).map((p) => p.id);
  const { data: packageDetail } = packageIds.length
    ? await supabase
        .from("treatment_category_packages")
        .select(
          "id, description, terms, package_code, session_duration_minutes, min_gap_hours, max_sessions_per_week, max_purchases_per_patient"
        )
        .in("id", packageIds)
    : { data: null };
  const detailById = new Map((packageDetail ?? []).map((d) => [d.id, d]));

  const categoryPriceById = new Map((categories ?? []).map((c) => [c.id, c.price_paise]));
  const packages = (rawPackages ?? []).map((p) => ({
    ...p,
    ...(detailById.get(p.id) ?? {}),
    category_price_paise: categoryPriceById.get(p.category_id) ?? null,
  }));


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
  // below are conditional on admin-controlled data (categories, packages,
  // testimonials), so a nav item pointing at a section that isn't on the
  // page would just do nothing when clicked. Order must match the DOM: the
  // scroll arrow walks this list top to bottom.
  const sectionNavItems: SectionNavItem[] = [
    { id: "two-ways", label: "Two Ways to Start", icon: "fa-video" },
    { id: "what-we-treat", label: "What We Treat", icon: "fa-bone" },
    { id: "how-it-works", label: "How It Works", icon: "fa-route" },
    ...(categories && categories.length > 0
      ? [{ id: "programs", label: "Programs", icon: "fa-clipboard-list" }]
      : []),
    ...(packages.length > 0 ? [{ id: "packages", label: "Packages", icon: "fa-box-open" }] : []),
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
        subtitle="A licensed physiotherapist watches how you move, finds what is causing the pain, and gives you a plan you can follow at home."
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
          body: "Your therapist watches you move and corrects it as you go.",
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
        lede="Same physiotherapists, same assessment. The only difference is whether they come through a screen or through your door."
      >
        <div className="space-y-14 lg:space-y-20">
          <SplitFeature
            badge="Video session"
            eyebrow="Option one"
            title="A video session, wherever you are"
            body="An hour on a video call with your physiotherapist. They test your movement, find the cause and send you away with a plan."
            bullets={[
              "Booked in your own timezone",
              "Runs in the browser — nothing to install",
              "Your scans and reports read beforehand",
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
              body="When your recovery needs hands on it, the same team comes to your address instead."
              bullets={[
                "Hands-on treatment at home",
                "We confirm your pincode before you pay",
                "Pay online, or cash on the visit",
              ]}
              photoId="mode-home-visit"
              alt="A physiotherapist guiding an older patient through an arm exercise at home"
              cta={{ href: "/home-visit", label: "See home visits" }}
            />
          )}
        </div>
      </Section>

      {/* Breadth of care, as six photographs. The old version of this band
          was six paragraphs of prose, which is exactly the density the
          redesign exists to remove. */}
      <Section
        id="what-we-treat"
        eyebrow="What we treat"
        title="Find what hurts"
        lede="Six areas of practice. Pick the one closest to your problem — swipe, or tap any name below."
      >
        <CareAreaShowcase href="/book" ctaLabel="Book an assessment" />
      </Section>

      <Section
        id="how-it-works"
        tone="tint"
        eyebrow="How it works"
        title="Three steps, start to finish"
        lede="Book, get assessed, then follow a plan that keeps updating as you recover."
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
          lede="Every programme opens with the same 60-minute assessment. What changes is the protocol built from it."
        >
          <ProgramCards programs={programs} packages={packages} />
        </Section>
      )}

      <SessionPackages packages={packages} />

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
        lede={`${connectors.length - 1} more pages and one booking form. Each one says what it answers.`}
      >
        <ExploreGrid connectors={connectors} />
      </Section>

      <ClosingCta
        title="Your recovery starts with one assessment."
        body="Book a 60-minute session and leave with a plan built for your body and your home."
        primary={{ href: "/book", label: "Book a session", icon: "fa-calendar-check" }}
        secondary={{ href: "/get-started", label: "Explore all options" }}
      />
    </>
  );
}
