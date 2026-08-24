import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import TeamTherapistPopup, { type TeamTherapist } from "@/components/TeamTherapistPopup";
import SectionNav, { type SectionNavItem } from "@/components/SectionNav";
import PageHero from "@/components/marketing/PageHero";
import Section from "@/components/marketing/Section";
import IconCard from "@/components/marketing/IconCard";
import ExploreSection from "@/components/marketing/ExploreSection";
import ClosingCta from "@/components/marketing/ClosingCta";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import { readHomeVisitEnabled } from "@/lib/homeVisitFlag";

export const metadata: Metadata = {
  title: "Our Team | Dr. Pooja's Physio",
  description:
    "Meet the licensed physiotherapists who deliver every session — tap a profile to read their background and request them for your booking.",
};

// No per-user content on this page — cache and revalidate on a timer
// instead of hitting Supabase on every single visit. Reads from the
// public_therapist_profiles view, which already excludes anything
// non-public (email, phone, etc.) — see schema.sql.
export const revalidate = 300;

// languages/public_display_note are new/migration-dependent columns on the
// public_therapist_profiles view (see schema.sql's Feature 38 section) --
// selecting them errors outright against the view's pre-migration column
// list (unlike a plain table, a view can't silently return null for a
// column it was never defined with), so this falls back to the original
// column list on error rather than breaking the whole page.
const FULL_SELECT =
  "id, full_name, credentials, specialization, years_experience, bio, languages, avatar_url, avg_rating, rating_count, public_display_note";
const BASE_SELECT =
  "id, full_name, credentials, specialization, years_experience, bio, avatar_url, avg_rating, rating_count";

// What choosing a specialist here actually does. Stated plainly because it is
// a request, not an assignment -- only the admin can see whether that
// therapist is free for your slot.
const HOW_CHOOSING_WORKS = [
  {
    icon: "fa-hand-pointer",
    title: "Tap a profile",
    body: "Read their background, credentials and the languages they consult in.",
  },
  {
    icon: "fa-paper-plane",
    title: "Request them",
    body: "Your booking carries the request through. It is a preference, not a confirmed slot.",
  },
  {
    icon: "fa-circle-check",
    title: "We confirm",
    body: "If they are free at your time, they are yours. If not, we assign an equally qualified colleague.",
  },
];

export default async function TeamPage() {
  const supabase = createPublicClient();
  let { data: therapists } = await supabase
    .from("public_therapist_profiles")
    .select(FULL_SELECT)
    .order("full_name", { ascending: true })
    .returns<TeamTherapist[]>();
  if (!therapists) {
    const fallback = await supabase
      .from("public_therapist_profiles")
      .select(BASE_SELECT)
      .order("full_name", { ascending: true })
      .returns<TeamTherapist[]>();
    therapists = fallback.data;
  }

  const homeVisitEnabled = await readHomeVisitEnabled();

  const sectionNavItems: SectionNavItem[] = [
    { id: "the-team", label: "The Team", icon: "fa-user-doctor" },
    { id: "choosing", label: "Choosing One", icon: "fa-hand-pointer" },
    { id: "explore", label: "Explore the Site", icon: "fa-compass" },
    { id: "get-started", label: "Book a Session", icon: "fa-calendar-check" },
  ];

  return (
    <>
      <SectionNav items={sectionNavItems} />

      <PageHero
        eyebrow="Our team"
        title="The specialist who will actually see you"
        subtitle="Every session is delivered one-to-one by a qualified physiotherapist. No call centre, no rotating pool — tap a profile to read their background."
        primary={{ href: "/book", label: "Book a session", icon: "fa-calendar-check" }}
        photoId="hero-team"
        alt="A physiotherapist assessing a patient's shoulder alignment in a clinic room"
        overlay={{
          icon: "fa-id-badge",
          title: "Licensed, every one",
          body: "Credentials and years of practice are on each profile.",
        }}
      />

      <Section
        id="the-team"
        eyebrow="Meet the specialists"
        title="Who you will be working with"
        lede="Tap any profile for their background, and request them when you book."
      >
        {!therapists || therapists.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">
            Our specialist roster is being updated — check back shortly.
          </p>
        ) : (
          <TeamTherapistPopup therapists={therapists} />
        )}
      </Section>

      <Section
        id="choosing"
        tone="tint"
        eyebrow="Choosing a specialist"
        title="What picking someone here does"
        lede="It sends a request with your booking. Only the clinic can see who is free for your slot."
      >
        <Stagger className="grid gap-5 md:grid-cols-3">
          {HOW_CHOOSING_WORKS.map((item) => (
            <StaggerItem key={item.title} className="h-full">
              <IconCard icon={item.icon} title={item.title} body={item.body} />
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <ExploreSection current="team" homeVisitEnabled={homeVisitEnabled} />

      <ClosingCta
        title="Book with the specialist you picked."
        body="Or book the standard assessment and we will match you to the right person for your condition."
        primary={{ href: "/book", label: "Book a session", icon: "fa-calendar-check" }}
        secondary={{ href: "/conditions", label: "See what we treat" }}
      />
    </>
  );
}
