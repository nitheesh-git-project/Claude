import type { Metadata } from "next";
import HomeVisitOnly, { HomeVisitUnavailable } from "@/components/pricing/HomeVisitOnly";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { pickFeatured } from "@/lib/catalogFeatured";
import HomeVisitConditions from "@/components/home/HomeVisitConditions";
import SectionNav, { type SectionNavItem } from "@/components/SectionNav";
import { loadHomeVisitConditions } from "@/lib/homeVisitRatesServer";
import PageHero from "@/components/marketing/PageHero";
import Section from "@/components/marketing/Section";
import IconCard from "@/components/marketing/IconCard";
import ExploreSection from "@/components/marketing/ExploreSection";
import ClosingCta from "@/components/marketing/ClosingCta";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/primitives";
import {
  DEFAULT_HOME_VISIT_PAGE_HEADING,
  DEFAULT_HOME_VISIT_PAGE_SUBHEADING,
} from "@/lib/adminSettings";

export const metadata: Metadata = {
  title: "Home Visit Physiotherapy | MoveRestore",
  description:
    "A licensed physiotherapist comes to your address - the same assessment and recovery plan, without the travel.",
};

// No per-user content, and createPublicClient() never touches cookies(), so
// this caches and revalidates on a timer instead of hitting Supabase on
// every visit -- same as /conditions and /book.
export const revalidate = 300;

// The three things a visitor needs to know before they will consider this,
// in the order they ask them. One line each.
const HOW_A_VISIT_WORKS = [
  {
    icon: "fa-map-pin",
    title: "We check your pincode",
    body: "Confirmed before you give an address, and again before you pay.",
  },
  {
    icon: "fa-user-doctor",
    title: "The same physiotherapists",
    body: "Our own team, at your door instead of on screen.",
  },
  {
    icon: "fa-indian-rupee-sign",
    title: "Travel is passed straight through",
    body: "Shown separately at checkout, paid to your therapist in full.",
  },
];

export default async function HomeVisitPage() {
  const supabase = createPublicClient();

  // Each read is its own query so a database that hasn't re-run schema.sql
  // degrades one section rather than blanking the page -- the same
  // migration-tolerance convention as /conditions' package section.
  const { data: settingsRow } = await supabase
    .from("site_settings")
    .select("home_visit_enabled, home_visit_page_heading, home_visit_page_subheading")
    .maybeSingle();

  // The master switch is a hard gate, not just a hidden nav link: without
  // this, the page would still be reachable by typing the URL while the
  // service has no areas, no catalogue and no way to actually deliver.
  if (settingsRow?.home_visit_enabled !== true) {
    notFound();
  }

  const [{ conditions: allConditions }, { data: areas }] = await Promise.all([
    // Every condition the clinic treats, each as one visit at its home-visit
    // price (Catalog -> Conditions -> Home visits: its own price, else the
    // clinic-wide one). One visit, always -- a course of visits is a
    // therapist's recommendation after seeing someone, so the old multi-visit
    // rows are not advertised here at all.
    loadHomeVisitConditions(supabase),

    supabase
      .from("home_visit_areas")
      .select("city, area_name, pincode")
      .eq("active", true)
      .order("city", { ascending: true })
      .order("pincode", { ascending: true }),
  ]);

  // Every condition, featured ones first. This page *is* the full list of
  // home visits, so nothing is held back behind a reveal.
  const { shown: leadConditions } = pickFeatured(allConditions);
  const leadIds = new Set(leadConditions.map((c) => c.id));
  const conditions = [...leadConditions, ...allConditions.filter((c) => !leadIds.has(c.id))];

  const heading =
    settingsRow?.home_visit_page_heading?.trim() || DEFAULT_HOME_VISIT_PAGE_HEADING;
  const subheading =
    settingsRow?.home_visit_page_subheading?.trim() || DEFAULT_HOME_VISIT_PAGE_SUBHEADING;

  // Grouped by city rather than listed as a flat wall of pincodes -- a
  // visitor is checking "do you cover my area", and the city is what they
  // scan for first.
  const cities = new Map<string, string[]>();
  for (const area of areas ?? []) {
    const list = cities.get(area.city) ?? [];
    list.push(area.pincode);
    cities.set(area.city, list);
  }

  // "Where we visit" only renders when serviceable areas exist, so its rail
  // entry is conditional. Order matches the DOM.
  const sectionNavItems: SectionNavItem[] = [
    { id: "how-a-visit-works", label: "How It Works", icon: "fa-route" },
    { id: "choose-visit", label: "Choose Your Visit", icon: "fa-house-medical" },
    ...(cities.size > 0
      ? [{ id: "where-we-visit", label: "Where We Visit", icon: "fa-location-dot" }]
      : []),
    { id: "explore", label: "Explore the Site", icon: "fa-compass" },
    { id: "check-pincode", label: "Check My Pincode", icon: "fa-map-pin" },
  ];

  // Outside India the page says so instead -- unless an admin has allowed
  // home visits abroad (Catalog -> Countries & currency). The page stays
  // statically cached for everybody; the visitor's country is read in the
  // browser, and the routes that sell a visit refuse one by themselves.
  return (
    <HomeVisitOnly fallback={<HomeVisitUnavailable />}>
      <SectionNav items={sectionNavItems} />

      {/* Heading and subheading stay admin-editable -- this page's copy is a
          site setting, and hardcoding it here would silently ignore what an
          admin typed into Settings. */}
      <PageHero
        eyebrow="Home visit"
        title={heading}
        subtitle={subheading}
        primary={{ href: "/book-home-visit", label: "Check my pincode", icon: "fa-map-pin" }}
        secondary={{ href: "/how-it-works", label: "See how it works" }}
        photoId="hero-home-visit"
        alt="A physiotherapist guiding an older patient through an arm exercise in their living room"
        overlay={{
          icon: "fa-house-medical",
          title: "At your address",
          body: "Hands-on, where recovery happens.",
        }}
      />

      <Section
        id="how-a-visit-works"
        eyebrow="How a visit works"
        title="Before anyone knocks on your door"
      >
        <Stagger className="grid gap-5 md:grid-cols-3">
          {HOW_A_VISIT_WORKS.map((item) => (
            <StaggerItem key={item.title} className="h-full">
              <IconCard icon={item.icon} title={item.title} body={item.body} />
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <Section
        id="choose-visit"
        tone="tint"
        eyebrow="Book a visit"
        title="Choose your visit"
        lede="Pick what the visit is for. One visit - if you need more, your therapist will recommend them."
      >
        {conditions.length > 0 ? (
          <HomeVisitConditions conditions={conditions} />
        ) : (
          <p className="text-center text-sm text-slate-500">
            Home visit prices are being finalised - please check back shortly.
          </p>
        )}
      </Section>

      {cities.size > 0 && (
        <Section
          id="where-we-visit"
          eyebrow="Coverage"
          title="Where we visit"
          lede="We confirm your pincode before you pay."
        >
          <div className="mx-auto grid max-w-4xl gap-5 sm:grid-cols-2">
            {[...cities.entries()].map(([city, pincodes]) => (
              <Reveal key={city}>
                <div className="h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="font-display flex items-center gap-2 text-sm font-bold text-slate-900">
                    <i className="fa-solid fa-location-dot text-teal-600" aria-hidden="true" />
                    {city}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    {pincodes.join(" · ")}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>
      )}

      <ExploreSection current="home-visit" homeVisitEnabled />

      <ClosingCta
        id="check-pincode"
        title="Not sure if we reach you?"
        body="Enter your pincode. Nothing is charged until we confirm we can reach you."
        primary={{ href: "/book-home-visit", label: "Check my pincode", icon: "fa-map-pin" }}
        secondary={{ href: "/book", label: "Book a video session instead" }}
        photoId="cta-home-visit"
        photoAlt="An older couple side by side in their front room, smiling at the tablet they are booking on"
      />
    </HomeVisitOnly>
  );
}
