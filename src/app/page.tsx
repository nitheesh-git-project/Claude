import { createPublicClient } from "@/lib/supabase/public";
import { SESSION_FEE_PAISE } from "@/lib/pricing";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";
import { Reveal, MotionButton } from "@/components/motion/primitives";
import JourneySteps from "@/components/home/JourneySteps";
import SectionNav, { type SectionNavItem } from "@/components/SectionNav";
// ProgressLink, not next/link: a plain Link click never touches useRouter,
// so the teal progress bar would not fire on the way to /conditions.
import Link from "@/components/system/ProgressLink";
import ProgramCards from "@/components/catalog/ProgramCards";
import { pickFeatured } from "@/lib/catalogFeatured";
import PageHero from "@/components/marketing/PageHero";
import TrustBar from "@/components/marketing/TrustBar";
import Section from "@/components/marketing/Section";
import SplitFeature from "@/components/marketing/SplitFeature";
import ExploreGrid from "@/components/marketing/ExploreGrid";
import MissionPreview from "@/components/marketing/MissionPreview";
import RecoveryGist from "@/components/marketing/recovery/RecoveryGist";
import WhatsAppAsk from "@/components/marketing/WhatsAppAsk";
import { enabledShowcaseProfiles } from "@/lib/healthProfileShowcase";
import {
  readBookingLanguages,
  readEnabledIntakeSpecialties,
  readHomeVisitOffer,
} from "@/lib/homeVisitFlag";
import {
  homeVisitBookable,
  homeVisitComingLine,
  homeVisitWeVisitLine,
} from "@/lib/homeVisitOffer";
import { publicTestimonials } from "@/lib/testimonialTrust";
import { readPublicTeam } from "@/lib/publicTeam";
import { readPublicContact } from "@/lib/publicContact";
import { conditionChips } from "@/lib/patientConditionLabels";
import { RealBenefitsList, SubHeading, WhyChooseUsGrid } from "@/components/marketing/WhyChooseUs";
import { readMissionCopy, readMissionPrinciples } from "@/lib/missionCopy";
import Testimonials, {
  type PublicTestimonial,
} from "@/components/marketing/Testimonials";
import ClosingCta from "@/components/marketing/ClosingCta";
import { homeConnectors } from "@/lib/marketingNav";
import TreatmentGoals from "@/components/marketing/TreatmentGoals";
import Price from "@/components/pricing/Price";
import {
  closingSessionLine,
  durationRangeLabel,
  oneToOneLine,
  programmesLede,
} from "@/lib/sessionLengthCopy";

// This page has no per-user content - it can be cached and revalidated
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
  // in Site Content, not a stale constant - falls back to the flat fee
  // only in the unlikely event no categories are active at all.
  const startingPricePaise =
    categories && categories.length > 0
      ? Math.min(...categories.map((c) => c.price_paise))
      : SESSION_FEE_PAISE;
  // How long a session is, from the same rows the cards and /book read.
  const sessionLength = durationRangeLabel(categories ?? []);

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

  // Home visits are behind an admin master switch, and the switch alone is
  // not enough: with no area served or nothing priced, the first step
  // ("check my pincode") can only answer no. So the delivery-mode band and the
  // connector grid sell a visit only when it is bookable, say so honestly
  // ("coming to Chennai") when it is switched on but not ready, and say
  // nothing when it is off -- see homeVisitOffer.ts.
  const offer = await readHomeVisitOffer();
  const homeVisitEnabled = homeVisitBookable(offer);
  const [{ hasTeam, initials: teamInitials }, contact] = await Promise.all([
    readPublicTeam(),
    readPublicContact(),
  ]);

  // The mission and the vision, as an admin may have rewritten them. Its own
  // read for the same reason, and it falls back to the lines in mission.ts
  // rather than to blanks -- an empty mission card reads as a broken page on
  // the one band whose job is to say who this clinic is.
  const missionCopy = await readMissionCopy();

  // The promise titles the mission band links through with. Same fallback, so
  // a database without the table shows the four this repository ships.
  const { promises } = await readMissionPrinciples();

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

  // Where the subject of each cover sits. Its own call again, and split from
  // the image read above rather than folded into it: these columns are newer
  // than image_url, so one query would lose the photographs as well as their
  // positions on a database mid-migration. Apart, they degrade separately.
  const { data: categoryFocals } = await supabase
    .from("treatment_categories")
    .select("id, image_focal_x, image_focal_y");
  const focalByCategoryId = new Map(
    (categoryFocals ?? []).map((row) => [
      row.id,
      { image_focal_x: row.image_focal_x, image_focal_y: row.image_focal_y },
    ])
  );

  // Which four lead the page. Its own call for the third time on this row,
  // and for the same reason: `featured` is newer than the focal columns, so
  // folding it in would cost the photographs as well as the curation on a
  // database mid-migration. Absent, every row reads as not featured and
  // pickFeatured falls through to the first four -- exactly what this page
  // showed before the column existed.
  const { data: categoryFeatured } = await supabase
    .from("treatment_categories")
    .select("id, featured");
  const featuredByCategoryId = new Map(
    (categoryFeatured ?? []).map((row) => [row.id, row.featured])
  );

  const allPrograms = (categories ?? []).map((c) => ({
    ...c,
    image_url: imageByCategoryId.get(c.id) ?? null,
    ...(focalByCategoryId.get(c.id) ?? {}),
    featured: featuredByCategoryId.get(c.id) ?? false,
  }));

  // The home page leads with four and sends the rest to /conditions, which
  // still lists everything. Before this it printed all ten, so the page
  // whose job is to say what this clinic *is* spent most of its length being
  // an index of itself.
  const { shown: programs, hasMore: hasMoreConditions } = pickFeatured(allPrograms);

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
  // The five rows schema.sql seeds are illustrative copy, never real
  // patients, so they are not shown (testimonialTrust.ts). With only those in
  // the table the Reviews band and its rail entry are not drawn at all.
  const testimonials: PublicTestimonial[] = publicTestimonials(testimonialRows).map((t) => ({
    ...t,
    avatar_url: avatarById.get(t.id) ?? null,
  }));

  // Real, aggregated patient rating data (never individual reviews/names -
  // see the schema comment on public_rating_summary for why) surfaced
  // alongside the hand-curated testimonials above.
  const { data: ratingSummary } = await supabase
    .from("public_rating_summary")
    .select("avg_rating, rating_count")
    .single();
  const hasRealRatings = !!ratingSummary && ratingSummary.rating_count > 0;

  // The connector grid: every other page plus booking. Held in a variable so
  // the band's own copy can count it instead of hardcoding a number.
  const connectors = homeConnectors(homeVisitEnabled, hasTeam);

  // Only lists sections that actually render -- several of these blocks
  // below are conditional on admin-controlled data (categories,
  // testimonials), so a nav item pointing at a section that isn't on the
  // page would just do nothing when clicked. Order must match the DOM: the
  // scroll arrow walks this list top to bottom.
  const [enabledSpecialties, bookingLanguages] = await Promise.all([
    readEnabledIntakeSpecialties(),
    readBookingLanguages(),
  ]);
  const showcaseProfiles = enabledShowcaseProfiles(enabledSpecialties);

  // Order matches the DOM: the scroll arrow walks this list top to bottom.
  // "What you can book" follows "Two ways to start" directly -- on a phone the
  // programme cards with their prices were five screens down, behind the
  // walkthrough and the health profile.
  const sectionNavItems: SectionNavItem[] = [
    { id: "two-ways", label: "Two Ways to Start", icon: "fa-video" },
    ...(categories && categories.length > 0
      ? [{ id: "programs", label: "What You Can Book", icon: "fa-clipboard-list" }]
      : []),
    { id: "how-it-works", label: "How It Works", icon: "fa-route" },
    ...(showcaseProfiles.length > 0
      ? [{ id: "health-profile", label: "Your Health Profile", icon: "fa-notes-medical" }]
      : []),
    { id: "goals", label: "Treatment Goals", icon: "fa-bullseye" },
    ...(testimonials.length > 0
      ? [{ id: "reviews", label: "Reviews", icon: "fa-star" }]
      : []),
    { id: "our-mission", label: "Our Mission", icon: "fa-bullseye" },
    { id: "explore", label: "Explore the Site", icon: "fa-compass" },
    { id: "get-started", label: "Book a Session", icon: "fa-rocket" },
  ];

  // Bands alternate tinted / plain down the page so the eye can count them
  // (see Section). Worked out from the sections that actually render, since
  // Programs and Reviews come and go with admin data and a fixed tone per
  // section put two grey bands together whenever one was missing. A grey
  // slot for Mission or Explore takes the floating `panel` card -- the page's
  // two connector bands.
  const bandTone = homeBandTones(sectionNavItems.map((item) => item.id));

  // Tappable starting points, in the words a patient uses for what is wrong.
  // Each deep-links into booking with that condition chosen, and a group the
  // catalogue has no condition for gets no chip (patientConditionLabels.ts).
  const chips = conditionChips(categories ?? []);
  const weVisit = homeVisitWeVisitLine(offer);

  return (
    <>
      <SectionNav items={sectionNavItems} />

      {/* The two CTAs that reach /book name the mode, because that wizard
          sells the video consultation alone -- a home visit is its own page
          and its own wizard. */}
      <PageHero
        size="large"
        eyebrow="Licensed physiotherapy"
        title={
          <>
            {/* The trailing space is load-bearing. The second line is its own
                block, so the two never touch on screen -- but the h1's text
                content is what a screen reader reads out and what anything
                extracting the page's headline gets. "Or at your home" is only
                said while a visit can actually be booked. */}
            Physiotherapy for you or your parent &ndash;{" "}
            {/* bg-clip-text paints the gradient only inside the span's own
                box, and the h1's tight leading puts the descenders of "by"
                and "your" below it -- so they were cut off. The padding
                gives them room and the matching negative margin keeps the
                layout where it was. */}
            <span className="-mb-[0.15em] block bg-gradient-to-r from-teal-700 to-emerald-500 bg-clip-text pb-[0.15em] leading-[1.12] text-transparent">
              {homeVisitEnabled ? "by video, or at your home" : "by video, wherever you are"}
            </span>
          </>
        }
        subtitle="A licensed physiotherapist watches how you move, then builds your plan."
        primary={{ href: "/book", label: "Book a video session", icon: "fa-calendar-check" }}
        secondary={{ href: "/how-it-works", label: "See how it works" }}
        shortPhotoOnMobile
        extras={
          <>
            {chips.length > 0 && (
              <div className="mt-7">
                <p className="text-sm font-semibold text-slate-700">What do you need help with?</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {chips.map((chip) => (
                    <li key={chip.key}>
                      <Link
                        href={chip.href}
                        className="inline-flex min-h-11 items-center rounded-full border border-teal-200 bg-white px-4 text-base font-semibold text-teal-900 shadow-sm transition hover:border-teal-400 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                      >
                        {chip.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-3">
              <WhatsAppAsk href={contact.whatsapp} />
            </p>
          </>
        }
        // Both of the first two are facts the product can stand behind: the
        // assessment length, and the lowest price in the live catalogue. The
        // third is the real rating when there is one -- and nothing at all
        // when there is not. (Never an invented patient count: `hasRealRatings`
        // exists precisely so an invented rating is never quoted.)
        stats={[
          // The catalogue's own length (a range when categories differ),
          // and no figure at all when none is known -- never a fixed one.
          ...(sessionLength
            ? [{ value: sessionLength, label: "Each session" }]
            : []),
          {
            value: <Price paise={startingPricePaise} />,
            label: "Starting price",
          },
          ...(hasRealRatings
            ? [
                {
                  value: `★ ${Number(ratingSummary.avg_rating).toFixed(1)}`,
                  label: `${ratingSummary.rating_count} ratings`,
                },
              ]
            : []),
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

      {/* The single most important thing this page has to say: there are two
          ways to be treated, and both are the same clinicians. The band has
          no lede -- its heading already says it. */}
      <Section
        id="two-ways"
        tone={bandTone("two-ways")}
        eyebrow="Two ways to start"
        title="Pick how you want to be seen"
      >
        <div className="space-y-14 lg:space-y-20">
          <SplitFeature
            badge="Video session"
            eyebrow="Option one"
            title="A video session, wherever you are"
            // The length is the catalogue's own ("An hour" only when every
            // category is 60), never typed into the page.
            body={`${oneToOneLine(categories ?? [])} They test how you move.`}
            bullets={[
              "Your own timezone",
              "Runs in the browser",
              "Your scans read beforehand",
            ]}
            photoId="mode-video"
            alt="A patient on her sofa in a video session, her physiotherapist live on the laptop screen"
            cta={{ href: "/book", label: "Book a video session" }}
          />

          {/* Bookable: sold, with where we go. Switched on but not ready: an
              honest line and no button to a dead end. Off: not here at all. */}
          {offer.state === "live" && (
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
              note={weVisit ?? undefined}
              photoId="mode-home-visit"
              alt="A physiotherapist guiding an older patient through an arm exercise at home"
              cta={{ href: "/book-home-visit", label: "Book a home visit" }}
            />
          )}
          {offer.state === "coming" && (
            <SplitFeature
              reverse
              badge="Home visit"
              eyebrow="Option two"
              title="Home visits are on their way"
              body="Hands-on care at your door, from the same team."
              note={homeVisitComingLine(offer)}
              photoId="mode-home-visit"
              alt="A physiotherapist guiding an older patient through an arm exercise at home"
            />
          )}
        </div>
      </Section>

      {/* CONDITIONS - admin-controlled content, so the layout stays generic
          and simply adapts to whatever categories are configured. */}
      {categories && categories.length > 0 && (
        <Section
          id="programs"
          tone={bandTone("programs")}
          eyebrow="Structured programmes"
          title="What you can book today"
          lede={programmesLede(categories)}
        >
          <ProgramCards programs={programs} compact />
          {/* Only when there is genuinely more to see: a button opening a
              list identical to the one above it is a dead end with a label
              on it. /conditions is unchanged and still shows everything. */}
          {hasMoreConditions && (
            <div className="mt-8 flex justify-center">
              <Link
                href="/conditions"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-teal-200 bg-white px-5 py-3 text-sm font-bold text-teal-700 shadow-sm transition hover:border-teal-400 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                See all conditions we treat
                <i aria-hidden className="fa-solid fa-arrow-right text-xs" />
              </Link>
            </div>
          )}
        </Section>
      )}

      <Section
        id="how-it-works"
        tone={bandTone("how-it-works")}
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

      {/* One recovery story at a time (RecoveryGist): the sample patient's
          sore spot cooling, their headline figure counting from the first
          visit to the latest, and the tools that profile uses. Every kind of
          care is one tap away, and the full set opens in a sheet that ends
          on booking. The real graph and milestone cards stay on
          /how-it-works. */}
      {showcaseProfiles.length > 0 && (
        <Section
          id="health-profile"
          tone={bandTone("health-profile")}
          eyebrow="Your recovery, tracked"
          title="Watch sore turn into better"
        >
          <RecoveryGist profiles={showcaseProfiles} />
        </Section>
      )}

      {/* What treatment works towards, one kind of care at a time: a sweep
          from the first visit to the goal (TreatmentGoals). It replaced
          "Find what hurts", which named areas without showing what changes. */}
      <Section
        id="goals"
        tone={bandTone("goals")}
        eyebrow="What treatment works towards"
        title="From your first visit to your goal"
      >
        <TreatmentGoals />
      </Section>

      {testimonials.length > 0 && (
        <Section
          id="reviews"
          tone={bandTone("reviews")}
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

      {/* Why the practice exists, just before the connector grid: the page
          answers "what can I do" first, then "who are you", then "where
          next". Mission and vision in full, the promises as headlines that
          link through -- see MissionPreview. */}
      <Section
        id="our-mission"
        tone={bandTone("our-mission")}
        eyebrow="Our mission"
        title="Why patients choose us"
      >
        {/* Two steps down from the concrete to the why: what we do, then what
            changes for you, and the mission and vision behind both. The third
            heading ("Mission and vision / Why we do this") sat directly under
            the band's own "Our mission" and said the same thing twice, so the
            cards carry their own Mission / Vision labels instead. */}
        <WhyChooseUsGrid compact languages={bookingLanguages} teamInitials={teamInitials} />
        <div className="mt-14 sm:mt-16">
          <SubHeading eyebrow="The real benefits" title="What changes for you" />
          <RealBenefitsList compact />
        </div>
        <div className="mt-14 sm:mt-16">
          <MissionPreview
            mission={missionCopy.mission}
            vision={missionCopy.vision}
            promises={promises}
          />
        </div>
      </Section>

      {/* The connector band: every other page on the site, shown rather than
          listed -- as compact rows on a phone. See ExploreGrid and
          marketingNav.ts. */}
      <Section
        id="explore"
        tone={bandTone("explore")}
        eyebrow="Explore"
        title="The whole site, in one place"
        // Counted rather than written out: Home Visit drops out of the list
        // when it is not bookable, and so does Our team when nobody is on it.
        lede={`${connectors.length - 1} more pages, plus booking.`}
      >
        <ExploreGrid connectors={connectors} />
      </Section>

      {/* Names the mode for the same reason as the hero. The second action is
          the other mode when it can be booked, and the walkthrough when not. */}
      <ClosingCta
        title="Start with one assessment."
        body={closingSessionLine(categories ?? [])}
        primary={{ href: "/book", label: "Book a video session", icon: "fa-calendar-check" }}
        secondary={
          homeVisitEnabled
            ? { href: "/book-home-visit", label: "Book a home visit" }
            : { href: "/how-it-works", label: "See how it works" }
        }
        photoId="cta-book"
        photoAlt="A patient on her sofa, laptop on her knees, smiling as she books her session on her phone"
      />
    </>
  );
}

const PANEL_BANDS = new Set(["our-mission", "explore"]);

function homeBandTones(ids: string[]): (id: string) => "tint" | "plain" | "panel" {
  const bands = ids.filter((id) => id !== "get-started");
  return (id) => {
    const grey = bands.indexOf(id) % 2 === 0;
    if (!grey) return "plain";
    return PANEL_BANDS.has(id) ? "panel" : "tint";
  };
}
