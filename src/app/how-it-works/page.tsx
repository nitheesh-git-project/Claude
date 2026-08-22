import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import StepScroller from "@/components/howitworks/StepScroller";
import SectionNav, { type SectionNavItem } from "@/components/SectionNav";
import { Reveal, Stagger, StaggerItem, MotionButton, FloatingOrbs } from "@/components/motion/primitives";

// No per-user content, and createPublicClient() never touches cookies(), so
// this caches and revalidates on a timer rather than hitting Supabase on
// every visit -- same as /home-visit and /conditions.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "How It Works | Dr. Pooja's Physio",
  description:
    "From booking to your next session: pick a video call or a home visit, answer seven questions and attach your reports, meet your therapist for an hour, and watch your own chart update afterwards.",
};

// Everything that keeps happening after the first session. These are
// features that exist -- programmes lock to one therapist, cancellations
// have a stated window, hospitals refer patients in -- not aspirations.
const AFTER_FIRST_SESSION = [
  {
    icon: "fa-layer-group",
    title: "Programmes, not one-offs",
    body: "Buy a course of sessions and the first therapist assigned to it stays with you for the rest — every later session confirms itself and gets its own link. You can schedule several at once instead of booking them one by one.",
  },
  {
    icon: "fa-rotate",
    title: "Rebook and reschedule yourself",
    body: "Your dashboard lists every session — upcoming, past and cancelled — as a list or a calendar. Cancel more than 24 hours ahead and the payment is refunded in full; inside that window it is not. Home visits state their own window at checkout.",
  },
  {
    icon: "fa-hospital",
    title: "Referred by your hospital",
    body: "If a hospital or clinic sent you, their referral code carries across at booking, so your therapist knows who is treating you elsewhere and the referring team can follow your progress.",
  },
];

function objectionsFor(homeVisitEnabled: boolean) {
  return OBJECTIONS.map((objection) =>
    objection.icon === "fa-hand" && !homeVisitEnabled
      ? { ...objection, a: objection.a.slice(0, objection.a.indexOf(" If hands-on")) }
      : objection
  );
}

const OBJECTIONS = [
  {
    icon: "fa-hand",
    q: "Without hands-on treatment, does it actually work?",
    a: "Most musculoskeletal recovery is driven by graded, correctly-performed exercise — not by passive treatment. What a therapist needs is to see how you move, and video shows that clearly. If hands-on is what your condition needs, book a home visit instead: same therapists, at your address.",
  },
  {
    icon: "fa-house-laptop",
    q: "Why is being at home an advantage?",
    a: "Your pain happens in your chair, at your desk, in your bed. Assessing you there means the plan is fitted to the environment you'll actually rehab in.",
  },
  {
    icon: "fa-calendar-day",
    q: "What if I'm in a different country?",
    a: "Slots are shown in your own timezone and confirmed before the call, and you need at least 12 hours' notice to book. Sessions run on Google Meet, so there's nothing to install beyond a browser.",
  },
  {
    icon: "fa-lock",
    q: "Who can see the reports I upload?",
    a: "Only the therapist treating you and the clinic's admin. Files are stored privately rather than behind a public link, and the link that opens one expires within minutes. You can delete any report you've uploaded, and download your whole record as a PDF whenever you want it.",
  },
];

const SECTION_NAV_ITEMS: SectionNavItem[] = [
  { id: "the-steps", label: "The Steps", icon: "fa-route" },
  { id: "after-the-first", label: "After Session One", icon: "fa-layer-group" },
  { id: "common-questions", label: "Common Questions", icon: "fa-circle-question" },
  { id: "book-now", label: "Book Now", icon: "fa-calendar-check" },
];

export default async function HowItWorksPage() {
  // Home visits are behind an admin master switch, and /book-home-visit
  // 404s when it is off. A marketing page that describes a mode the clinic
  // has turned off sends people to a dead end, so every mention of it on
  // this page is gated on the same flag the booking route reads.
  const { data: settingsRow } = await createPublicClient()
    .from("site_settings")
    .select("home_visit_enabled")
    .maybeSingle();
  const homeVisitEnabled = settingsRow?.home_visit_enabled === true;

  return (
    <>
      <SectionNav items={SECTION_NAV_ITEMS} />

      <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-b from-teal-50/70 to-white py-20">
        <FloatingOrbs />
        <Reveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-800">
            <i className="fa-solid fa-route text-teal-600" />
            Four steps, booking to chart
          </span>
          <h1 className="font-display mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl">
            What actually happens when you book a session
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            No vague promises — this is the platform itself: choosing a video
            call or a home visit, the questions you answer beforehand, the hour
            with your therapist, and the record it leaves you with.
          </p>
        </Reveal>
      </div>

      <div id="the-steps" className="scroll-mt-28 py-16">
        <StepScroller homeVisitEnabled={homeVisitEnabled} />
      </div>

      {/* What keeps happening after session one -- the part a three-step
          page never had room for, and the part that decides whether
          someone books a second time. */}
      <div id="after-the-first" className="scroll-mt-28 border-t border-slate-100 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">
              And after the first session
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              Recovery is a course of treatment, not one appointment. Here is
              what the platform does for the rest of it.
            </p>
          </Reveal>
          <Stagger className="grid gap-6 md:grid-cols-3">
            {AFTER_FIRST_SESSION.map((item) => (
              <StaggerItem key={item.title}>
                <div className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                    <i className={`fa-solid ${item.icon}`} />
                  </span>
                  <h3 className="font-display text-base font-bold text-slate-900">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.body}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </div>

      {/* The things people hesitate over, answered plainly. */}
      <div id="common-questions" className="scroll-mt-28 border-y border-slate-100 bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">
              The questions people ask before booking
            </h2>
          </Reveal>
          <Stagger className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {objectionsFor(homeVisitEnabled).map((o) => (
              <StaggerItem key={o.q}>
                <div className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                    <i className={`fa-solid ${o.icon}`} />
                  </span>
                  <h3 className="font-display text-base font-bold text-slate-900">
                    {o.q}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{o.a}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </div>

      <div id="book-now" className="relative scroll-mt-28 overflow-hidden py-20">
        <div className="absolute inset-0 bg-gradient-to-br from-teal-800 to-emerald-700" />
        <FloatingOrbs className="opacity-40" />
        <Reveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl font-extrabold text-white sm:text-4xl">
            Step one takes about two minutes.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-teal-100">
            Pick a slot, and your therapist will have read your answers and your
            reports before you meet.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <MotionButton href="/book" variant="secondary">
              <i className="fa-solid fa-video text-teal-700" /> Book a video session
            </MotionButton>
            {homeVisitEnabled && (
              <MotionButton href="/book-home-visit" variant="secondary">
                <i className="fa-solid fa-house-medical text-teal-700" /> Book a home visit
              </MotionButton>
            )}
          </div>
        </Reveal>
      </div>
    </>
  );
}
