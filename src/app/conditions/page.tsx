import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import {
  Reveal,
  Stagger,
  StaggerItem,
  MotionButton,
  FloatingOrbs,
} from "@/components/motion/primitives";
import SectionNav, { type SectionNavItem } from "@/components/SectionNav";
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

  const categoryPriceById = new Map(rows.map((c) => [c.id, c.price_paise]));
  const packages = (rawPackages ?? []).map((p) => ({
    ...p,
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
          /* Layout intentionally generic: these rows are admin-controlled
             from Site Content, so the design has to hold up for any number
             of categories with any amount of copy. */
          <Stagger className="grid gap-6 md:grid-cols-2">
            {rows.map((cat, i) => {
              const points = Array.isArray(cat.points) ? (cat.points as string[]) : [];
              return (
                <StaggerItem key={cat.id} className="h-full">
                  <div className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition-all hover:-translate-y-1 hover:border-teal-300 hover:shadow-xl hover:shadow-slate-900/5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700">
                          Program {String(i + 1).padStart(2, "0")}
                        </span>
                        <h2 className="font-display mt-1.5 text-xl font-bold text-slate-900">
                          {cat.title}
                        </h2>
                      </div>
                      <div className="shrink-0 rounded-xl bg-slate-50 px-3 py-2 text-right">
                        <p className="font-display text-lg font-bold leading-none text-slate-900">
                          ₹{(cat.price_paise / 100).toLocaleString("en-IN")}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {cat.duration_minutes} min
                        </p>
                      </div>
                    </div>

                    {cat.description && (
                      <p className="mt-3 text-sm leading-relaxed text-slate-600">
                        {cat.description}
                      </p>
                    )}

                    {points.length > 0 && (
                      <ul className="mt-5 space-y-2 border-t border-slate-100 pt-5">
                        {points.map((p) => (
                          <li key={p} className="flex items-start gap-2.5 text-sm text-slate-700">
                            <i className="fa-solid fa-circle-check mt-0.5 shrink-0 text-teal-600" />
                            {p}
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="mt-auto pt-6">
                      <MotionButton
                        href={`/book?category=${cat.id}`}
                        variant="primary"
                        fullWidth
                        className="justify-center text-sm"
                      >
                        {cat.cta_label}
                        <i className="fa-solid fa-arrow-right text-xs" />
                      </MotionButton>
                    </div>
                  </div>
                </StaggerItem>
              );
            })}
          </Stagger>
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
