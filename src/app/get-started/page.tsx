import type { Metadata } from "next";
import { Reveal, Stagger, StaggerItem, MotionButton, FloatingOrbs } from "@/components/motion/primitives";

export const metadata: Metadata = {
  title: "Get Started | Dr. Pooja's Physio",
  description:
    "Book a consultation, sign in to the patient or partner portal, or join the therapist network.",
};

const PATHS = [
  {
    key: "book",
    eyebrow: "Most people start here",
    icon: "fa-calendar-plus",
    title: "Book a consultation",
    lede: "You have pain or a recent surgery and want a specialist to assess it.",
    points: [
      "Slots shown in your own timezone",
      "Instant UPI payment in ₹",
      "Upload X-rays / MRI before the call",
    ],
    href: "/book",
    cta: "Book Consultation Now",
    variant: "primary" as const,
    accent: "teal",
    featured: true,
  },
  {
    key: "patient",
    eyebrow: "Existing patients",
    icon: "fa-user",
    title: "Patient portal",
    lede: "You've already had a session and want your plan, links or receipts.",
    points: [
      "Join your Google Meet session",
      "View your exercise plan",
      "Manage bookings and receipts",
    ],
    href: "/patient/login",
    cta: "Patient Login / Sign Up",
    variant: "dark" as const,
    accent: "blue",
    featured: false,
  },
  {
    key: "therapist",
    eyebrow: "Clinicians",
    icon: "fa-user-doctor",
    title: "Therapist network",
    lede: "You're a physiotherapist looking to join or log in to the network.",
    points: [
      "View assigned patient schedules",
      "Submit post-session SOAP notes",
      "Track commission in ₹ INR",
    ],
    href: "/therapist/login",
    cta: "Therapist Login / Apply",
    variant: "purple" as const,
    accent: "purple",
    featured: false,
  },
  {
    key: "hospital",
    eyebrow: "Hospitals & clinics",
    icon: "fa-hospital",
    title: "Partner portal",
    lede: "You're an onboarded hospital or clinic partner referring patients to us.",
    points: [
      "Refer a patient in a few fields",
      "Track which referrals converted",
      "See your revenue share per session",
    ],
    href: "/hospital/login",
    // No "/ Sign Up" like the other two: partner accounts aren't self-serve,
    // they're provisioned by the admin (see the onboard-hospital route), so
    // this card only ever offers a login.
    cta: "Partner Login",
    variant: "dark" as const,
    accent: "indigo",
    featured: false,
  },
];

const ACCENTS: Record<string, { chip: string; icon: string; check: string }> = {
  teal: { chip: "text-teal-700", icon: "bg-teal-100 text-teal-700", check: "text-teal-600" },
  blue: { chip: "text-blue-700", icon: "bg-blue-100 text-blue-700", check: "text-blue-600" },
  purple: { chip: "text-purple-700", icon: "bg-purple-100 text-purple-700", check: "text-purple-600" },
  indigo: { chip: "text-indigo-700", icon: "bg-indigo-100 text-indigo-700", check: "text-indigo-600" },
};

export default function GetStartedPage() {
  return (
    <>
      <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-b from-teal-50/70 to-white py-16">
        <FloatingOrbs />
        <Reveal className="relative mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
          <span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-teal-800">
            Welcome Hub
          </span>
          <h1 className="font-display mt-4 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            Which of these is you?
          </h1>
          <p className="mt-4 text-base text-slate-600">
            Four ways into the platform — pick the one that matches where you
            are right now.
          </p>
        </Reveal>
      </div>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <Stagger className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {PATHS.map((p) => {
            const a = ACCENTS[p.accent];
            return (
              <StaggerItem key={p.key} className="h-full">
                <div
                  className={`relative flex h-full flex-col justify-between rounded-2xl bg-white p-7 transition-all hover:-translate-y-1.5 hover:shadow-xl hover:shadow-slate-900/5 ${
                    p.featured
                      ? "border-2 border-teal-600 shadow-md"
                      : "border border-slate-200 shadow-sm"
                  }`}
                >
                  {p.featured && (
                    <span className="absolute -top-3 left-7 rounded-full bg-teal-700 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow">
                      Start here
                    </span>
                  )}
                  <div>
                    <span
                      className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl text-xl ${a.icon}`}
                    >
                      <i className={`fa-solid ${p.icon}`} />
                    </span>
                    <span
                      className={`block text-[11px] font-bold uppercase tracking-wider ${a.chip}`}
                    >
                      {p.eyebrow}
                    </span>
                    <h2 className="font-display mt-1 text-xl font-bold text-slate-900">
                      {p.title}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{p.lede}</p>
                    <ul className="mt-5 space-y-2 border-t border-slate-100 pt-5">
                      {p.points.map((pt) => (
                        <li key={pt} className="flex items-start gap-2.5 text-xs text-slate-600">
                          <i className={`fa-solid fa-check mt-0.5 ${a.check}`} />
                          {pt}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <MotionButton
                    href={p.href}
                    variant={p.variant}
                    fullWidth
                    className="mt-7 justify-center text-xs"
                  >
                    {p.cta} <i className="fa-solid fa-arrow-right text-[10px]" />
                  </MotionButton>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      </section>
    </>
  );
}
