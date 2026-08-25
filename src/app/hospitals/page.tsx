import type { Metadata } from "next";
import HospitalInquiryForm from "@/components/HospitalInquiryForm";
import SectionNav, { type SectionNavItem } from "@/components/SectionNav";
import PageHero from "@/components/marketing/PageHero";
import Section from "@/components/marketing/Section";
import IconCard from "@/components/marketing/IconCard";
import ExploreSection from "@/components/marketing/ExploreSection";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/primitives";
import { readHomeVisitEnabled } from "@/lib/homeVisitFlag";

export const metadata: Metadata = {
  title: "For Hospitals | Dr. Pooja's Physio",
  description:
    "Refer a discharged patient into structured virtual rehabilitation and get their progress reported back to the operating team.",
};

// The inquiry form is a client component posting to an API route, so nothing
// here is per-visitor -- this page caches like the rest of the public site.
export const revalidate = 300;

const PROBLEM = [
  {
    icon: "fa-plane-departure",
    title: "The patient goes home",
    body: "Out-of-town patients travel back after discharge and rarely return for follow-up physiotherapy.",
  },
  {
    icon: "fa-link-slash",
    title: "The protocol breaks",
    body: "Rehabilitation stalls or is done wrong, and nobody on your side finds out until something goes wrong.",
  },
  {
    icon: "fa-file-circle-question",
    title: "You lose visibility",
    body: "The surgical outcome is judged on a recovery you had no way to observe.",
  },
];

const SOLUTION = [
  {
    icon: "fa-video",
    title: "Structured virtual rehab",
    body: "Your patient is progressed over video on a protocol aligned with your discharge instructions.",
  },
  {
    icon: "fa-chart-line",
    title: "Progress reported back",
    body: "Referring surgeons get periodic updates on range of motion, adherence and milestones.",
  },
  {
    icon: "fa-earth-asia",
    title: "Wherever they live",
    body: "Geography stops being the reason continuity of care ends at the hospital door.",
  },
];

export default async function HospitalsPage() {
  const homeVisitEnabled = await readHomeVisitEnabled();

  const sectionNavItems: SectionNavItem[] = [
    { id: "the-gap", label: "The Gap", icon: "fa-triangle-exclamation" },
    { id: "our-approach", label: "Our Approach", icon: "fa-hand-holding-medical" },
    { id: "explore", label: "Explore the Site", icon: "fa-compass" },
    { id: "enquire", label: "Talk to Us", icon: "fa-paper-plane" },
  ];

  return (
    <>
      <SectionNav items={sectionNavItems} />

      {/* The form moved out of the hero and into its own band at the foot.
          A B2B visitor does not fill a form before they have read the
          argument, and putting it in the hero cost the page its opening
          statement -- which was the one thing they came to read. */}
      <PageHero
        eyebrow="For hospitals"
        title="Recovery that continues after discharge"
        subtitle="Refer a patient into structured virtual rehabilitation and get their progress reported back to the team that operated on them."
        primary={{ href: "#enquire", label: "Talk to us", icon: "fa-paper-plane" }}
        stats={[
          { value: "60 min", label: "Initial assessment" },
          { value: "Video", label: "No patient travel" },
          { value: "Reported", label: "Back to your team" },
        ]}
        photoId="hero-hospitals"
        alt="A clinician reviewing a discharged patient over a video consultation from the clinic"
      />

      <Section
        id="the-gap"
        tone="tint"
        eyebrow="The gap"
        title="What happens after discharge today"
      >
        <Stagger className="grid gap-5 md:grid-cols-3">
          {PROBLEM.map((item) => (
            <StaggerItem key={item.title} className="h-full">
              <IconCard icon={item.icon} title={item.title} body={item.body} tone="rose" />
            </StaggerItem>
          ))}
        </Stagger>

        {/* Real wrapper, not a zero-height anchor: the rail decides what is
            active by which section crosses the viewport centre, and a
            height-less marker can never satisfy that. */}
        <div id="our-approach" className="scroll-mt-24 pt-16 sm:pt-20">
          <Reveal className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-700">
              With a partnership
            </p>
            <h2 className="mt-3 text-[1.75rem] font-bold leading-[1.15] tracking-[-0.02em] text-slate-900 sm:text-[2.25rem]">
              What we put in its place
            </h2>
          </Reveal>
          <Stagger className="grid gap-5 md:grid-cols-3">
            {SOLUTION.map((item) => (
              <StaggerItem key={item.title} className="h-full">
                <IconCard icon={item.icon} title={item.title} body={item.body} />
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </Section>

      <ExploreSection current="hospitals" homeVisitEnabled={homeVisitEnabled} />

      <Section
        id="enquire"
        tone="panel"
        eyebrow="Talk to us"
        title="Start a referral conversation"
        lede="Tell us about your discharge volumes and we will come back with how a partnership would run."
      >
        <div className="mx-auto max-w-xl">
          <HospitalInquiryForm />
        </div>
      </Section>
    </>
  );
}
