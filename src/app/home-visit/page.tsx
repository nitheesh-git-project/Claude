import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import HomeVisitPackages, {
  type PublicHomeVisitPackage,
} from "@/components/home/HomeVisitPackages";
import { Reveal, FloatingOrbs } from "@/components/motion/primitives";
import SectionNav, { type SectionNavItem } from "@/components/SectionNav";
import {
  DEFAULT_HOME_VISIT_PAGE_HEADING,
  DEFAULT_HOME_VISIT_PAGE_SUBHEADING,
} from "@/lib/adminSettings";

export const metadata: Metadata = {
  title: "Home Visit Physiotherapy | Dr. Pooja's Physio",
  description:
    "A certified physiotherapist visits you at home — same assessment and recovery plan you would get in clinic, without the travel.",
};

// No per-user content, and createPublicClient() never touches cookies(), so
// this caches and revalidates on a timer instead of hitting Supabase on
// every visit -- same as /conditions and /book.
export const revalidate = 300;

export default async function HomeVisitPage() {
  const supabase = createPublicClient();

  // Each read is its own query so a database that hasn't re-run schema.sql
  // degrades one section rather than blanking the page -- the same
  // migration-tolerance convention as /conditions' package section.
  const { data: settingsRow } = await supabase
    .from("site_settings")
    .select("home_visit_enabled, home_visit_page_heading, home_visit_page_subheading")
    .maybeSingle();

  // The master switch is a hard gate, not just a hidden nav link: without
  // this, the page would still be reachable by typing the URL while the
  // service has no areas, no catalogue and no way to actually deliver.
  if (settingsRow?.home_visit_enabled !== true) {
    notFound();
  }

  const [{ data: rawPackages }, { data: areas }] = await Promise.all([
    supabase
      .from("home_visit_packages")
      .select(
        "id, title, subtitle, image_url, benefits, badge_label, highlight, visit_count, price_paise, compare_at_paise, visit_duration_minutes, validity_days, travel_fee_included, therapist_locked"
      )
      .eq("active", true)
      .eq("visible_on_home_visit_page", true)
      .order("display_order", { ascending: true })
      .order("id", { ascending: true }),

    supabase
      .from("home_visit_areas")
      .select("city, area_name, pincode")
      .eq("active", true)
      .order("city", { ascending: true })
      .order("pincode", { ascending: true }),
  ]);

  // The detail dialog's long-form copy and scheduling rules, read in their
  // own call and merged in -- same migration tolerance as the session
  // packages on / and /conditions: losing these columns costs the dialog
  // those fields, not the whole catalogue.
  const packageIds = (rawPackages ?? []).map((p) => p.id);
  const { data: packageDetail } = packageIds.length
    ? await supabase
        .from("home_visit_packages")
        .select("id, description, terms, min_gap_hours, max_visits_per_week, max_purchases_per_patient")
        .in("id", packageIds)
    : { data: null };
  const detailById = new Map((packageDetail ?? []).map((d) => [d.id, d]));

  const packages = (rawPackages ?? []).map((p) => ({
    ...p,
    ...(detailById.get(p.id) ?? {}),
  })) as PublicHomeVisitPackage[];

  const heading =
    settingsRow?.home_visit_page_heading?.trim() || DEFAULT_HOME_VISIT_PAGE_HEADING;
  const subheading =
    settingsRow?.home_visit_page_subheading?.trim() || DEFAULT_HOME_VISIT_PAGE_SUBHEADING;

  // Grouped by city rather than listed as a flat wall of pincodes -- a
  // visitor is checking "do you cover my area", and the city is what they
  // scan for first.
  const cities = new Map<string, string[]>();
  for (const area of areas ?? []) {
    const list = cities.get(area.city) ?? [];
    list.push(area.pincode);
    cities.set(area.city, list);
  }

  // "Where we visit" only renders when serviceable areas exist, so its rail
  // entry is conditional for the same reason /conditions' are.
  const sectionNavItems: SectionNavItem[] = [
    { id: "choose-visit", label: "Choose Your Visit", icon: "fa-house-medical" },
    ...(cities.size > 0
      ? [{ id: "where-we-visit", label: "Where We Visit", icon: "fa-location-dot" }]
      : []),
    { id: "check-pincode", label: "Check Pincode", icon: "fa-map-pin" },
  ];

  return (
    <>
      <SectionNav items={sectionNavItems} />

      <section className="relative overflow-hidden bg-gradient-to-b from-teal-50/60 to-white py-20">
        <FloatingOrbs />
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <Reveal>
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">
              Home visit
            </span>
            <h1 className="font-display mt-3 text-3xl font-extrabold text-slate-900 sm:text-4xl">
              {heading}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-slate-600">{subheading}</p>
          </Reveal>
        </div>
      </section>

      <section id="choose-visit" className="mx-auto max-w-7xl scroll-mt-28 px-4 py-16 sm:px-6 lg:px-8">
        <Reveal className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">
            Choose your visit
          </h2>
          <p className="mt-3 text-sm text-slate-600">
            Book one visit, or a programme of several with the same therapist each time.
          </p>
        </Reveal>

        {packages.length > 0 ? (
          <HomeVisitPackages packages={packages} />
        ) : (
          <p className="text-center text-sm text-slate-500">
            Home visit packages are being finalised — please check back shortly.
          </p>
        )}
      </section>

      {cities.size > 0 && (
        <section id="where-we-visit" className="scroll-mt-28 border-y border-slate-100 bg-slate-50 py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <Reveal className="mb-8 text-center">
              <h2 className="font-display text-xl font-bold text-slate-900 sm:text-2xl">
                Where we visit
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                We&apos;ll confirm your exact pincode before you pay for anything.
              </p>
            </Reveal>
            <div className="grid gap-6 sm:grid-cols-2">
              {[...cities.entries()].map(([city, pincodes]) => (
                <div key={city} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="font-display text-sm font-bold text-slate-900">{city}</p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    {pincodes.join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section id="check-pincode" className="scroll-mt-28 py-16">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
          <Reveal>
            <h2 className="font-display text-xl font-bold text-slate-900 sm:text-2xl">
              Not sure if we reach you?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Start a booking and enter your pincode — it takes a second, and nothing is charged
              until we&apos;ve confirmed we can get to you.
            </p>
            <Link
              href="/book-home-visit"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-700"
            >
              Check my pincode
              <i className="fa-solid fa-arrow-right text-[11px]" />
            </Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}
