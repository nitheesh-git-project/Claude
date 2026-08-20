import { createPublicClient } from "@/lib/supabase/public";
import { SESSION_FEE_PAISE } from "@/lib/pricing";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";
import {
  Reveal,
  Stagger,
  StaggerItem,
  MotionButton,
  FloatingOrbs,
  AnimatedCard,
} from "@/components/motion/primitives";
import SpineStory from "@/components/home/SpineStory";
import JourneySteps from "@/components/home/JourneySteps";
import CareAreas from "@/components/home/CareAreas";
import ParkinsonsCare from "@/components/home/ParkinsonsCare";
import SessionPackages from "@/components/home/SessionPackages";
import SectionNav, { type SectionNavItem } from "@/components/SectionNav";
import ProgramCards from "@/components/catalog/ProgramCards";

// This page has no per-user content — it can be cached and revalidated
// on a timer instead of hitting Supabase on every single visit.
export const revalidate = 300;

const TRUST_POINTS = [
  { icon: "fa-certificate", label: "Licensed physiotherapists" },
  { icon: "fa-video", label: "1-on-1 HD video sessions" },
  { icon: "fa-file-medical", label: "Reports reviewed pre-session" },
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
  // in Site Content, not a stale constant — falls back to the flat fee
  // only in the unlikely event no categories are active at all.
  const startingPricePaise =
    categories && categories.length > 0
      ? Math.min(...categories.map((c) => c.price_paise))
      : SESSION_FEE_PAISE;

  // Isolated from the categories query above -- session_packages_visible
  // and the package-specific columns are all migration-dependent, and a
  // missing migration should only hide this section, never blank the
  // categories that already render fine without it.
  const { data: settingsRow } = await supabase
    .from("site_settings")
    .select("session_packages_visible")
    .maybeSingle();

  // Its own call for the same reason the one above is separate: this column
  // is newer than that one, and a database missing it must only cost the
  // walkthrough its configured pace, not hide the packages section too.
  const { data: journeyRow } = await supabase
    .from("site_settings")
    .select("journey_step_seconds")
    .maybeSingle();
  const journeyStepSeconds =
    typeof journeyRow?.journey_step_seconds === "number"
      ? journeyRow.journey_step_seconds
      : DEFAULT_ADMIN_SETTINGS.journeyStepSeconds;

  const { data: rawPackages } = settingsRow?.session_packages_visible
    ? await supabase
        .from("treatment_category_packages")
        .select(
          "id, title, subtitle, image_url, promises, badge_label, highlight, session_count, price_paise, compare_at_paise, validity_days, therapist_locked, category_id"
        )
        .eq("active", true)
        .eq("visible_on_home", true)
        .order("display_order", { ascending: true })
        .order("id", { ascending: true })
    : { data: null };

  // The package detail dialog's copy (long description, terms, scheduling
  // limits) lives in migration-dependent columns, so it is read in its own
  // call and merged in: an unknown-column error here costs the dialog those
  // fields instead of blanking the whole packages section.
  const packageIds = (rawPackages ?? []).map((p) => p.id);
  const { data: packageDetail } = packageIds.length
    ? await supabase
        .from("treatment_category_packages")
        .select(
          "id, description, terms, package_code, session_duration_minutes, min_gap_hours, max_sessions_per_week, max_purchases_per_patient"
        )
        .in("id", packageIds)
    : { data: null };
  const detailById = new Map((packageDetail ?? []).map((d) => [d.id, d]));

  const categoryPriceById = new Map((categories ?? []).map((c) => [c.id, c.price_paise]));
  const packages = (rawPackages ?? []).map((p) => ({
    ...p,
    ...(detailById.get(p.id) ?? {}),
    category_price_paise: categoryPriceById.get(p.category_id) ?? null,
  }));

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

  // Only lists sections that actually render -- several of these blocks
  // below are conditional on admin-controlled data (categories, packages,
  // testimonials), so a nav item pointing at a section that isn't on the
  // page would just do nothing when clicked.
  const sectionNavItems: SectionNavItem[] = [
    { id: "what-we-treat", label: "What We Treat", icon: "fa-bone" },
    { id: "parkinsons-care", label: "Parkinson's Care", icon: "fa-person-walking" },
    { id: "areas-of-care", label: "Areas of Care", icon: "fa-layer-group" },
    ...(categories && categories.length > 0
      ? [{ id: "programs", label: "Programs", icon: "fa-clipboard-list" }]
      : []),
    ...(packages.length > 0 ? [{ id: "packages", label: "Packages", icon: "fa-box-open" }] : []),
    ...(testimonials && testimonials.length > 0
      ? [{ id: "reviews", label: "Reviews", icon: "fa-star" }]
      : []),
    { id: "get-started", label: "Get Started", icon: "fa-rocket" },
  ];

  return (
    <>
      <SectionNav items={sectionNavItems} />

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
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-teal-700">
                Booking to recovery
              </p>
              <JourneySteps variant="compact" stepSeconds={journeyStepSeconds} />
            </div>
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

      <ParkinsonsCare />

      {/* BREADTH OF CARE — credibility across more than one complaint */}
      <div id="areas-of-care" className="scroll-mt-28 border-y border-slate-100 bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">
              Areas of care
            </span>
            <h2 className="font-display mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
              What our specialists treat
            </h2>
            <p className="mt-3 text-sm text-slate-600">
              Each area has a defined assessment and a structured programme
              behind it — not a general promise to help.
            </p>
          </Reveal>
          <CareAreas />
        </div>
      </div>

      {/* CONDITIONS — admin-controlled content, so the layout stays generic
          and simply adapts to whatever categories are configured. */}
      {categories && categories.length > 0 && (
        <div id="programs" className="scroll-mt-28 bg-white py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal className="mx-auto mb-12 max-w-2xl text-center">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">
                Structured programmes
              </span>
              <h2 className="font-display mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
                Programs we run virtually
              </h2>
              <p className="mt-3 text-sm text-slate-600">
                Every programme opens with the same 60-minute assessment —
                what changes is the protocol built from it.
              </p>
            </Reveal>
            <ProgramCards programs={categories} packages={packages} />
          </div>
        </div>
      )}

      <SessionPackages packages={packages} />

      {/* TESTIMONIALS */}
      {testimonials && testimonials.length > 0 && (
        <div id="reviews" className="scroll-mt-28 py-20">
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
      <div id="get-started" className="relative scroll-mt-28 overflow-hidden py-20">
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
