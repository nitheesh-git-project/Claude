import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { Reveal, MotionButton, FloatingOrbs } from "@/components/motion/primitives";
import SectionNav, { type SectionNavItem } from "@/components/SectionNav";
import ProgramCards from "@/components/catalog/ProgramCards";
import SessionPackages from "@/components/home/SessionPackages";

export const metadata: Metadata = {
  title: "Conditions Treated | Dr. Pooja's Physio",
  description:
    "Specialized virtual rehabilitation programs — assessed over video and delivered as a plan you follow at home.",
};

// No per-user content on this page — cache and revalidate on a timer
// instead of hitting Supabase on every single visit.
export const revalidate = 300;

type Category = {
  id: string;
  title: string;
  description: string | null;
  points: unknown;
  price_paise: number;
  duration_minutes: number;
  cta_label: string;
};

export default async function ConditionsPage() {
  const supabase = createPublicClient();
  const { data: categories } = await supabase
    .from("treatment_categories")
    .select("id, title, description, points, price_paise, duration_minutes, cta_label")
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  const rows = (categories ?? []) as Category[];

  // Same isolated-query, migration-dependent-degrades-gracefully reasoning
  // as the home page's own package section.
  const { data: settingsRow } = await supabase
    .from("site_settings")
    .select("session_packages_visible")
    .maybeSingle();

  const { data: rawPackages } = settingsRow?.session_packages_visible
    ? await supabase
        .from("treatment_category_packages")
        .select(
          "id, title, subtitle, image_url, promises, badge_label, highlight, session_count, price_paise, compare_at_paise, validity_days, therapist_locked, category_id"
        )
        .eq("active", true)
        .eq("visible_on_conditions", true)
        .order("display_order", { ascending: true })
        .order("id", { ascending: true })
    : { data: null };

  // Same isolated-query reasoning as the home page: the dialog's long-form
  // columns are migration-dependent, so losing them must not cost the whole
  // packages section.
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

  const categoryPriceById = new Map(rows.map((c) => [c.id, c.price_paise]));
  const packages = (rawPackages ?? []).map((p) => ({
    ...p,
    ...(detailById.get(p.id) ?? {}),
    category_price_paise: categoryPriceById.get(p.category_id) ?? null,
  }));

  // Only sections that actually render -- packages and the programme grid
  // are both admin-controlled, so a rail item pointing at an absent section
  // would be a dead pill and a skipped stop for the scroll arrow.
  const sectionNavItems: SectionNavItem[] = [
    ...(rows.length > 0 ? [{ id: "programs", label: "Programs", icon: "fa-clipboard-list" }] : []),
    ...(packages.length > 0 ? [{ id: "packages", label: "Packages", icon: "fa-box-open" }] : []),
    { id: "not-sure", label: "Not Sure?", icon: "fa-circle-question" },
  ];

  return (
    <>
      <SectionNav items={sectionNavItems} />

      <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-b from-teal-50/70 to-white py-16">
        <FloatingOrbs />
        <Reveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-800">
            <i className="fa-solid fa-clipboard-list text-teal-600" />
            Programs currently offered
          </span>
          <h1 className="font-display mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl">
            Specialized virtual rehabilitation programs
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            Every program starts with the same 60-minute assessment — what
            changes is the protocol built from it.
          </p>
        </Reveal>
      </div>

      <section id="programs" className="mx-auto max-w-7xl scroll-mt-28 px-4 py-16 sm:px-6 lg:px-8">
        {rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">
            Our programs are being updated — check back shortly.
          </p>
        ) : (
          <ProgramCards programs={rows} packages={packages} />
        )}

      </section>

      <SessionPackages packages={packages} />

      <section id="not-sure" className="mx-auto max-w-7xl scroll-mt-28 px-4 py-16 sm:px-6 lg:px-8">
        <Reveal delay={0.1} className="mt-14 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
          <h2 className="font-display text-xl font-bold text-slate-900">
            Not sure which program fits?
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">
            Book the standard assessment — your therapist will identify the
            right protocol during the session rather than asking you to
            self-diagnose beforehand.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <MotionButton href="/book" variant="primary">
              <i className="fa-solid fa-calendar-check" /> Book an Assessment
            </MotionButton>
            <MotionButton href="/faq" variant="secondary">
              Read common questions
            </MotionButton>
          </div>
        </Reveal>
      </section>
    </>
  );
}
