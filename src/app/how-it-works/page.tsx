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
      alt: "A hand picking a date for an appointment on a phone",
      title: "Book a slot",
      body: homeVisitEnabled
        ? "Pick a video call or a home visit, choose a time in your timezone, and pay over UPI."
        : "Choose a time in your own timezone and pay over UPI. Takes about two minutes.",
    },
    {
      photoId: "reports",
      alt: "A clinician marking up a patient's scan on a tablet with a stylus",
      title: "Send your reports",
      body: "Attach any X-rays or scans. Your physiotherapist reads them before you meet.",
    },
    {
      photoId: "step-assess",
      alt: "A patient at her desk, physiotherapist live on the laptop in front of her",
      title: "Get assessed",
      body: "An hour, one-to-one. They test how you move and find what is actually causing the pain.",
    },
    {
      photoId: "step-progress",
      alt: "A couple following their exercise plan on a mat at home, laptop open between them",
      title: "Follow your plan",
      body: "You leave with exercises and a written record. Every session after updates it.",
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
    body: "Buy a course and the same physiotherapist keeps you for every session in it.",
  },
  {
    icon: "fa-rotate",
    title: "Reschedule yourself",
    body: "Cancel more than 24 hours ahead for a full refund. Inside that window, there is none.",
  },
  {
    icon: "fa-hospital",
    title: "Referred by a hospital",
    body: "Your referral code carries across, so the team that discharged you can follow your progress.",
  },
];

function objectionsFor(homeVisitEnabled: boolean) {
  return [
    {
      icon: "fa-hand",
      q: "Does it work without hands-on treatment?",
      a: homeVisitEnabled
        ? "Recovery is driven by the right exercise, done correctly — and video shows how you move clearly. If you need hands on it, book a home visit."
        : "Recovery is driven by the right exercise, done correctly. What a physiotherapist needs is to see how you move, and video shows that clearly.",
    },
    {
      icon: "fa-house-laptop",
      q: "Why is being at home an advantage?",
      a: "Your pain happens in your chair and your bed. Assessing you there means the plan fits the room you actually recover in.",
    },
    {
      icon: "fa-earth-asia",
      q: "What if I live abroad?",
      a: "Slots show in your own timezone and need 12 hours' notice. Sessions run on Google Meet — nothing to install.",
    },
    {
      icon: "fa-lock",
      q: "Who sees the reports I upload?",
      a: "Only your therapist and the clinic admin. Files are stored privately and the link that opens one expires in minutes.",
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
        subtitle="No vague promises — this is what actually happens, from the moment you pick a slot to the plan you keep afterwards."
        primary={{ href: "/book", label: "Book a session", icon: "fa-calendar-check" }}
        photoId="hero-how-it-works"
        alt="A physiotherapist mid-consultation, the patient live on the laptop screen in front of him"
        overlay={{
          icon: "fa-clock",
          title: "About two minutes",
          body: "That is all booking the first session takes.",
        }}
      />

      <Section
        id="the-steps"
        eyebrow="The four steps"
        title="What happens, in order"
        lede="Roughly a week from booking to your first written plan."
      >
        <StepStrip steps={stepsFor(homeVisitEnabled)} />
      </Section>

      <Section
        id="after-the-first"
        tone="tint"
        eyebrow="And after that"
        title="Recovery is a course, not one appointment"
        lede="Here is what the platform keeps doing for the rest of it."
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
        title="Step one takes about two minutes."
        body="Pick a slot, and your physiotherapist will have read your reports before you meet."
        primary={{ href: "/book", label: "Book a video session", icon: "fa-video" }}
        secondary={
          homeVisitEnabled
            ? { href: "/book-home-visit", label: "Book a home visit" }
            : undefined
        }
      />
    </>
  );
}
