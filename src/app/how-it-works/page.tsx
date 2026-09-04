import type { Metadata } from "next";
import SectionNav, { type SectionNavItem } from "@/components/SectionNav";
import PageHero from "@/components/marketing/PageHero";
import Section from "@/components/marketing/Section";
import StepStrip, { type Step } from "@/components/marketing/StepStrip";
import IconCard from "@/components/marketing/IconCard";
import ExploreSection from "@/components/marketing/ExploreSection";
import ClosingCta from "@/components/marketing/ClosingCta";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import { readHomeVisitEnabled } from "@/lib/homeVisitFlag";

// No per-user content, and createPublicClient() never touches cookies(), so
// this caches and revalidates on a timer rather than hitting Supabase on
// every visit -- same as /home-visit and /conditions.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "How It Works | Dr. Pooja's Physio",
  description:
    "Four steps: book a slot, send your reports, meet your physiotherapist for an hour, then follow the plan they build for you.",
};

/**
 * The four steps, as four photographs.
 *
 * Previously a scroll-driven scroller that revealed one step at a time. The
 * question this page is asked is "how long will this take and what do I have
 * to do?", and an answer you can only see one quarter of at a time is not an
 * answer. Bodies are one line each on purpose.
 */
function stepsFor(homeVisitEnabled: boolean): Step[] {
  return [
    {
      photoId: "step-book",
      alt: "A patient smiling as she books her session on her phone at home",
      title: "Book a slot",
      body: homeVisitEnabled
        ? "Video call or home visit. Your timezone, paid over UPI."
        : "A time in your own timezone, paid over UPI.",
    },
    {
      photoId: "reports",
      alt: "A physiotherapist studying a patient's X-ray on a tablet before the session",
      title: "Send your reports",
      body: "Attach your scans. They are read before you meet.",
    },
    {
      photoId: "step-assess",
      alt: "A physiotherapist smiling on the call, mid-assessment",
      title: "Get assessed",
      body: "An hour, one-to-one. They find the cause.",
    },
    {
      photoId: "step-progress",
      alt: "A couple following their exercise plan on mats at home, laptop open between them",
      title: "Follow your plan",
      body: "Exercises and a written record, updated every session.",
    },
  ];
}

// What keeps happening after session one -- the part that decides whether
// someone books a second time. One line each; the detail belongs on the page
// that owns it, which is what the connector strip at the foot is for.
const AFTER_FIRST_SESSION = [
  {
    icon: "fa-layer-group",
    title: "One therapist, all the way",
    body: "One physiotherapist for every session in your course.",
  },
  {
    icon: "fa-rotate",
    title: "Reschedule yourself",
    body: "Cancel 24 hours ahead for a full refund.",
  },
  {
    icon: "fa-hospital",
    title: "Referred by a hospital",
    body: "Your referral code carries across. They see your progress.",
  },
];

function objectionsFor(homeVisitEnabled: boolean) {
  return [
    {
      icon: "fa-hand",
      q: "Does it work without hands-on treatment?",
      a: homeVisitEnabled
        ? "Recovery is driven by the right exercise. Need hands on it? Book a home visit."
        : "Recovery is driven by the right exercise, and video shows how you move.",
    },
    {
      icon: "fa-house-laptop",
      q: "Why is being at home an advantage?",
      a: "Your pain happens in your chair. The plan fits that room.",
    },
    {
      icon: "fa-earth-asia",
      q: "What if I live abroad?",
      a: "Your timezone, 12 hours' notice. Runs on Google Meet.",
    },
    {
      icon: "fa-lock",
      q: "Who sees the reports I upload?",
      a: "Your therapist and the clinic admin. Stored privately, links expire.",
    },
  ];
}

const SECTION_NAV_ITEMS: SectionNavItem[] = [
  { id: "the-steps", label: "The Four Steps", icon: "fa-route" },
  { id: "after-the-first", label: "After Session One", icon: "fa-layer-group" },
  { id: "common-questions", label: "Common Questions", icon: "fa-circle-question" },
  { id: "explore", label: "Explore the Site", icon: "fa-compass" },
  { id: "book-now", label: "Book Now", icon: "fa-calendar-check" },
];

export default async function HowItWorksPage() {
  // Every mention of home visits on this page is gated on the same flag the
  // booking route reads: describing a mode the clinic has switched off sends
  // people to a 404.
  const homeVisitEnabled = await readHomeVisitEnabled();

  return (
    <>
      <SectionNav items={SECTION_NAV_ITEMS} />

      <PageHero
        eyebrow="How it works"
        title="Booking to recovery, in four steps"
        subtitle="What actually happens, from picking a slot to keeping the plan."
        primary={{ href: "/book", label: "Book a session", icon: "fa-calendar-check" }}
        photoId="hero-how-it-works"
        alt="A physiotherapist smiling at his desk, ready to start a patient's video session"
        overlay={{
          icon: "fa-clock",
          title: "About two minutes",
          body: "To book your first session.",
        }}
      />

      <Section
        id="the-steps"
        eyebrow="The four steps"
        title="What happens, in order"
        lede="About a week, booking to written plan."
      >
        <StepStrip steps={stepsFor(homeVisitEnabled)} />
      </Section>

      <Section
        id="after-the-first"
        tone="tint"
        eyebrow="And after that"
        title="Recovery is a course, not one appointment"
      >
        <Stagger className="grid gap-5 md:grid-cols-3">
          {AFTER_FIRST_SESSION.map((item) => (
            <StaggerItem key={item.title} className="h-full">
              <IconCard icon={item.icon} title={item.title} body={item.body} />
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <Section
        id="common-questions"
        eyebrow="Before you book"
        title="The things people hesitate over"
      >
        <Stagger className="grid gap-5 md:grid-cols-2">
          {objectionsFor(homeVisitEnabled).map((objection) => (
            <StaggerItem key={objection.q} className="h-full">
              <IconCard icon={objection.icon} title={objection.q} body={objection.a} />
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <ExploreSection current="how-it-works" homeVisitEnabled={homeVisitEnabled} />

      <ClosingCta
        id="book-now"
        title="Step one takes two minutes."
        body="Pick a slot. Your reports are read before you meet."
        primary={{ href: "/book", label: "Book a video session", icon: "fa-video" }}
        secondary={
          homeVisitEnabled
            ? { href: "/book-home-visit", label: "Book a home visit" }
            : undefined
        }
        photoId="hero-therapy"
        photoAlt="A patient smiling on her mat at home, reaching for the laptop her session is on"
      />
    </>
  );
}
