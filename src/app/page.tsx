import { createPublicClient } from "@/lib/supabase/public";
import { SESSION_FEE_PAISE } from "@/lib/pricing";
import {
  Reveal,
  Stagger,
  StaggerItem,
  MotionButton,
  FloatingOrbs,
  AnimatedCard,
} from "@/components/motion/primitives";
import SpineStory from "@/components/home/SpineStory";
import { ConsultScene } from "@/components/howitworks/scenes";

const ICON_ROTATION = ["fa-bone", "fa-user-injured", "fa-person-running", "fa-laptop-house"];

// This page has no per-user content — it can be cached and revalidated
// on a timer instead of hitting Supabase on every single visit.
export const revalidate = 300;

const TRUST_POINTS = [
  { icon: "fa-certificate", label: "Licensed physiotherapists" },
  { icon: "fa-video", label: "1-on-1 HD video sessions" },
  { icon: "fa-file-medical", label: "Reports reviewed pre-session" },
  { icon: "fa-lock", label: "Secure UPI payment" },
];

const JOURNEY = [
  {
    icon: "fa-calendar-check",
    step: "01",
    title: "Book in your timezone",
    body: "Pick a slot, pay over UPI, and upload your scans — all before the call.",
  },
  {
    icon: "fa-video",
    step: "02",
    title: "Get assessed on camera",
    body: "60 minutes of guided movement testing with a licensed specialist.",
  },
  {
    icon: "fa-person-walking",
    step: "03",
    title: "Rehab from your room",
    body: "A video-guided plan fitted to your chair, bed and floor space.",
  },
];

export default async function Home() {
  const supabase = createPublicClient();
  const { data: categories } = await supabase
    .from("treatment_categories")
    .select("id, title, description, points, price_paise")
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

  const { data: testimonials } = await supabase
    .from("testimonials")
    .select("id, patient_name, quote, rating, condition_label")
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true })
    .limit(6);

  // Real, aggregated patient rating data (never individual reviews/names —
  // see the schema comment on public_rating_summary for why) surfaced
  // alongside the hand-curated testimonials above.
  const { data: ratingSummary } = await supabase
    .from("public_rating_summary")
    .select("avg_rating, rating_count")
    .single();
  const hasRealRatings = !!ratingSummary && ratingSummary.rating_count > 0;

  return (
    <>
      {/* HERO — the session itself is the hero image, so what we sell is
          legible before a single line of copy is read. */}
      <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-b from-teal-50/70 via-white to-white py-16 lg:py-24">
        <FloatingOrbs />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 md:grid-cols-2 lg:px-8">
          <Reveal>
            <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-800">
              <i className="fa-solid fa-shield-halved text-teal-600" />
              Certified Global Telehealth Practice
            </span>
            <h1 className="font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:text-6xl">
              Physiotherapy that watches{" "}
              <span className="bg-gradient-to-r from-teal-700 to-emerald-500 bg-clip-text text-transparent">
                how you actually move
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              A licensed specialist assesses your posture and range of motion
              live over video, then builds a rehabilitation plan around the
              room you recover in — anywhere in the world.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <MotionButton href="/book" variant="primary">
                <i className="fa-solid fa-calendar-check" /> Book Assessment
                <i className="fa-solid fa-arrow-right -ml-2 text-xs opacity-0 transition-all group-hover:ml-0 group-hover:opacity-100" />
              </MotionButton>
              <MotionButton href="/how-it-works" variant="secondary">
                <i className="fa-solid fa-circle-play text-teal-600" /> See how a session runs
              </MotionButton>
            </div>

            <div
              className={`mt-12 grid gap-4 border-t border-slate-200/80 pt-6 ${
                hasRealRatings ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"
              }`}
            >
              <div>
                <p className="font-display text-2xl font-bold text-slate-900">100+</p>
                <p className="text-xs font-medium text-slate-500">Global Patients</p>
              </div>
              <div>
                <p className="font-display text-2xl font-bold text-slate-900">60 min</p>
                <p className="text-xs font-medium text-slate-500">1-on-1 Assessment</p>
              </div>
              <div>
                <p className="font-display text-2xl font-bold text-slate-900">
                  ₹{(startingPricePaise / 100).toLocaleString("en-IN")}
                </p>
                <p className="text-xs font-medium text-slate-500">Starting per session</p>
              </div>
              {hasRealRatings && (
                <div>
                  <p className="font-display text-2xl font-bold text-slate-900">
                    <i className="fa-solid fa-star mr-1 text-lg text-amber-500" />
                    {Number(ratingSummary.avg_rating).toFixed(1)}
                  </p>
                  <p className="text-xs font-medium text-slate-500">
                    From {ratingSummary.rating_count} sessions
                  </p>
                </div>
              )}
            </div>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="h-[26rem] sm:h-[30rem]">
              <ConsultScene />
            </div>
            <p className="mt-3 text-center text-xs text-slate-500">
              A live movement assessment — posture measured against your own
              alignment, in real time.
            </p>
          </Reveal>
        </div>
      </div>

      {/* TRUST STRIP */}
      <div className="border-b border-slate-100 bg-white py-5">
        <Stagger className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 sm:px-6 lg:px-8">
          {TRUST_POINTS.map((t) => (
            <StaggerItem key={t.label}>
              <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <i className={`fa-solid ${t.icon} text-teal-600`} />
                {t.label}
              </span>
            </StaggerItem>
          ))}
        </Stagger>
      </div>

      {/* SCROLL STORY — what we treat, read off the spine itself */}
      <SpineStory />

      {/* JOURNEY TEASER */}
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <Reveal className="mx-auto mb-14 max-w-2xl text-center">
          <h2 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">
            Three steps from booking to recovery
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Everything is handled before you join the call, so the hour is
            spent on you — not on paperwork.
          </p>
        </Reveal>
        <Stagger className="grid gap-6 md:grid-cols-3">
          {JOURNEY.map((j) => (
            <StaggerItem key={j.step}>
              <AnimatedCard className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:border-teal-200 hover:shadow-lg hover:shadow-slate-900/5">
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-emerald-600 text-lg text-white shadow-lg shadow-teal-900/20">
                    <i className={`fa-solid ${j.icon}`} />
                  </span>
                  <span className="font-display text-3xl font-extrabold text-slate-100">
                    {j.step}
                  </span>
                </div>
                <h3 className="font-display mt-4 text-lg font-bold text-slate-900">
                  {j.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{j.body}</p>
              </AnimatedCard>
            </StaggerItem>
          ))}
        </Stagger>
        <Reveal delay={0.1} className="mt-10 text-center">
          <MotionButton href="/how-it-works" variant="secondary">
            Walk through a full session <i className="fa-solid fa-arrow-right text-xs" />
          </MotionButton>
        </Reveal>
      </div>

      {/* CONDITIONS — admin-controlled content, so the layout stays generic
          and simply adapts to whatever categories are configured. */}
      {categories && categories.length > 0 && (
        <div className="border-y border-slate-100 bg-slate-50 py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal className="mx-auto mb-14 max-w-2xl text-center">
              <h2 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">
                Programs we run virtually
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Targeted, evidence-based rehabilitation protocols for acute and
                chronic musculoskeletal pain.
              </p>
            </Reveal>
            <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {categories.map((c, i) => {
                const points = Array.isArray(c.points) ? (c.points as string[]) : [];
                const desc = c.description || points[0] || "Learn more about this program.";
                return (
                  <StaggerItem key={c.id}>
                    <AnimatedCard
                      href={`/book?category=${c.id}`}
                      className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:border-teal-200 hover:shadow-lg hover:shadow-slate-900/5"
                    >
                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-100 text-xl text-teal-700">
                        <i className={`fa-solid ${ICON_ROTATION[i % ICON_ROTATION.length]}`} />
                      </div>
                      <h3 className="font-display text-lg font-bold text-slate-800">
                        {c.title}
                      </h3>
                      <p className="mt-2 text-xs leading-relaxed text-slate-600">{desc}</p>
                      <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700">
                        Book this program <i className="fa-solid fa-arrow-right text-[10px]" />
                      </span>
                    </AnimatedCard>
                  </StaggerItem>
                );
              })}
            </Stagger>
          </div>
        </div>
      )}

      {/* TESTIMONIALS */}
      {testimonials && testimonials.length > 0 && (
        <div className="py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal className="mx-auto mb-14 max-w-2xl text-center">
              <h2 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">
                Recoveries guided entirely over video
              </h2>
              {hasRealRatings && (
                <p className="mt-2 text-sm font-semibold text-amber-600">
                  <i className="fa-solid fa-star mr-1" />
                  {Number(ratingSummary.avg_rating).toFixed(1)} average across{" "}
                  {ratingSummary.rating_count} completed sessions
                </p>
              )}
            </Reveal>
            <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((t) => (
                <StaggerItem key={t.id}>
                  <AnimatedCard className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    {t.rating && (
                      <div className="mb-3 text-sm text-amber-500">
                        {"★".repeat(t.rating)}
                        <span className="text-slate-300">{"★".repeat(5 - t.rating)}</span>
                      </div>
                    )}
                    <p className="flex-1 text-sm leading-relaxed text-slate-700">
                      &quot;{t.quote}&quot;
                    </p>
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <p className="text-sm font-bold text-slate-900">{t.patient_name}</p>
                      {t.condition_label && (
                        <p className="mt-0.5 text-xs text-teal-700">{t.condition_label}</p>
                      )}
                    </div>
                  </AnimatedCard>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </div>
      )}

      {/* FINAL CTA */}
      <div className="relative overflow-hidden py-20">
        <div className="absolute inset-0 bg-gradient-to-br from-teal-800 to-emerald-700" />
        <FloatingOrbs className="opacity-40" />
        <Reveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl font-extrabold text-white sm:text-4xl">
            Your recovery starts with one assessment.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-teal-100">
            Book a 60-minute session and leave with a plan built for your body
            and your home — wherever you are.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <MotionButton href="/book" variant="secondary">
              <i className="fa-solid fa-calendar-check text-teal-700" /> Book Assessment
            </MotionButton>
            <MotionButton href="/get-started" variant="ghost">
              Explore All Options <i className="fa-solid fa-arrow-right text-xs" />
            </MotionButton>
          </div>
        </Reveal>
      </div>
    </>
  );
}
