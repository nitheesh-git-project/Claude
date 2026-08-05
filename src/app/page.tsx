import { createPublicClient } from "@/lib/supabase/public";
import { SESSION_FEE_PAISE } from "@/lib/pricing";
import { Reveal, Stagger, StaggerItem, MotionButton, FloatingOrbs, AnimatedCard } from "@/components/motion/primitives";

const ICON_ROTATION = ["fa-bone", "fa-user-injured", "fa-person-running", "fa-laptop-house"];

// This page has no per-user content — it can be cached and revalidated
// on a timer instead of hitting Supabase on every single visit.
export const revalidate = 300;

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
      {/* HERO */}
      <div className="relative overflow-hidden bg-gradient-to-b from-teal-50/70 via-white to-white py-20 lg:py-28 border-b border-slate-100">
        <FloatingOrbs />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-12 items-center">
          <Reveal>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-100 text-teal-800 mb-5 border border-teal-200">
              <i className="fa-solid fa-shield-halved text-teal-600"></i>{" "}
              Certified Global Telehealth Practice
            </span>
            <h1 className="font-display text-4xl sm:text-6xl font-extrabold text-slate-900 leading-[1.08] tracking-tight">
              Expert Virtual Physical Therapy —{" "}
              <span className="bg-gradient-to-r from-teal-700 to-emerald-500 bg-clip-text text-transparent">
                Restoring Mobility from Home
              </span>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
              Receive 1-on-1 evidence-based physical therapy, movement
              assessments, and customized rehabilitation plans from licensed
              specialists — no matter where you live in the world.
            </p>
            <div className="mt-9 flex flex-wrap gap-4 items-center">
              <MotionButton href="/book" variant="primary">
                <i className="fa-solid fa-calendar-check"></i> Book Assessment
                <i className="fa-solid fa-arrow-right text-xs opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all"></i>
              </MotionButton>
              <MotionButton href="/how-it-works" variant="secondary">
                <i className="fa-solid fa-circle-play text-teal-600"></i>{" "}
                Watch How It Works
              </MotionButton>
            </div>
            <div
              className={`mt-12 grid gap-4 pt-6 border-t border-slate-200/80 ${
                hasRealRatings ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"
              }`}
            >
              <div>
                <p className="font-display text-2xl font-bold text-slate-900">100+</p>
                <p className="text-xs text-slate-500 font-medium">Global Patients</p>
              </div>
              <div>
                <p className="font-display text-2xl font-bold text-slate-900">100%</p>
                <p className="text-xs text-slate-500 font-medium">
                  Licensed Specialists
                </p>
              </div>
              <div>
                <p className="font-display text-2xl font-bold text-slate-900">1-on-1</p>
                <p className="text-xs text-slate-500 font-medium">
                  Dedicated HD Video
                </p>
              </div>
              {hasRealRatings && (
                <div>
                  <p className="font-display text-2xl font-bold text-slate-900">
                    <i className="fa-solid fa-star text-amber-500 text-lg mr-1"></i>
                    {Number(ratingSummary.avg_rating).toFixed(1)}
                  </p>
                  <p className="text-xs text-slate-500 font-medium">
                    From {ratingSummary.rating_count} Real Sessions
                  </p>
                </div>
              )}
            </div>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="bg-white p-6 rounded-2xl shadow-xl shadow-slate-900/5 border border-slate-100 relative">
              <div className="bg-slate-900 rounded-xl overflow-hidden aspect-video relative flex items-center justify-center text-white">
                <div className="relative text-center p-6">
                  <div className="w-16 h-16 bg-teal-600/90 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg cursor-pointer hover:scale-105 transition">
                    <i className="fa-solid fa-play text-2xl text-white ml-1"></i>
                  </div>
                  <p className="font-semibold text-sm">
                    60-Min Guided Movement Evaluation
                  </p>
                  <p className="text-xs text-slate-300">
                    Live Video Consultation Sample
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between bg-teal-50 p-3 rounded-xl border border-teal-100">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 bg-teal-700 text-white rounded-full flex items-center justify-center font-bold text-xs">
                    DP
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      Dr. Pooja (PT)
                    </p>
                    <p className="text-[11px] text-teal-800">
                      Lead Specialist • 8+ Yrs Exp
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-teal-800 bg-white px-2.5 py-1 rounded-lg border border-teal-200">
                  From ₹{(startingPricePaise / 100).toLocaleString("en-IN")} INR / Session
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      {/* CONDITIONS GRID OVERVIEW */}
      {categories && categories.length > 0 && (
        <div className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
              Conditions We Treat Virtually
            </h2>
            <p className="text-slate-600 mt-2 text-sm">
              Targeted, evidence-based rehabilitation protocols for acute and
              chronic musculoskeletal pain.
            </p>
          </Reveal>
          <Stagger className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {categories.map((c, i) => {
              const points = Array.isArray(c.points) ? (c.points as string[]) : [];
              const desc = c.description || points[0] || "Learn more about this program.";
              return (
                <StaggerItem key={c.id}>
                  <AnimatedCard
                    href={`/book?category=${c.id}`}
                    className="h-full bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:shadow-slate-900/5 hover:border-teal-200 transition-shadow"
                  >
                    <div className="w-12 h-12 bg-teal-100 text-teal-700 rounded-xl flex items-center justify-center text-xl mb-4">
                      <i className={`fa-solid ${ICON_ROTATION[i % ICON_ROTATION.length]}`}></i>
                    </div>
                    <h3 className="font-display font-bold text-lg text-slate-800">{c.title}</h3>
                    <p className="text-slate-600 text-xs mt-2 leading-relaxed">
                      {desc}
                    </p>
                  </AnimatedCard>
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>
      )}

      {/* TESTIMONIALS */}
      {testimonials && testimonials.length > 0 && (
        <div className="py-20 bg-slate-50 border-y border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Reveal className="text-center max-w-2xl mx-auto mb-14">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
                What Our Patients Say
              </h2>
              <p className="text-slate-600 mt-2 text-sm">
                Real recoveries from real patients, guided remotely by our
                licensed specialists.
              </p>
              {hasRealRatings && (
                <p className="text-amber-600 font-semibold text-sm mt-2">
                  <i className="fa-solid fa-star mr-1"></i>
                  {Number(ratingSummary.avg_rating).toFixed(1)} average rating across{" "}
                  {ratingSummary.rating_count} completed sessions
                </p>
              )}
            </Reveal>
            <Stagger className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {testimonials.map((t) => (
                <StaggerItem key={t.id}>
                  <AnimatedCard className="h-full bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                    {t.rating && (
                      <div className="text-amber-500 text-sm mb-3">
                        {"★".repeat(t.rating)}
                        <span className="text-slate-300">
                          {"★".repeat(5 - t.rating)}
                        </span>
                      </div>
                    )}
                    <p className="text-slate-700 text-sm leading-relaxed flex-1">
                      &quot;{t.quote}&quot;
                    </p>
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <p className="font-bold text-sm text-slate-900">
                        {t.patient_name}
                      </p>
                      {t.condition_label && (
                        <p className="text-xs text-teal-700 mt-0.5">
                          {t.condition_label}
                        </p>
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
        <Reveal className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-white">
            Your recovery starts with one session.
          </h2>
          <p className="text-teal-100 mt-4 text-base max-w-xl mx-auto">
            Book a 60-minute assessment today and get a personalized plan from
            a licensed specialist — wherever you are.
          </p>
          <div className="mt-8 flex justify-center gap-4 flex-wrap">
            <MotionButton href="/book" variant="secondary">
              <i className="fa-solid fa-calendar-check text-teal-700"></i> Book Assessment
            </MotionButton>
            <MotionButton href="/get-started" variant="ghost">
              Explore All Options <i className="fa-solid fa-arrow-right text-xs"></i>
            </MotionButton>
          </div>
        </Reveal>
      </div>
    </>
  );
}
